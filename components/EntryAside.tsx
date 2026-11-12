import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { usePathname } from 'expo-router';
import React, { useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { APP_VERSION_LABEL } from '@/constants/app-version';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { SIDEBAR_MIN_WIDTH } from '@/hooks/use-desktop-layout';
import { t } from '@/i18n';

// The way into HaNet on a wide web window. The forms keep their phone-sized
// column on the right; this panel fills the left with the brand (the same
// HA NET word card as the launch splash, so the splash opens into it) and
// the steps of joining, with the one on screen in pink.

const ASSETS = {
  logotype: require('@/assets/onboarding/logotype.svg'),
  ha: require('@/assets/onboarding/ha.svg'),
  net: require('@/assets/onboarding/net.svg'),
};

// As in the splash (Figma 10584:10895): HA 147 × 256, NET 305 × 125 upright, 24 apart.
const WORD_WIDTH = 147 + 24 + 125;
const WORD_HEIGHT = 305;
const CARD_PADDING = 32;
// The version and the logotype over the word, and the space under them.
const TOP_ROW = 96;

/** The joining steps, in order, and the screen of each. */
const STEPS: { route: string; label: string }[] = [
  { route: '/auth', label: t('components.entryAside.creaTuCuentaOInicia') },
  { route: '/verify-email', label: t('components.entryAside.confirmaTuCorreo') },
  { route: '/join-beta', label: t('components.entryAside.escribeElCodigoDeTu') },
  { route: '/link-institution', label: t('components.entryAside.vinculaTuCorreoDelLiceo') },
  { route: '/', label: t('components.entryAside.bienvenida') },
];

const ENTRY_ROUTES = ['/onboarding', '/auth', '/verify-email', '/join-beta', '/link-institution'];

/** For the form beside the panel: centered in the height of the window. */
export const ENTRY_WIDE_CONTENT = { justifyContent: 'center', paddingVertical: 32 } as const;

/** Width of the panel on this screen; 0 when there is none. */
export function useEntryAsideWidth() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  if (Platform.OS !== 'web' || width < SIDEBAR_MIN_WIDTH || !ENTRY_ROUTES.includes(pathname)) return 0;
  return Math.min(600, Math.max(420, Math.round(width * 0.42)));
}

export function EntryAside() {
  const pathname = usePathname();
  const width = useEntryAsideWidth();
  const [card, setCard] = useState({ width: 0, height: 0 });
  if (!width) return null;

  const current = STEPS.findIndex(step => step.route === pathname);
  // The word grows with the card, up to twice its drawn size.
  const scale = card.width
    ? Math.min(2, (card.width - CARD_PADDING * 2) / WORD_WIDTH, (card.height - CARD_PADDING * 2 - TOP_ROW) / WORD_HEIGHT)
    : 0;

  return (
    <View style={[styles.root, { width }]}>
      <View style={styles.steps}>
        <ThemedText style={styles.kicker}>{current < 0 ? t('components.entryAside.asiTeUnesAHanet') : t('components.entryAside.pasoNumberDeStepscount', { number: current + 1, sTEPSCount: STEPS.length })}</ThemedText>
        {STEPS.map((step, index) => {
          const done = current >= 0 && index < current;
          const active = index === current;
          return (
            <View key={step.route} style={styles.step} accessibilityState={{ selected: active }}>
              <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                {done
                  ? <Ionicons name="checkmark" size={16} color={AppColors.controlOnActive} />
                  : <ThemedText style={[styles.dotText, active && styles.dotTextActive]}>{index + 1}</ThemedText>}
              </View>
              <ThemedText style={[styles.stepText, (done || active) && styles.stepTextOn, active && styles.stepTextActive]}>{step.label}</ThemedText>
            </View>
          );
        })}
      </View>
      <View
        style={styles.word}
        onLayout={(event: LayoutChangeEvent) => setCard({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
      >
        <View style={styles.wordTop}>
          <ThemedText style={styles.version}>{`HaNet\n${APP_VERSION_LABEL}`}</ThemedText>
          <Image source={ASSETS.logotype} style={styles.logotype} contentFit="contain" />
        </View>
        {scale > 0 && (
          <View style={styles.wordRow}>
            <Image source={ASSETS.ha} style={{ width: 147 * scale, height: 256 * scale }} contentFit="contain" />
            <View style={{ width: 125 * scale, height: 305 * scale, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={ASSETS.net} style={{ width: 305 * scale, height: 125 * scale, transform: [{ rotate: '-90deg' }] }} contentFit="contain" />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: '100%',
    padding: AppSpacing.md,
    paddingRight: 0,
    gap: AppSpacing.md,
    backgroundColor: AppColors.canvas,
  },
  steps: {
    gap: 6,
    padding: CARD_PADDING,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  kicker: {
    marginBottom: 10,
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  step: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  dotDone: {
    backgroundColor: AppColors.controlActive,
  },
  dotActive: {
    backgroundColor: AppColors.accent,
  },
  dotText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  dotTextActive: {
    color: AppColors.textPrimary,
  },
  stepText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: AppColors.textSecondary,
    opacity: 0.6,
  },
  stepTextOn: {
    opacity: 1,
  },
  stepTextActive: {
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  word: {
    flex: 1,
    justifyContent: 'space-between',
    padding: CARD_PADDING,
    overflow: 'hidden',
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.primary,
  },
  wordTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  version: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.4,
    color: AppColors.textSecondary,
  },
  logotype: {
    width: 56,
    height: 72,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 24,
  },
});
