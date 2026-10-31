import { toRgb } from '@/components/events/event-glow';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { NavigationContext } from '@react-navigation/native';
import React, { useContext, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';

// The gradient cards' light and halftone as cloth in the wind, after Apple
// Sports' team cards: the colors drift as before, and folds roll across the
// card, lighting their crests, bending the rows of dots and swelling them
// where the light hits, like print on a waving flag. It is drawn on the GPU in
// one pass, so it stays smooth with a few cards on screen, and it only runs
// while its screen is in front. With Reduce Motion it holds a still frame.

const SOURCE = `
uniform float2 size;
uniform float time;
uniform float3 base;
uniform float3 c0;
uniform float3 c1;
uniform float3 c2;

// The old SVG blobs: a radial fade from opacity to nothing, drifting back and
// forth over its own time.
float3 blob(float3 color, float3 c, float2 p, float2 at, float2 move, float radius, float opacity, float period) {
  float drift = 0.5 - 0.5 * cos(3.14159 * time / period);
  float2 center = (at + move * drift) * size;
  float r = max(size.x, size.y) * radius * (1.0 + 0.12 * drift);
  float t = clamp(length(p - center) / r, 0.0, 1.0);
  return mix(color, c, opacity * (1.0 - t));
}

half4 main(float2 p) {
  float span = max(size.x, size.y);
  // Folds travel across the card on a slight diagonal; a second, faster
  // ripple keeps them from looking like a plain sine.
  float phase = (p.x * 0.9 + p.y * 0.35) / span * 9.0 - time * 1.3;
  float ripple = phase * 2.1 + 1.3 - time * 0.6;
  float wave = sin(phase) + 0.35 * sin(ripple);
  float slope = (cos(phase) + 0.73 * cos(ripple)) / 1.73;
  float2 q = p + float2(wave * 2.0, wave * 5.5);

  float3 color = base;
  color = blob(color, c0, q, float2(0.15, 0.05), float2(0.12, 0.1), 0.75, 0.95, 7.0);
  color = blob(color, c1, q, float2(0.95, 0.75), float2(-0.14, -0.08), 0.7, 0.8, 8.6);
  color = blob(color, c2, q, float2(0.55, 0.45), float2(0.1, -0.12), 0.4, 0.4, 6.2);
  // Light on the side of each fold that faces up, shade on the other.
  color *= 1.0 + 0.18 * slope;
  color += 0.05 * max(slope, 0.0);

  // Halftone: dots on a 45° grid, as print screens them, bigger on the lit
  // folds and fading from the top corner.
  float pitch = 4.95;
  float2 grid = float2(q.x + q.y, q.x - q.y) * 0.70710678;
  float2 cell = (fract(grid / pitch) - 0.5) * pitch;
  float radius = 1.0 + 0.5 * slope;
  float ink = 1.0 - smoothstep(radius - 0.6, radius + 0.6, length(cell));
  float u = clamp((p.x / size.x + p.y / size.y) * 0.5, 0.0, 1.0);
  float fade = u < 0.55 ? mix(0.32, 0.12, u / 0.55) : mix(0.12, 0.04, (u - 0.55) / 0.45);
  color = mix(color, float3(0.976, 0.976, 0.98), ink * fade * (1.0 + 0.45 * slope));
  return half4(half3(color), 1.0);
}
`;

// The Home's light during the anniversary days: the alianzas' colors in
// columns across the top, as the SVG glow draws them, fading into the page
// further down than before, with the same folds and a much fainter halftone.
// It is transparent where the light ends, so the page shows through.
const GLOW_SOURCE = `
uniform float2 size;
uniform float time;
uniform float top;
uniform float reach;
uniform float count;
uniform float3 c0;
uniform float3 c1;
uniform float3 c2;
uniform float3 c3;

float3 pick(float index) {
  return index < 0.5 ? c0 : index < 1.5 ? c1 : index < 2.5 ? c2 : c3;
}

half4 main(float2 p) {
  float span = size.x;
  // Long, slow folds: the whole width is a flag, not a card.
  float phase = (p.x * 0.8 + (p.y - top) * 0.45) / span * 5.0 - time * 0.9;
  float ripple = phase * 1.9 + 0.7 - time * 0.45;
  float wave = sin(phase) + 0.3 * sin(ripple);
  float slope = (cos(phase) + 0.57 * cos(ripple)) / 1.57;
  float2 q = p + float2(wave * 3.0, wave * 9.0);

  // Each alianza's column, an ellipse centered near the page's top; above the
  // page (what an iOS pull shows) a band of all of them.
  float center = top + reach * 0.1;
  float3 color = float3(0.0);
  float weight = 0.0;
  float light = 0.0;
  for (int i = 0; i < 4; i++) {
    float index = float(i);
    if (index >= count) break;
    float x = count < 1.5 ? 0.5 : (index + 0.5) / count;
    float2 d = (q - float2(x * size.x, center)) / float2(size.x * 0.6, reach * 0.9);
    float w = clamp(1.0 - length(d), 0.0, 1.0);
    w = w * w * (3.0 - 2.0 * w);
    color += pick(index) * w;
    weight += w;
    light = max(light, w);
  }
  color = weight > 0.0 ? color / weight : c0;
  if (q.y < center) {
    float band = clamp(q.x / size.x * count - 0.5, 0.0, max(0.0, count - 1.0));
    float3 above = mix(pick(floor(band)), pick(min(count - 1.0, floor(band) + 1.0)), fract(band));
    float up = clamp((center - q.y) / (reach * 0.3), 0.0, 1.0);
    color = mix(color, above, up);
    light = max(light, mix(light, 0.6, up));
  }

  color *= 1.0 + 0.14 * slope;
  color += 0.03 * max(slope, 0.0);

  // A faint halftone that rides the folds.
  float pitch = 6.0;
  float2 grid = float2(q.x + q.y, q.x - q.y) * 0.70710678;
  float2 cell = (fract(grid / pitch) - 0.5) * pitch;
  float radius = 1.0 + 0.45 * slope;
  float ink = 1.0 - smoothstep(radius - 0.6, radius + 0.6, length(cell));
  color = mix(color, float3(0.976, 0.976, 0.98), ink * 0.16 * (1.0 + 0.5 * slope));

  // Down the page the light fades into it.
  float down = clamp((p.y - top) / reach, 0.0, 1.0);
  float alpha = light * 0.62 * (1.0 - down * down * (3.0 - 2.0 * down));
  return half4(half3(color * alpha), alpha);
}
`;

const effect = Skia.RuntimeEffect.Make(SOURCE);
const glowEffect = Skia.RuntimeEffect.Make(GLOW_SOURCE);

function rgb(hex: string) {
  return toRgb(hex).map(channel => channel / 255);
}

/** Whether the screen this sits on is the one in front (always, outside a navigator). */
function useScreenFocused() {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

export const FLAG_AVAILABLE = !!effect;
export const FLAG_GLOW_AVAILABLE = !!glowEffect;

/** Seconds of wind, from a random point, that pass only while the screen is in front. */
function useWindTime() {
  const reduceMotion = useReducedMotion();
  const focused = useScreenFocused();
  // Each surface starts somewhere else in the wind, so a list of them doesn't wave in step.
  const [start] = useState(() => Math.random() * 40);
  const time = useSharedValue(start);
  const clock = useFrameCallback(frame => {
    time.value += (frame.timeSincePreviousFrame ?? 16) / 1000;
  }, false);
  useEffect(() => {
    clock.setActive(focused && !reduceMotion);
  }, [clock, focused, reduceMotion]);
  return time;
}

/** `colors`: the three blobs' colors (hex), over `base`. */
export function FlagSurface({ base, colors, width, height }: { base: string; colors: string[]; width: number; height: number }) {
  const time = useWindTime();

  const [c0, c1, c2] = [0, 1, 2].map(index => rgb(colors[index] ?? colors[0] ?? base));
  const baseRgb = rgb(base);
  const uniforms = useDerivedValue(() => ({ size: [width, height], time: time.value, base: baseRgb, c0, c1, c2 }));

  if (!effect) return null;
  return (
    <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height }]}>
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

/**
 * The Home's waving light: up to four colors (hex) in columns. `top` is where
 * the page starts inside it (the room above is for pulling down) and `reach`
 * how far down the page the light goes.
 */
export function FlagGlow({ colors, width, top, reach }: { colors: string[]; width: number; top: number; reach: number }) {
  const time = useWindTime();
  const fills = (colors.length ? colors : ['#EF2274']).slice(0, 4);
  const [c0, c1, c2, c3] = [0, 1, 2, 3].map(index => rgb(fills[index] ?? fills[0]));
  const count = fills.length;
  const height = top + reach;
  const uniforms = useDerivedValue(() => ({ size: [width, height], time: time.value, top, reach, count, c0, c1, c2, c3 }));

  if (!glowEffect) return null;
  return (
    <Canvas pointerEvents="none" style={{ width, height }}>
      <Fill>
        <Shader source={glowEffect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
