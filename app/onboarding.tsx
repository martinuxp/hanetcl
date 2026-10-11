import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { markOnboardingSeen } from '@/services/onboarding';
import PagerView from '@/components/PagerView';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Kept honest: the network is just starting (CLAUDE.md, no invented figures).
const PAGES = [
  'Únete a la red escolar de HaNet, solo faltas tú.',
  'Calendario, anuncios, actividades, evaluaciones y mucho más en solo una App.',
];
const SUBTITLE = 'La herramienta más moderna para estar conectad@ con tu institución.';

/** The two welcome pages shown once, before signing in for the first time. */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const pagerRef = useRef<PagerView>(null);
  const webPagerRef = useRef<ScrollView>(null);

  const goTo = (index: number) => {
    setPage(index);
    pagerRef.current?.setPage(index);
    webPagerRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const finish = () => {
    void markOnboardingSeen();
    router.replace('/auth');
  };

  const isLast = page === PAGES.length - 1;

  const pages = PAGES.map((headline, index) => (
    <View key={index} style={[styles.page, Platform.OS === 'web' && { width }]}>
      <View style={styles.card}>
        <ThemedText accessibilityRole="header" style={styles.headline} adjustsFontSizeToFit minimumFontScale={0.7}>
          {headline}
        </ThemedText>
        <View style={styles.rule} />
        <ThemedText style={styles.subtitle}>{SUBTITLE}</ThemedText>
      </View>
    </View>
  ));

  return (
    <View style={[styles.root, { paddingTop: insets.top + AppSpacing.md, paddingBottom: insets.bottom + AppSpacing.sm }]}>
      <View style={styles.stage}>
      {Platform.OS === 'web' ? (
        <ScrollView
          ref={webPagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.pager}
          onMomentumScrollEnd={event => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
        >
          {pages}
        </ScrollView>
      ) : (
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageSelected={(event: { nativeEvent: { position: number } }) => setPage(event.nativeEvent.position)}
        >
          {pages}
        </PagerView>
      )}

      {/* The controls stay put while the pages move under the finger. */}
      <View style={styles.controls}>
        {page === 0 ? (
          <View style={styles.arrowPill}>
            <Ionicons name="arrow-back" size={22} color={AppColors.textSecondary} style={styles.arrowDisabled} accessibilityElementsHidden />
            <Pressable accessibilityRole="button" accessibilityLabel="Siguiente" hitSlop={8} onPress={() => goTo(1)} style={({ pressed }) => pressed && styles.pressed}>
              <Ionicons name="arrow-forward" size={22} color={AppColors.textSecondary} />
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Anterior" onPress={() => goTo(page - 1)} style={({ pressed }) => [styles.backPill, pressed && styles.pressed]}>
            <Ionicons name="arrow-back" size={22} color={AppColors.textSecondary} />
          </Pressable>
        )}
        {isLast && (
          <Pressable accessibilityRole="button" onPress={finish} style={({ pressed }) => [styles.signInPill, pressed && styles.pressed]}>
            <ThemedText style={styles.pillText}>Iniciar sesión</ThemedText>
          </Pressable>
        )}
      </View>
      </View>

      <View style={styles.footer}>
        <ThemedText style={styles.footerText}>HaNet para estudiantes y comunidades.</ThemedText>
        <Pressable accessibilityRole="button" accessibilityHint="Va directo a iniciar sesión" onPress={finish} style={({ pressed }) => [styles.skipPill, pressed && styles.pressed]}>
          <ThemedText style={styles.skipText}>Saltar</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AppColors.canvas,
    gap: AppSpacing.md,
  },
  stage: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: AppSpacing.md,
  },
  card: {
    flex: 1,
    padding: AppSpacing.xl + AppSpacing.sm,
    paddingTop: AppSpacing.xxl + AppSpacing.md,
    paddingBottom: 120,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  headline: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: -2.8,
    color: AppColors.textSecondary,
  },
  rule: {
    height: 1,
    marginVertical: AppSpacing.xl + AppSpacing.sm,
    backgroundColor: AppColors.textSecondary,
    opacity: 0.8,
  },
  subtitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 24,
    color: AppColors.textSecondary,
  },
  // Drawn over the bottom of the card, inside its padding.
  controls: {
    position: 'absolute',
    left: AppSpacing.md + AppSpacing.xl + AppSpacing.sm,
    right: AppSpacing.md + AppSpacing.xl + AppSpacing.sm,
    bottom: AppSpacing.xl + AppSpacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arrowPill: {
    height: 56,
    paddingHorizontal: AppSpacing.xl,
    gap: AppSpacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  arrowDisabled: {
    opacity: 0.4,
  },
  backPill: {
    height: 56,
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  signInPill: {
    height: 56,
    paddingHorizontal: AppSpacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  pillText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textSecondary,
  },
  footer: {
    marginHorizontal: AppSpacing.md,
    minHeight: 112,
    paddingHorizontal: AppSpacing.xl + AppSpacing.sm,
    paddingVertical: AppSpacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.lg,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.accent,
  },
  footerText: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 24,
    color: AppColors.textOnLight,
  },
  skipPill: {
    height: 40,
    paddingHorizontal: AppSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  skipText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
});
