import { fromHsl, toHex, toHsl, toRgb } from '@/components/events/event-glow';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

// A card lit from inside by its alianzas' colors, after Apple Sports' team
// cards: a deep base and soft blobs that drift slowly. The colors are pushed
// dark enough for white text, so it always reads the same way. Kept for the
// cards that carry points or results; the page itself stays dark.

/** The color at a given lightness, saturated enough to look like itself (greys stay grey). */
export function shade(hex: string, lightness: number) {
  const { h, s } = toHsl(toRgb(hex));
  return toHex(fromHsl(h, s < 0.1 ? s : Math.min(0.95, Math.max(0.5, s)), lightness));
}

type Blob = { color: string; x: number; y: number; r: number; opacity: number; dx: number; dy: number; ms: number };

function blobsFor(colors: string[]): Blob[] {
  const first = colors[0];
  const second = colors[1] ?? first;
  return [
    { color: shade(first, 0.5), x: 0.15, y: 0.05, r: 0.75, opacity: 0.95, dx: 0.12, dy: 0.1, ms: 7000 },
    { color: shade(second, colors[1] ? 0.48 : 0.66), x: 0.95, y: 0.75, r: 0.7, opacity: 0.8, dx: -0.14, dy: -0.08, ms: 8600 },
    { color: shade(first, 0.62), x: 0.55, y: 0.45, r: 0.4, opacity: 0.4, dx: 0.1, dy: -0.12, ms: 6200 },
  ];
}

function BlobView({ blob, id, width, height }: { blob: Blob; id: string; width: number; height: number }) {
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    drift.value = withRepeat(withTiming(1, { duration: blob.ms, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [blob.ms, drift, reduceMotion]);

  const size = Math.max(width, height) * blob.r * 2;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift.value * blob.dx * width },
      { translateY: drift.value * blob.dy * height },
      { scale: 1 + drift.value * 0.12 },
    ],
  }));

  return (
    <Animated.View style={[styles.blob, { left: blob.x * width - size / 2, top: blob.y * height - size / 2, width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={blob.color} stopOpacity={blob.opacity} />
            <Stop offset="0.6" stopColor={blob.color} stopOpacity={blob.opacity * 0.4} />
            <Stop offset="1" stopColor={blob.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={size / 2} cy={size / 2} rx={size / 2} ry={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

let nextId = 0;

/** `colors` are fills (hex), the first one leads. */
export function GradientCard({ colors, style, children }: { colors: string[]; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [prefix] = useState(() => `gradient-card-${nextId++}`);
  const key = colors.join();
  const blobs = blobsFor(colors.length ? colors : [AppColors.accent]);
  const base = shade(colors[0] ?? AppColors.accent, 0.2);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(current => (current && Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1 ? current : { width, height }));
  };

  return (
    <View onLayout={onLayout} style={[styles.card, { backgroundColor: base }, style]}>
      {size && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {blobs.map((blob, index) => (
            <BlobView key={`${key}-${index}`} blob={blob} id={`${prefix}-${index}`} width={size.width} height={size.height} />
          ))}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
  },
  blob: {
    position: 'absolute',
  },
});
