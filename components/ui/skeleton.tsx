import { AppColors, AppRadii } from '@/constants/design-tokens';
import React, { createContext, useContext, useEffect } from 'react';
import { View } from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

// A slow breath, so waiting reads as calm rather than busy.
const PULSE_MS = 900;
const LOW = 0.45;

const PulseContext = createContext<SharedValue<number> | null>(null);
// Blocks drawn inside another block already breathe with it.
const NestedContext = createContext(false);

function usePulse() {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(withRepeat(withTiming(LOW, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse, reduceMotion]);
  return pulse;
}

/**
 * The placeholder of a screen while its content loads: every block inside
 * breathes together, and the whole reads as one "Cargando" to a screen reader.
 */
export function SkeletonGroup({ children, style, label = 'Cargando' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; label?: string }) {
  const pulse = usePulse();
  return (
    <PulseContext.Provider value={pulse}>
      <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }} style={style}>
        {children}
      </View>
    </PulseContext.Provider>
  );
}

type Tone = 'surface' | 'muted' | 'raised' | 'soft' | 'onSoft';

const TONES: Record<Tone, string> = {
  surface: AppColors.surface,
  muted: AppColors.surfaceMuted,
  raised: AppColors.surfaceRaised,
  soft: AppColors.surfaceSoft,
  // Blocks drawn on the light surfaces (Home tiles, the HaNet ID card).
  onSoft: 'rgba(40, 40, 41, 0.14)',
};

type BlockProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  /** The colour of the block: one step above whatever it sits on. */
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

function blockStyle({ width = '100%', height = 16, radius = AppRadii.sm, tone = 'surface' }: BlockProps): ViewStyle {
  return { width, height, borderRadius: radius, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: TONES[tone] };
}

function Block({ pulse, ...props }: BlockProps & { pulse: SharedValue<number> }) {
  const animated = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return (
    <Animated.View style={[blockStyle(props), animated, props.style]}>
      <NestedContext.Provider value>{props.children}</NestedContext.Provider>
    </Animated.View>
  );
}

function LoneBlock(props: BlockProps) {
  const pulse = usePulse();
  return <Block {...props} pulse={pulse} />;
}

/** One placeholder block, shaped like the thing that will take its place. */
export function Skeleton(props: BlockProps) {
  const pulse = useContext(PulseContext);
  const nested = useContext(NestedContext);
  if (nested) return <View style={[blockStyle(props), props.style]}>{props.children}</View>;
  return pulse ? <Block {...props} pulse={pulse} /> : <LoneBlock {...props} />;
}

/** A few lines of text; the last one shorter, as a paragraph ends. */
export function SkeletonLines({ lines = 2, height = 14, gap = 8, tone, lastWidth = '60%' }: { lines?: number; height?: number; gap?: number; tone?: Tone; lastWidth?: DimensionValue }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} height={height} radius={height / 2} tone={tone} width={index === lines - 1 && lines > 1 ? lastWidth : '100%'} />
      ))}
    </View>
  );
}
