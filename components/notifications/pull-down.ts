import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedScrollHandler, useSharedValue, withSpring } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SPRING_SMOOTH, rubberband } from '@/constants/motion';
import { pageScrolls } from '@/hooks/use-document-scroll';

// Pulling a list past one of its ends, like turning on Instagram's vanish
// mode: one firm tap of the haptics when it crosses `threshold` ("armed"), a
// light one if it is pulled back, and letting go while armed calls
// `onTrigger`.
//   edge "end": past the bottom, pulling up (the Home → notifications)
//   edge "start": past the top, pulling down (notifications → the Home)
//
// iOS keeps its own bounce: how far it went is read from the scroll offset.
// Android lists stop at their ends, so a pan running alongside the list's
// own scroll measures the pull instead (`pull`, which the screen applies as
// a translation, `translates`). Phone browsers do the same with the finger's
// touches (their lists don't report a bounce, and on the phone layout the
// page scrolls instead, see hooks/use-document-scroll.ts); a mouse still
// opens it with the buttons.

export type PullEdge = 'start' | 'end';

export type PullDown = {
  /** How far past the edge, in points (always positive). */
  pull: SharedValue<number>;
  /** Past the threshold: letting go triggers. */
  armed: SharedValue<boolean>;
  /** For the list's onScroll (iOS reads the bounce from it). */
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  /** Runs with the list's own scroll; it only acts on Android. */
  gesture: ReturnType<typeof Gesture.Simultaneous>;
  /** Android moves the screen itself; on iOS the list bounces. */
  translates: boolean;
};

const IOS = Platform.OS === 'ios';
const ANDROID = Platform.OS === 'android';
const WEB = Platform.OS === 'web';
// A touch decides whether it is a pull once it has moved this far.
const SLOP = 10;
// How far an Android pull can stretch before it barely follows.
const STRETCH = 420;

function armHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function disarmHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

type Options = { edge: PullEdge; threshold: number; enabled: boolean; onTrigger: () => void };

export function usePullDown({ edge, threshold, enabled, onTrigger }: Options): PullDown {
  const pull = useSharedValue(0);
  const armed = useSharedValue(false);
  const dragging = useSharedValue(false);
  // How far the list is from the edge being pulled (0 = at it).
  const fromEdge = useSharedValue(0);
  // Android: where the finger was when the list reached the edge.
  const baseline = useSharedValue<number | null>(null);
  const sign = edge === 'start' ? 1 : -1;

  const track = (distance: number) => {
    'worklet';
    if (!enabled) return;
    if (!armed.get() && distance >= threshold) {
      armed.set(true);
      scheduleOnRN(armHaptic);
    } else if (armed.get() && distance < threshold * 0.85) {
      armed.set(false);
      scheduleOnRN(disarmHaptic);
    }
  };

  const release = () => {
    'worklet';
    const fire = armed.get() && enabled;
    armed.set(false);
    if (fire) scheduleOnRN(onTrigger);
    return fire;
  };

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => { dragging.set(true); },
    onScroll: event => {
      const y = event.contentOffset.y;
      const end = Math.max(0, event.contentSize.height - event.layoutMeasurement.height);
      // Past the edge is negative here; 0 at it.
      const offset = edge === 'start' ? y : end - y;
      fromEdge.set(Math.max(0, offset));
      if (!IOS) return;
      const distance = Math.max(0, -offset);
      pull.set(distance);
      if (dragging.get()) track(distance);
    },
    onEndDrag: () => {
      dragging.set(false);
      if (IOS) release();
    },
  }, [edge, enabled, threshold, onTrigger]);

  // Phone browsers: the same as Android's pan, from the touches themselves.
  useEffect(() => {
    if (!WEB || !enabled || typeof window === 'undefined') return;
    let startX = 0;
    let startY = 0;
    // null: not decided yet; then whether this touch is a vertical drag.
    let vertical: boolean | null = null;
    let at: number | null = null;
    const reset = () => {
      at = null;
      vertical = null;
    };
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        vertical = false;
        return;
      }
      reset();
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || vertical === false) return;
      if (vertical === null) {
        const dx = Math.abs(touch.clientX - startX);
        const dy = Math.abs(touch.clientY - startY);
        if (dx < SLOP && dy < SLOP) return;
        vertical = dy > dx;
        if (!vertical) return;
      }
      // Still scrolling toward the edge: the pull starts once it is there.
      // (When the page scrolls for the list, the page tells where it is.)
      const gap = pageScrolls()
        ? edge === 'start'
          ? window.scrollY
          : document.documentElement.scrollHeight - window.innerHeight - window.scrollY
        : fromEdge.get();
      if (gap > 0.5) {
        at = null;
        if (pull.get() > 0) pull.set(0);
        return;
      }
      if (at === null) at = touch.clientY;
      const distance = Math.max(0, rubberband((touch.clientY - at) * sign, STRETCH));
      pull.set(distance);
      track(distance);
    };
    const onEnd = () => {
      if (vertical && !release()) pull.set(withSpring(0, SPRING_SMOOTH));
      reset();
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
    // The shared values and worklets are stable; `track` and `release` read `enabled`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge, enabled, sign, threshold, onTrigger]);

  // The web has no native gestures to join: nothing attaches to the list there.
  const native = Gesture.Native().enabled(!WEB);
  const pan = Gesture.Pan()
    .enabled(ANDROID && enabled)
    .activeOffsetY(edge === 'start' ? 10 : -10)
    .failOffsetY(edge === 'start' ? -10 : 10)
    .onStart(() => {
      baseline.set(null);
    })
    .onUpdate(event => {
      // Still scrolling toward the edge: the pull starts once it is there.
      if (fromEdge.get() > 0.5) {
        baseline.set(null);
        return;
      }
      if (baseline.get() === null) baseline.set(event.translationY);
      const travel = (event.translationY - (baseline.get() ?? 0)) * sign;
      const distance = Math.max(0, rubberband(travel, STRETCH));
      pull.set(distance);
      track(distance);
    })
    .onFinalize(() => {
      if (!ANDROID) return;
      // When it fires, the screen takes the pull with it; otherwise it settles back.
      if (!release()) pull.set(withSpring(0, SPRING_SMOOTH));
    });

  return { pull, armed, onScroll, gesture: Gesture.Simultaneous(pan, native), translates: ANDROID || WEB };
}
