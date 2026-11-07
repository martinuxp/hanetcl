import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii } from '@/constants/design-tokens';
import { Canvas, Group, Path, Rect, Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { BRUSH_RADIUS, createScratchSession } from './scratch-coverage';
import type { ScratchCardProps } from './scratch-coverage';

// A new grade comes covered: the student scratches the HaNet stripes off
// with a finger, Skia erases the strokes from the cover, and once about half
// is gone the rest fades out. The cover and its motion are the same for every
// grade, so nothing gives the grade away or judges it.

const STRIPE = '#D81D68';
const STRIPE_GAP = 18;
const FADE_MS = 260;

function stripes(width: number, height: number) {
  const builder = Skia.PathBuilder.Make();
  for (let x = -height; x < width + height; x += STRIPE_GAP) {
    builder.moveTo(x, height);
    builder.lineTo(x + height, 0);
  }
  return builder.build();
}

export function ScratchCard({ children, height, revealed, onReveal, onScratching, accessibilityLabel, accessibilityHint, label }: ScratchCardProps) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [drawn, setDrawn] = useState<SkPath | null>(null);
  const [started, setStarted] = useState(false);
  const opacity = useSharedValue(revealed ? 0 : 1);
  const pattern = useMemo(() => (width ? stripes(width, height) : null), [width, height]);

  // The strokes so far live in a builder outside React; each move draws a snapshot.
  const [session] = useState(() => {
    const strokes = Skia.PathBuilder.Make();
    return createScratchSession({
      paint: (from, to) => {
        if (from.x === to.x && from.y === to.y) strokes.moveTo(to.x, to.y);
        strokes.lineTo(to.x + 0.01, to.y);
        setDrawn(strokes.build());
      },
      tick: () => void Haptics.selectionAsync(),
      reveal: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onReveal();
      },
    });
  });

  useEffect(() => {
    if (!revealed) return;
    // Uncovered with the button: the session stops taking strokes too.
    session.finish();
    opacity.set(reduceMotion ? 0 : withTiming(0, { duration: FADE_MS }));
  }, [opacity, reduceMotion, revealed, session]);

  const coverStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

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
    <View style={[styles.frame, { height }]} onLayout={onLayout}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={!revealed}
        importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
      >
        {children}
      </View>
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
  );
}

const styles = StyleSheet.create({
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
