import { useRouter } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { SPRING_MOMENTUM, project, rubberband } from '@/constants/motion';

const OPEN_MS = 280;
const CLOSE_MS = 220;

/**
 * Android stand-in for the native form sheet, which opens with no height
 * there (react-native-screens 4.26). The screen is a transparent modal and
 * this draws the sheet itself: dimmed backdrop and a rounded panel that slides
 * up, leaves the same way, and can be dragged down from its grabber.
 */
function AndroidSheet({ backgroundColor, children }: { backgroundColor: string; children: React.ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(reduceMotion ? 0 : windowHeight);
  const closing = useSharedValue(false);

  const goBack = useCallback(() => router.back(), [router]);

  useEffect(() => {
    if (!reduceMotion) offset.set(withTiming(0, { duration: OPEN_MS, easing: Easing.bezier(0.32, 0.72, 0, 1) }));
  }, [offset, reduceMotion]);

  const close = useCallback(() => {
    if (closing.get()) return;
    closing.set(true);
    if (reduceMotion) {
      goBack();
      return;
    }
    offset.set(withTiming(windowHeight, { duration: CLOSE_MS, easing: Easing.bezier(0.32, 0.72, 0, 1) }, finished => {
      if (finished) scheduleOnRN(goBack);
    }));
  }, [closing, goBack, offset, reduceMotion, windowHeight]);

  // The system back button leaves the way the sheet came in.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close]);

  const drag = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate(event => {
      if (closing.get()) return;
      const y = event.translationY;
      offset.set(y >= 0 ? y : rubberband(y, windowHeight));
    })
    .onEnd(event => {
      if (closing.get()) return;
      const resting = offset.get() + project(event.velocityY);
      if (resting > windowHeight * 0.3) {
        closing.set(true);
        // The throw carries on at the finger's speed.
        offset.set(withSpring(windowHeight, { ...SPRING_MOMENTUM, velocity: event.velocityY, overshootClamping: true }, finished => {
          if (finished) scheduleOnRN(goBack);
        }));
      } else {
        offset.set(withSpring(0, { ...SPRING_MOMENTUM, velocity: event.velocityY }));
      }
    });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.get(), [0, windowHeight], [1, 0], 'clamp'),
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={close} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.panel, { backgroundColor, marginTop: insets.top + 28 }, panelStyle]}>
        {children}
        <GestureDetector gesture={drag}>
          <View accessible accessibilityRole="button" accessibilityLabel="Cerrar hoja" onAccessibilityTap={close} style={styles.grabberZone}>
            <View style={styles.grabber} />
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

/** Wraps a sheet screen so it also looks like a sheet on Android. */
export function withSheetFrame<Props extends object>(Screen: React.ComponentType<Props>, backgroundColor: string) {
  if (Platform.OS !== 'android') return Screen;

  return function SheetScreen(props: Props) {
    return (
      <AndroidSheet backgroundColor={backgroundColor}>
        <Screen {...props} />
      </AndroidSheet>
    );
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  panel: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderCurve: 'continuous',
  },
  // A strip along the top edge takes the drag, leaving the form's own
  // scrolling and taps untouched.
  grabberZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 28,
    alignItems: 'center',
    paddingTop: 8,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128, 128, 128, 0.55)',
  },
});
