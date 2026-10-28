import { KeyboardDismissButton, useKeyboardOverlap } from '@/components/ui/keyboard';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const OPEN_MS = 120;
const CLOSE_MS = 100;
const SCRIM = 'rgba(0, 0, 0, 0.55)';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
};

/**
 * Alert-style dialog layer. The native Modal fade is too slow (about 300 ms),
 * so this draws the dimmed backdrop itself, opens in 120 ms and leaves the way
 * it came: the dialog fades and settles from 96 % scale, and shrinks back out.
 * Children lay out the dialog over a transparent, full-screen area.
 */
export function AlertModal({ visible, onRequestClose, children }: Props) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  // While closing, the dialog keeps showing what it showed when it was open,
  // even if the screen already cleared the state that drew it.
  const [shown, setShown] = useState(children);
  if (visible && !mounted) setMounted(true);
  if (visible && shown !== children) setShown(children);
  const progress = useSharedValue(0);
  // A dialog with a field stays above the keyboard, with "Bajar teclado" under it.
  const screen = useRef<React.ComponentRef<typeof View>>(null);
  const keyboard = useKeyboardOverlap(screen);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) });
    } else {
      progress.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.out(Easing.cubic) }, finished => {
        if (finished) scheduleOnRN(setMounted, false);
      });
    }
  }, [progress, visible]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const dialogStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduceMotion ? [] : [{ scale: 0.96 + 0.04 * progress.value }],
  }));

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onRequestClose}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
      <View ref={screen} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.layer, dialogStyle, { paddingBottom: keyboard.overlap }]}>
        <View pointerEvents={visible ? 'box-none' : 'none'} style={styles.layer}>
          {visible ? children : shown}
        </View>
      </Animated.View>
      {visible && keyboard.shown && <KeyboardDismissButton bottom={keyboard.overlap} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: SCRIM,
  },
  layer: {
    flex: 1,
  },
});
