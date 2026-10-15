import { AppColors } from '@/constants/design-tokens';
import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

// The soft colored light at the top and the end of an event's page, after the
// "Gradient TOP" and "Gradient FINAL" of the earlier event design: blurred
// blots that drift slowly. Their colors come from the event's cover
// (functions/events.js reads them), tuned to sit with HaNet's rose accent.

type Blot = { color: string; cx: number; cy: number; rx: number; ry: number; opacity: number; dx: number; dy: number; ms: number };

const FRAME_WIDTH = 412;
const FRAME_HEIGHT = 520;
// Room past the page's edges, so pulling it beyond them (iOS bounce) keeps the light.
const OVERSCROLL = 600;

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const value = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(rgb: Rgb) {
  return `#${rgb.map(channel => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('')}`;
}

function toHsl([red, green, blue]: Rgb) {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value));

/** A cover color brought into a range of strength and lightness, then warmed with the accent. */
function tune(hex: string, saturation: [number, number], lightness: [number, number], accent = 0.18) {
  const { h, s, l } = toHsl(toRgb(hex));
  const tuned = fromHsl(h, clamp(s, saturation), clamp(l, lightness));
  const rose = toRgb(AppColors.accent);
  return toHex(tuned.map((channel, index) => channel * (1 - accent) + rose[index] * accent) as Rgb);
}

/** The blots on the 412-wide design frame, colored from the cover when it has color. */
function blotsFor(colors: string[]): Blot[] {
  // Grey covers say nothing about color: those keep HaNet's own light.
  const vivid = colors.filter(color => toHsl(toRgb(color)).s >= 0.15);
  const [first, second, third] = vivid;
  const top = first ? tune(first, [0.45, 0.85], [0.3, 0.45]) : '#832768';
  const center = first ? tune(first, [0.6, 0.9], [0.42, 0.55], 0.55) : '#D32B4C';
  const light = second ? tune(second, [0.3, 0.7], [0.68, 0.8], 0.12) : '#FEBABC';
  const sideSource = third ?? second;
  const side = sideSource ? tune(sideSource, [0.12, 0.35], [0.4, 0.55], 0.1) : '#957D79';
  const deep = first ? tune(first, [0.4, 0.6], [0.05, 0.08], 0) : '#11000F';
  return [
    // Above the frame: what pulling the page past its edge reveals.
    { color: top, cx: 206, cy: -150, rx: 320, ry: 280, opacity: 0.8, dx: 14, dy: 10, ms: 12000 },
    { color: top, cx: 220, cy: 40, rx: 190, ry: 220, opacity: 0.95, dx: 26, dy: 18, ms: 9000 },
    { color: center, cx: 255, cy: 190, rx: 160, ry: 170, opacity: 0.9, dx: -30, dy: 22, ms: 7600 },
    { color: light, cx: 420, cy: 270, rx: 90, ry: 170, opacity: 0.5, dx: -18, dy: -26, ms: 8400 },
    { color: side, cx: 30, cy: 210, rx: 120, ry: 160, opacity: 0.45, dx: 22, dy: -20, ms: 10200 },
    { color: deep, cx: 40, cy: 30, rx: 130, ry: 150, opacity: 0.7, dx: 16, dy: 12, ms: 11000 },
  ];
}

function BlotView({ blot, id, scale, flip, offset }: { blot: Blot; id: string; scale: number; flip: boolean; offset: number }) {
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
  const top = offset + (flip ? FRAME_HEIGHT - blot.cy : blot.cy) * scale - height / 2;

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
export function EventGlow({ position, colors = [] }: { position: 'top' | 'bottom'; colors?: string[] }) {
  const { width } = useWindowDimensions();
  const scale = width / FRAME_WIDTH;
  const flip = position === 'bottom';
  // Past the end only iOS bounces; on web the extra room would add scrolling.
  const extra = flip ? (Platform.OS === 'ios' ? OVERSCROLL : 0) : OVERSCROLL;
  const blots = useMemo(() => blotsFor(colors), [colors]);
  return (
    // A new set of colors (the cover read for the first time) fades in.
    <Animated.View
      key={colors.join()}
      entering={FadeIn.duration(700)}
      pointerEvents="none"
      style={[styles.glow, flip ? { bottom: -extra } : { top: -extra }, { height: FRAME_HEIGHT * scale + extra, width }]}
    >
      {blots.map((blot, index) => (
        <BlotView key={index} blot={blot} id={`${position}-blot-${index}`} scale={scale} flip={flip} offset={flip ? 0 : extra} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  blot: {
    position: 'absolute',
  },
});
