import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

// The soft colored light at the top and the end of an event's page, after the
// "Gradient TOP" and "Gradient FINAL" of the earlier event design: blurred
// blots of rose, purple, light pink and taupe that drift slowly.

/** The blots on the 412-wide design frame: color, center, radii, strength and drift. */
const BLOTS = [
  { color: '#832768', cx: 220, cy: 40, rx: 190, ry: 220, opacity: 0.95, dx: 26, dy: 18, ms: 9000 },
  { color: '#D32B4C', cx: 255, cy: 190, rx: 160, ry: 170, opacity: 0.9, dx: -30, dy: 22, ms: 7600 },
  { color: '#FEBABC', cx: 420, cy: 270, rx: 90, ry: 170, opacity: 0.5, dx: -18, dy: -26, ms: 8400 },
  { color: '#957D79', cx: 30, cy: 210, rx: 120, ry: 160, opacity: 0.45, dx: 22, dy: -20, ms: 10200 },
  { color: '#11000F', cx: 40, cy: 30, rx: 130, ry: 150, opacity: 0.7, dx: 16, dy: 12, ms: 11000 },
] as const;

const FRAME_WIDTH = 412;
const FRAME_HEIGHT = 520;

function Blot({ blot, index, scale, flip }: { blot: (typeof BLOTS)[number]; index: number; scale: number; flip: boolean }) {
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    drift.value = withRepeat(withTiming(1, { duration: blot.ms, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [blot.ms, drift, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift.value * blot.dx * scale },
      { translateY: drift.value * blot.dy * scale * (flip ? -1 : 1) },
      { scale: 1 + drift.value * 0.08 },
    ],
  }));

  const width = blot.rx * 2 * scale;
  const height = blot.ry * 2 * scale;
  const top = (flip ? FRAME_HEIGHT - blot.cy : blot.cy) * scale - height / 2;
  const id = `blot-${index}`;

  return (
    <Animated.View style={[styles.blot, { left: blot.cx * scale - width / 2, top, width, height }, style]}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={blot.color} stopOpacity={blot.opacity} />
            <Stop offset="0.55" stopColor={blot.color} stopOpacity={blot.opacity * 0.45} />
            <Stop offset="1" stopColor={blot.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Sits behind the content of a scroll view, at its top or its end. */
export function EventGlow({ position }: { position: 'top' | 'bottom' }) {
  const { width } = useWindowDimensions();
  const scale = width / FRAME_WIDTH;
  const flip = position === 'bottom';
  return (
    <View pointerEvents="none" style={[styles.glow, flip ? styles.bottom : styles.top, { height: FRAME_HEIGHT * scale, width }]}>
      {BLOTS.map((blot, index) => <Blot key={index} blot={blot} index={index} scale={scale} flip={flip} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  top: {
    top: 0,
  },
  bottom: {
    bottom: 0,
  },
  blot: {
    position: 'absolute',
  },
});
