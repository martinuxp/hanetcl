import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { AppColors } from '@/constants/design-tokens';

// The arrow and its line where a pull opens or closes the notifications
// (Figma 11011:3217 and 11011:3347): the arrow points the way to pull, and
// turns around with a little pop once letting go would do it, while the
// words change from "Desliza…" to "Suelta…".

type Props = {
  pull: SharedValue<number>;
  armed: SharedValue<boolean>;
  threshold: number;
  /** Which way the arrow points before it is armed. */
  direction: 'up' | 'down';
  pullLabel: string;
  releaseLabel: string;
  /**
   * Moves with the pull to stay centered in the gap that opens: by `rate` of
   * whatever is past `after` points. Numbers, not a function, because this
   * runs on the UI thread.
   */
  follow?: { rate: number; after?: number };
  /** Hidden at rest, showing as the gap opens. */
  fade?: boolean;
  style?: StyleProp<ViewStyle>;
};

const POP = { stiffness: 520, damping: 24, mass: 1 };

export function PullHint({ pull, armed, threshold, direction, pullLabel, releaseLabel, follow, fade, style }: Props) {
  const flip = useDerivedValue(() => withSpring(armed.get() ? 1 : 0, POP));

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: fade ? interpolate(pull.get(), [threshold * 0.35, threshold * 0.75], [0, 1], 'clamp') : 1,
    transform: [{ translateY: follow ? Math.max(0, pull.get() - (follow.after ?? 0)) * follow.rate : 0 }],
  }));
  const arrowStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, pull.get() / threshold);
    return {
      transform: [
        { translateY: (direction === 'up' ? -1 : 1) * progress * 4 * (1 - flip.get()) },
        { rotate: `${flip.get() * 180}deg` },
        { scale: 1 + interpolate(flip.get(), [0, 0.5, 1], [0, 0.22, 0.06]) },
      ],
    };
  });
  const pullTextStyle = useAnimatedStyle(() => ({ opacity: 1 - flip.get() }));
  const releaseTextStyle = useAnimatedStyle(() => ({ opacity: flip.get() }));

  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.wrap, style, wrapStyle]}>
      <Animated.View style={arrowStyle}>
        <Ionicons name={direction === 'up' ? 'arrow-up' : 'arrow-down'} size={24} color={AppColors.textSecondary} />
      </Animated.View>
      <View style={styles.labels}>
        <Animated.Text style={[styles.label, pullTextStyle]}>{pullLabel}</Animated.Text>
        <Animated.Text style={[styles.label, styles.overlay, releaseTextStyle]}>{releaseLabel}</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 12,
  },
  labels: {
    alignSelf: 'stretch',
    height: 18,
  },
  label: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
