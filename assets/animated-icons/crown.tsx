import { AppColors } from '@/constants/design-tokens';
import React, { useEffect } from 'react';
import Svg, { Path } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { AnimatedIconProps } from './sparks';

// Lucide's crown and zap, in the stroke of the other icons. Animated, the
// crown tips side to side now and then (the leader's), and the bolt flickers
// (a flash test).

export function CrownIcon({ size = 28, color = AppColors.textOnLight, style, animated = false }: AnimatedIconProps) {
  const reduceMotion = useReducedMotion();
  const tilt = useSharedValue(0);
  useEffect(() => {
    if (!animated || reduceMotion) return;
    const swing = { duration: 160, easing: Easing.inOut(Easing.quad) };
    tilt.value = withRepeat(
      withSequence(withDelay(2400, withTiming(-1, swing)), withTiming(1, swing), withTiming(-0.5, swing), withTiming(0, swing)),
      -1,
    );
  }, [animated, reduceMotion, tilt]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.abs(tilt.value) * 2 }, { rotate: `${tilt.value * 12}deg` }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, style, motion]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
        <Path d="M5 21h14" />
      </Svg>
    </Animated.View>
  );
}

export function BoltIcon({ size = 28, color = AppColors.textOnLight, style, animated = false }: AnimatedIconProps) {
  const reduceMotion = useReducedMotion();
  const flicker = useSharedValue(1);
  useEffect(() => {
    if (!animated || reduceMotion) return;
    const quick = { duration: 70 };
    flicker.value = withRepeat(
      withSequence(withDelay(1800, withTiming(0.25, quick)), withTiming(1, quick), withTiming(0.4, quick), withTiming(1, quick)),
      -1,
    );
  }, [animated, flicker, reduceMotion]);
  const motion = useAnimatedStyle(() => ({ opacity: flicker.value }));
  return (
    <Animated.View style={[{ width: size, height: size }, style, motion]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
      </Svg>
    </Animated.View>
  );
}
