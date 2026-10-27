import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

// A single burst of paper in the alianzas' colors over the winner's card.
// It falls once and stays out of the way of touches and screen readers.

type Piece = { x: number; delay: number; ms: number; spin: number; sway: number; width: number; height: number; color: string };

function piecesFor(colors: string[], count: number): Piece[] {
  // A fixed pseudo-random spread, so a re-render doesn't reshuffle it.
  let seed = 7;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return Array.from({ length: count }, (_, index) => ({
    x: random(),
    delay: random() * 500,
    ms: 1500 + random() * 1100,
    spin: (random() - 0.5) * 900,
    sway: (random() - 0.5) * 60,
    width: 6 + random() * 5,
    height: 10 + random() * 6,
    color: colors[index % colors.length],
  }));
}

function PieceView({ piece, width, height }: { piece: Piece; width: number; height: number }) {
  const fall = useSharedValue(0);
  useEffect(() => {
    fall.value = withDelay(piece.delay, withTiming(1, { duration: piece.ms, easing: Easing.in(Easing.quad) }));
  }, [fall, piece.delay, piece.ms]);
  const style = useAnimatedStyle(() => ({
    opacity: fall.value < 0.85 ? 1 : (1 - fall.value) / 0.15,
    transform: [
      { translateX: Math.sin(fall.value * Math.PI * 2) * piece.sway },
      { translateY: -24 + fall.value * (height + 48) },
      { rotate: `${fall.value * piece.spin}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[styles.piece, { left: piece.x * width, width: piece.width, height: piece.height, backgroundColor: piece.color }, style]}
    />
  );
}

export function Confetti({ colors, count = 36 }: { colors: string[]; count?: number }) {
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  if (reduceMotion || !colors.length) return null;
  const pieces = piecesFor(colors, count);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!size) setSize({ width, height });
  };
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onLayout={onLayout} style={StyleSheet.absoluteFill}>
      {size && pieces.map((piece, index) => <PieceView key={index} piece={piece} width={size.width} height={size.height} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: 0,
    borderRadius: 2,
  },
});
