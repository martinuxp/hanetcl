import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Android stand-in for the native form sheet, which opens with no height
 * there (react-native-screens 4.26). The screen is a transparent modal and
 * this draws the sheet itself: dimmed backdrop, rounded panel sliding up.
 */
function AndroidSheet({ backgroundColor, children }: { backgroundColor: string; children: React.ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  return (
    <View style={styles.root}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => router.back()} style={styles.backdrop} />
      <Animated.View
        entering={reduceMotion ? undefined : SlideInDown.duration(280).easing(Easing.bezier(0.32, 0.72, 0, 1))}
        style={[styles.panel, { backgroundColor, marginTop: insets.top + 28 }]}
      >
        <View style={styles.grabber} />
        {children}
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
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  panel: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderCurve: 'continuous',
  },
  grabber: {
    position: 'absolute',
    top: 8,
    zIndex: 1,
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128, 128, 128, 0.55)',
  },
});
