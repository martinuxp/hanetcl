import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii } from '@/constants/design-tokens';
import { Canvas, Group, LinearGradient, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BRUSH_RADIUS, createScratchSession } from './scratch-coverage';
import type { ScratchCardProps } from './scratch-coverage';
import { createParticles } from './scratch-particles';
import type { Pieces } from './scratch-particles';

// A new grade comes covered: the student scratches the HaNet stripes off
// with a finger. The cover shines like foil as the phone tilts, flakes jump
// off the finger, the ticks get quicker and stronger as it opens and, at
// three quarters, the rest breaks into shards and the number lands. All of
// that is the same for every grade, so nothing gives it away while covered;
// only a high grade (`celebrate`) gets a burst once it is already showing.
// Reduce Motion keeps the haptics and drops the motion.

const STRIPE = '#D81D68';
const STRIPE_GAP = 18;
// Room around the card for flakes and shards to fly into.
const SPILL_X = 40;
const SPILL_Y = 140;

function stripes(width: number, height: number) {
  const builder = Skia.PathBuilder.Make();
  for (let x = -height; x < width + height; x += STRIPE_GAP) {
    builder.moveTo(x, height);
    builder.lineTo(x + height, 0);
  }
  return builder.build();
}

function tick(progress: number) {
  if (progress < 0.35) void Haptics.selectionAsync();
  else void Haptics.impactAsync(progress < 0.7 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
}

export function ScratchCard({ children, height, revealed, onReveal, onScratching, accessibilityLabel, accessibilityHint, label, celebrate = false }: ScratchCardProps) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [drawn, setDrawn] = useState<SkPath | null>(null);
  const [pieces, setPieces] = useState<Pieces | null>(null);
  const [started, setStarted] = useState(false);
  // A card that mounts already uncovered skips the ending.
  const [openedBefore] = useState(revealed);
  const opacity = useSharedValue(revealed ? 0 : 1);
  const landing = useSharedValue(revealed ? 1 : 0.82);
  const pattern = useMemo(() => (width ? stripes(width, height) : null), [width, height]);

  const [particles] = useState(() => createParticles(setPieces));

  // The strokes so far live in a builder outside React; each move draws a snapshot.
  const [session] = useState(() => {
    const strokes = Skia.PathBuilder.Make();
    return createScratchSession({
      paint: (from, to) => {
        if (from.x === to.x && from.y === to.y) strokes.moveTo(to.x, to.y);
        strokes.lineTo(to.x + 0.01, to.y);
        setDrawn(strokes.build());
        if (from.x !== to.x || from.y !== to.y) particles.flakes(to.x, to.y, to.x - from.x, to.y - from.y);
      },
      tick,
      reveal: onReveal,
    });
  });

  useEffect(() => () => particles.stop(), [particles]);

  // The foil's shine follows the phone's tilt and drifts a little on its own.
  const rotation = useAnimatedSensor(SensorType.ROTATION, { interval: 32 });
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || revealed) return;
    drift.set(withRepeat(withSequence(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      withTiming(-1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
    ), -1, true));
  }, [drift, reduceMotion, revealed]);
  const shineStart = useDerivedValue(() => {
    const roll = reduceMotion ? 0 : Math.max(-0.7, Math.min(0.7, rotation.sensor.get().roll));
    const x = width * (0.5 + roll * 0.9 + drift.get() * 0.18);
    return vec(x - width * 0.45, 0);
  }, [width, reduceMotion]);
  const shineEnd = useDerivedValue(() => vec(shineStart.get().x + width * 0.9, height), [width, height]);

  useEffect(() => {
    if (!revealed || openedBefore) return;
    // Uncovered with the button too: the session stops taking strokes.
    session.finish();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (reduceMotion) {
      opacity.set(0);
      landing.set(1);
    } else {
      // The shards replace the cover at once; the number lands under them.
      opacity.set(withTiming(0, { duration: 90 }));
      if (width) particles.shatter(width, height);
      landing.set(withSpring(1, { damping: 11, stiffness: 240, mass: 0.8 }));
    }
    if (!celebrate) return;
    const timer = setTimeout(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!reduceMotion && width) particles.burst(width, height);
    }, reduceMotion ? 120 : 260);
    return () => clearTimeout(timer);
  }, [celebrate, height, landing, opacity, openedBefore, particles, reduceMotion, revealed, session, width]);

  const coverStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const gradeStyle = useAnimatedStyle(() => ({ transform: [{ scale: landing.get() }] }));

  const pan = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .enabled(!revealed)
    .onBegin(event => {
      onScratching?.(true);
      setStarted(true);
      session.begin(event.x, event.y);
    })
    .onUpdate(event => session.move(event.x, event.y))
    .onFinalize(() => {
      session.end();
      onScratching?.(false);
    }), [onScratching, revealed, session]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    session.resize(next, height);
    setWidth(next);
  };

  return (
    <View style={styles.wrap}>
    <View style={[styles.frame, { height }]} onLayout={onLayout}>
      <Animated.View
        style={[styles.fill, gradeStyle]}
        accessibilityElementsHidden={!revealed}
        importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
      >
        {children}
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          pointerEvents={revealed ? 'none' : 'auto'}
          style={[StyleSheet.absoluteFill, coverStyle]}
          accessible={!revealed}
          accessibilityElementsHidden={revealed}
          importantForAccessibility={revealed ? 'no-hide-descendants' : 'yes'}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={() => session.finish()}
        >
          {!!width && pattern && (
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <Group layer>
                <Rect x={0} y={0} width={width} height={height} color={AppColors.accent} />
                <Path path={pattern} style="stroke" strokeWidth={9} color={STRIPE} />
                <Rect x={0} y={0} width={width} height={height}>
                  <LinearGradient
                    start={shineStart}
                    end={shineEnd}
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']}
                    positions={[0.38, 0.5, 0.62]}
                  />
                </Rect>
                {drawn && (
                  <Path path={drawn} style="stroke" strokeWidth={BRUSH_RADIUS * 2} strokeCap="round" strokeJoin="round" color="black" blendMode="clear" />
                )}
              </Group>
            </Canvas>
          )}
          {!started && (
            <View style={[styles.fill, styles.label]} pointerEvents="none">
              <ThemedText style={styles.labelText}>{label}</ThemedText>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
      {/* Flakes, shards and the burst fly over the card and past its edges. */}
      {!!pieces && (
        <Canvas style={styles.spill} pointerEvents="none">
          <Group transform={[{ translateX: SPILL_X }, { translateY: SPILL_Y }]}>
            {pieces.pink && <Path path={pieces.pink} color={AppColors.accent} />}
            {pieces.stripe && <Path path={pieces.stripe} color={STRIPE} />}
            {pieces.light && <Path path={pieces.light} color={AppColors.textPrimary} />}
          </Group>
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 2,
  },
  spill: {
    position: 'absolute',
    top: -SPILL_Y,
    left: -SPILL_X,
    right: -SPILL_X,
    bottom: -SPILL_Y,
  },
  frame: {
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: AppColors.canvas,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    paddingHorizontal: 16,
  },
  labelText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
    textAlign: 'center',
  },
});
