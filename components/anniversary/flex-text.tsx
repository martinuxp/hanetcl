import { ThemedText } from '@/components/themed-text';
import { AppFlexFonts } from '@/constants/design-tokens';
import React, { useEffect, useState } from 'react';
import type { StyleProp, TextProps, TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

const STEP_MS = 55;

/**
 * Big text that grows into its weight and width when it appears, stepping
 * through Google Sans Flex's cuts (narrow and light → wide and black), as
 * Spotify Wrapped's type does. Give it a new `key` to play it again.
 */
export function FlexText({
  style,
  steps = AppFlexFonts.ramp,
  delay = 0,
  ...props
}: Omit<TextProps, 'style'> & { style?: StyleProp<TextStyle>; steps?: readonly string[]; delay?: number }) {
  const reduceMotion = useReducedMotion();
  const last = steps.length - 1;
  const [step, setStep] = useState(reduceMotion ? last : 0);

  useEffect(() => {
    if (reduceMotion) return;
    const timers = Array.from({ length: last }, (_, index) => setTimeout(() => setStep(index + 1), delay + STEP_MS * (index + 1)));
    return () => timers.forEach(clearTimeout);
  }, [delay, last, reduceMotion]);

  return <ThemedText {...props} style={[style, { fontFamily: steps[Math.min(step, last)] }]} />;
}
