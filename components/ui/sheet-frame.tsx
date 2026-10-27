import { useRoute, useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Keyboard, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { SPRING_MOMENTUM, project, rubberband } from '@/constants/motion';
import { sheetDetents } from '@/constants/sheets';

const OPEN_MS = 280;
const CLOSE_MS = 220;
const EASE = Easing.bezier(0.32, 0.72, 0, 1);
// The space left above a sheet at full height, like iOS's sheet.
const TOP_GAP = 28;
// From this width the web shows a centered card instead of a bottom sheet.
const CARD_MIN_WIDTH = 720;
const CARD_MAX_WIDTH = 640;
const CARD_MARGIN = 48;
// How far a card travels while it fades in and out.
const CARD_RISE = 24;

/**
 * Lets the screen inside a HaNet sheet hold the sheet open (unsaved
 * changes). While `blocked` is on, dragging, the backdrop, Escape and the
 * back button settle the sheet back and bump `blockedAttempts` instead of
 * closing; `close` then leaves for real once the screen allows it.
 */
type SheetGuard = {
  setBlocked: (blocked: boolean) => void;
  /** Counts the closes that were held back, so the screen can ask each time. */
  blockedAttempts: number;
  close: () => void;
};

const SheetGuardContext = createContext<SheetGuard | null>(null);

/** The surrounding HaNet sheet, or null on iOS (the native sheet is used there). */
export function useSheetGuard() {
  return useContext(SheetGuardContext);
}

/**
 * HaNet's own sheet for Android and the web, where the native form sheet
 * can't be used (on Android it opens with no height in react-native-screens
 * 4.26; on the web Expo Router draws it as a whole page). The screen is a
 * transparent modal and this draws the sheet: dimmed backdrop and a rounded
 * panel that slides up to the screen's first height, can be dragged between
 * its heights from the grabber, and leaves the way it came. On a wide web
 * window it is a centered card instead.
 */
function HanetSheet({ backgroundColor, children }: { backgroundColor: string; children: React.ReactNode }) {
  const router = useRouter();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const card = Platform.OS === 'web' && windowWidth >= CARD_MIN_WIDTH;

  const detents = sheetDetents(route.name);
  const panelHeight = card
    ? Math.min(Math.max(...detents) * windowHeight, windowHeight - CARD_MARGIN * 2)
    : Math.min(Math.max(...detents) * windowHeight, windowHeight - insets.top - TOP_GAP);
  // Where the panel rests at each height, measured down from fully open.
  const stops = useMemo(
    () => (card ? [0] : detents.map(detent => Math.max(0, panelHeight - detent * windowHeight))),
    [card, detents, panelHeight, windowHeight],
  );
  // Out of sight: below the screen, or for a card, faded a little lower.
  const hidden = card ? CARD_RISE : panelHeight;

  const offset = useSharedValue(reduceMotion ? stops[0] : hidden);
  const closing = useSharedValue(false);
  const blocked = useSharedValue(false);
  const [blockedAttempts, setBlockedAttempts] = useState(0);
  // The height it rests at, kept across window resizes on the web.
  const stopIndex = useSharedValue(0);

  const goBack = useCallback(() => router.back(), [router]);

  useEffect(() => {
    if (!reduceMotion) offset.set(withTiming(stops[0], { duration: OPEN_MS, easing: EASE }));
    // Only on opening; resizing is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      return;
    }
    if (!closing.get()) offset.set(stops[Math.min(stopIndex.get(), stops.length - 1)]);
    // The resting place moves with the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelHeight, card]);

  const notifyBlocked = useCallback(() => setBlockedAttempts(count => count + 1), []);

  const leave = useCallback(() => {
    if (closing.get()) return;
    closing.set(true);
    if (reduceMotion) {
      goBack();
      return;
    }
    offset.set(withTiming(hidden, { duration: CLOSE_MS, easing: EASE }, finished => {
      if (finished) scheduleOnRN(goBack);
    }));
  }, [closing, goBack, hidden, offset, reduceMotion]);

  // Closing on request: held open while the screen has something unsaved.
  const close = useCallback(() => {
    if (blocked.get()) {
      offset.set(withSpring(stops[stopIndex.get()] ?? 0, SPRING_MOMENTUM));
      notifyBlocked();
      return;
    }
    leave();
  }, [blocked, leave, notifyBlocked, offset, stopIndex, stops]);

  const guard = useMemo<SheetGuard>(() => ({
    setBlocked: value => blocked.set(value),
    blockedAttempts,
    close: leave,
  }), [blocked, blockedAttempts, leave]);

  // The system back button leaves the way the sheet came in.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close]);

  // Typing at a lower height would leave the field under the keyboard: like
  // the iOS sheet, it goes up to its full height.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      const top = stops.length - 1;
      if (closing.get() || stopIndex.get() === top) return;
      stopIndex.set(top);
      offset.set(withSpring(stops[top], SPRING_MOMENTUM));
    });
    return () => subscription.remove();
  }, [closing, offset, stopIndex, stops]);

  // On the web, Escape does what the back button does on Android.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) close();
    };
    // Captured first: a focused field keeps Escape to itself.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  // Grabbed while it is still moving (opening, or settling back), the sheet
  // carries on from where it is on screen instead of jumping to the finger.
  const grabbedAt = useSharedValue(0);
  const drag = Gesture.Pan()
    .enabled(!card)
    .activeOffsetY([-8, 8])
    .onStart(() => {
      grabbedAt.set(offset.get());
    })
    .onUpdate(event => {
      if (closing.get()) return;
      const y = grabbedAt.get() + event.translationY;
      offset.set(y >= 0 ? y : rubberband(y, windowHeight));
    })
    .onEnd(event => {
      if (closing.get()) return;
      const resting = offset.get() + project(event.velocityY);
      const lowest = stops[0];
      // Thrown well past its lowest height, it closes (or asks first).
      if (resting > lowest + (panelHeight - lowest) * 0.3) {
        if (blocked.get()) {
          offset.set(withSpring(stops[stopIndex.get()], { ...SPRING_MOMENTUM, velocity: event.velocityY }));
          scheduleOnRN(notifyBlocked);
          return;
        }
        closing.set(true);
        // The throw carries on at the finger's speed.
        offset.set(withSpring(hidden, { ...SPRING_MOMENTUM, velocity: event.velocityY, overshootClamping: true }, finished => {
          if (finished) scheduleOnRN(goBack);
        }));
        return;
      }
      // Otherwise it settles at the height nearest to where the throw would land.
      let nearest = 0;
      for (let index = 1; index < stops.length; index++) {
        if (Math.abs(stops[index] - resting) < Math.abs(stops[nearest] - resting)) nearest = index;
      }
      stopIndex.set(nearest);
      offset.set(withSpring(stops[nearest], { ...SPRING_MOMENTUM, velocity: event.velocityY }));
    });

  const panelStyle = useAnimatedStyle(() => (card
    ? { opacity: interpolate(offset.get(), [0, hidden], [1, 0], 'clamp'), transform: [{ translateY: offset.get() }] }
    : { transform: [{ translateY: offset.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.get(), [stops[0], hidden], [1, 0], 'clamp'),
  }));

  return (
    <WebClip>
    <View style={[styles.root, card && styles.cardRoot]}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={close} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.panel,
          card ? styles.card : styles.sheet,
          { backgroundColor, height: panelHeight },
          panelStyle,
        ]}
      >
        <SheetGuardContext.Provider value={guard}>{children}</SheetGuardContext.Provider>
        {!card && (
          <GestureDetector gesture={drag}>
            <View accessible accessibilityRole="button" accessibilityLabel="Cerrar hoja" onAccessibilityTap={close} style={styles.grabberZone}>
              <View style={styles.grabber} />
            </View>
          </GestureDetector>
        )}
      </Animated.View>
    </View>
    </WebClip>
  );
}

/**
 * On the web a field that focuses itself while the sheet is still below the
 * screen (or rests at a lower height) scrolls the whole page to reach it.
 * Clipped content can't be scrolled to, and React Native Web drops
 * `overflow: clip`, so a plain element does it.
 */
function WebClip({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return children;
  return <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'clip' }}>{children}</div>;
}

/** Wraps a sheet screen so it is a HaNet sheet on Android and the web; iOS keeps its native sheet. */
export function withSheetFrame<Props extends object>(Screen: React.ComponentType<Props>, backgroundColor: string) {
  if (Platform.OS === 'ios') return Screen;

  return function SheetScreen(props: Props) {
    return (
      <HanetSheet backgroundColor={backgroundColor}>
        <Screen {...props} />
      </HanetSheet>
    );
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cardRoot: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: CARD_MARGIN,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  panel: {
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  card: {
    width: '100%',
    maxWidth: CARD_MAX_WIDTH,
    borderRadius: 32,
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
