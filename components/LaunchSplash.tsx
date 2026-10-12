import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

// Long enough to read as a beat of the brand, short enough not to hold anyone up.
const MIN_VISIBLE_MS = 900;
const FADE_MS = 240;

const VERSION = `V${Constants.expoConfig?.version ?? '1.0.0'}`;

const ASSETS = {
  logotype: require('@/assets/onboarding/logotype.svg'),
  ha: require('@/assets/onboarding/ha.svg'),
  net: require('@/assets/onboarding/net.svg'),
};

// Figma [SPLASH] (10584:10895): HA is 147 × 256, NET 305 × 125 turned upright, 24 apart.
const WORD_WIDTH = 147 + 24 + 125;
const CARD_PADDING = 32;

/**
 * HaNet's launch screen, drawn over the app while the session loads. It stays
 * at least a moment, then fades away once `ready` (the app has decided where
 * to go underneath).
 */
export function LaunchSplash({ ready }: { ready: boolean }) {
  const insets = useSafeAreaInsets();
  const [gone, setGone] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [cardWidth, setCardWidth] = useState(0);
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

  // Narrow phones shrink the wordmark so it keeps its padding.
  const scale = cardWidth ? Math.min(1, (cardWidth - CARD_PADDING * 2) / WORD_WIDTH) : 1;

  return (
    <Animated.View
      accessible
      accessibilityLabel={`HaNet ${VERSION}, cargando`}
      style={[styles.root, { paddingTop: insets.top + AppSpacing.xl, paddingBottom: insets.bottom + AppSpacing.md }, style]}
    >
      <View style={styles.header}>
        <ThemedText style={styles.version}>{`HaNet\n${VERSION}`}</ThemedText>
        <Image source={ASSETS.logotype} style={styles.logotype} contentFit="contain" />
      </View>
      <View style={styles.wordCard} onLayout={event => setCardWidth(event.nativeEvent.layout.width)}>
        <Image source={ASSETS.ha} style={{ width: 147 * scale, height: 256 * scale }} contentFit="contain" />
        <View style={[styles.netSlot, { width: 125 * scale, height: 305 * scale }]}>
          <Image source={ASSETS.net} style={{ width: 305 * scale, height: 125 * scale, transform: [{ rotate: '-90deg' }] }} contentFit="contain" />
        </View>
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
    minHeight: 157,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: CARD_PADDING,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  version: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.4,
    color: AppColors.textSecondary,
  },
  netSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logotype: {
    width: 74,
    height: 96,
  },
  wordCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 24,
    padding: CARD_PADDING,
    overflow: 'hidden',
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.primary,
  },
});
