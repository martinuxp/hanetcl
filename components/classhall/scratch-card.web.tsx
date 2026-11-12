import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii } from '@/constants/design-tokens';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { BRUSH_RADIUS, createScratchSession } from './scratch-coverage';
import type { ScratchCardProps } from './scratch-coverage';

// The web's scratch card: the same cover as on the phone (scratch-card.tsx),
// drawn on an HTML canvas because Skia needs CanvasKit on the web. Mouse,
// touch and pen all scratch.

const STRIPE = '#D81D68';
const STRIPE_GAP = 18;
const FADE_MS = 260;

type Point = { x: number; y: number };

/** Holds the canvas element outside React. */
function elementHolder() {
  let element: HTMLCanvasElement | null = null;
  return { get: () => element, set: (next: HTMLCanvasElement | null) => { element = next; } };
}

function paintCover(element: HTMLCanvasElement, width: number, height: number) {
  const ratio = window.devicePixelRatio || 1;
  element.width = width * ratio;
  element.height = height * ratio;
  const context = element.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = AppColors.accent;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = STRIPE;
  context.lineWidth = 9;
  for (let x = -height; x < width + height; x += STRIPE_GAP) {
    context.beginPath();
    context.moveTo(x, height);
    context.lineTo(x + height, 0);
    context.stroke();
  }
  // From here on, every stroke erases.
  context.globalCompositeOperation = 'destination-out';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = BRUSH_RADIUS * 2;
}

export function ScratchCard({ children, height, revealed, onReveal, onScratching, accessibilityLabel, accessibilityHint, label }: ScratchCardProps) {
  const [width, setWidth] = useState(0);
  const [canvas] = useState(elementHolder);
  const [started, setStarted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const [session] = useState(() => createScratchSession({
    paint: (from: Point, to: Point) => {
      const context = canvas.get()?.getContext('2d');
      if (!context) return;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x + 0.01, to.y);
      context.stroke();
    },
    reveal: onReveal,
  }));

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (revealed) session.finish();
  }, [revealed, session]);

  const point = (event: { clientX: number; clientY: number }): Point | null => {
    const box = canvas.get()?.getBoundingClientRect();
    return box ? { x: event.clientX - box.left, y: event.clientY - box.top } : null;
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    session.resize(next, height);
    setWidth(next);
  };

  const cover = React.createElement('canvas', {
    ref: (element: HTMLCanvasElement | null) => {
      canvas.set(element);
      if (element && width && element.dataset.size !== `${width}x${height}`) {
        element.dataset.size = `${width}x${height}`;
        paintCover(element, width, height);
      }
    },
    style: { position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'grab' },
    onPointerDown: (event: PointerEvent & { currentTarget: HTMLCanvasElement }) => {
      if (revealed) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setStarted(true);
      onScratching?.(true);
      const at = point(event);
      if (at) session.begin(at.x, at.y);
    },
    onPointerMove: (event: PointerEvent) => {
      if (!session.isActive()) return;
      const at = point(event);
      if (at) session.move(at.x, at.y);
    },
    onPointerUp: () => { session.end(); onScratching?.(false); },
    onPointerCancel: () => { session.end(); onScratching?.(false); },
  });

  return (
    <View style={[styles.frame, { height }]} onLayout={onLayout}>
      <View style={styles.fill} aria-hidden={!revealed}>
        {children}
      </View>
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.cover,
          { transitionDuration: reduceMotion ? '0ms' : `${FADE_MS}ms` } as object,
          revealed && styles.gone,
        ]}
        aria-hidden={revealed}
        accessible={!revealed}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {!!width && cover}
        {!started && (
          <View style={[styles.fill, styles.label]} pointerEvents="none">
            <ThemedText style={styles.labelText}>{label}</ThemedText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: AppRadii.md,
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
  cover: {
    transitionProperty: 'opacity',
  },
  gone: {
    opacity: 0,
    pointerEvents: 'none',
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
