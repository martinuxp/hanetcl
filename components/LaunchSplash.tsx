import { HanetMark } from '@/components/brand/HanetMark';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

// Long enough to read as a beat of the brand, short enough not to hold anyone up.
const MIN_VISIBLE_MS = 900;
const FADE_MS = 240;

const VERSION = `V${Constants.expoConfig?.version ?? '1.0.0'}`;

/**
 * HaNet's launch screen, drawn over the app while the session loads. It stays
 * at least a moment, then fades away once `ready` (the app has decided where
 * to go underneath).
 */
export function LaunchSplash({ ready }: { ready: boolean }) {
  const insets = useSafeAreaInsets();
  const [gone, setGone] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [wordWidth, setWordWidth] = useState(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    opacity.set(withTiming(0, { duration: FADE_MS, easing: Easing.out(Easing.cubic) }, finished => {
      if (finished) scheduleOnRN(setGone, true);
    }));
  }, [minElapsed, opacity, ready]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  if (gone) return null;

  // The two lines of the wordmark run up the card and fill its width: the
  // turned block is a square about 2.1 letters on each side.
  const wordSize = Math.max(0, wordWidth - AppSpacing.xl * 2) / 2.1;

  return (
    <Animated.View
      accessible
      accessibilityLabel={`HaNet ${VERSION}, cargando`}
      style={[styles.root, { paddingTop: insets.top + AppSpacing.xl, paddingBottom: insets.bottom + AppSpacing.sm }, style]}
    >
      <View style={styles.header}>
        <ThemedText style={styles.version}>{`HaNet\n${VERSION}`}</ThemedText>
        <HanetMark height={86} />
      </View>
      <View style={styles.wordCard} onLayout={event => setWordWidth(event.nativeEvent.layout.width)}>
        {wordWidth > 0 && (
          <View style={[styles.wordAnchor, { width: wordSize * 2.1 }]}>
            <View style={[styles.wordBlock, { transform: [{ rotate: '-90deg' }] }]}>
              <ThemedText style={[styles.word, { fontSize: wordSize, lineHeight: wordSize * 1.02 }]}>HA</ThemedText>
              <ThemedText style={[styles.word, { fontSize: wordSize, lineHeight: wordSize * 1.02 }]}>NET</ThemedText>
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    backgroundColor: AppColors.canvas,
    paddingHorizontal: AppSpacing.md,
    gap: AppSpacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: AppSpacing.xl,
    paddingVertical: AppSpacing.xl,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  version: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -1.5,
    color: AppColors.textSecondary,
  },
  wordCard: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.primary,
  },
  // Sits in the lower left; the block inside is turned to read upwards.
  wordAnchor: {
    position: 'absolute',
    left: AppSpacing.xl,
    bottom: AppSpacing.xl,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordBlock: {
    width: '100%',
  },
  word: {
    fontFamily: 'DMSans_500Medium',
    letterSpacing: 0,
    color: AppColors.textSecondary,
  },
});
