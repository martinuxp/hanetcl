import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { markOnboardingSeen } from '@/services/onboarding';
import PagerView from '@/components/PagerView';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Kept honest: the network is just starting (CLAUDE.md, no invented figures).
const PAGES = [
  'Únete a la red escolar de HaNet, solo faltas tú.',
  'Calendario, anuncios, actividades, evaluaciones y mucho más en solo una App.',
];
const SUBTITLE = 'La herramienta más moderna para estar conectad@ con tu institución.';

// Figma [Walkthrough] 1 and 2 (10584:10855, 10584:10927).
const ARROWS = {
  back: require('@/assets/onboarding/arrow-left-long.svg'),
  next: require('@/assets/onboarding/arrow-right-long.svg'),
};

/** The two welcome pages shown once, before signing in for the first time. */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pagerRef = useRef<PagerView>(null);
  const webPagerRef = useRef<ScrollView>(null);
  // Shorter phones get a smaller headline so six lines still fit the card.
  const headlineSize = height < 760 ? 40 : 48;

  const goTo = (index: number) => {
    pagerRef.current?.setPage(index);
    webPagerRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const finish = () => {
    void markOnboardingSeen();
    router.replace('/auth');
  };

  const pages = PAGES.map((headline, index) => {
    const isFirst = index === 0;
    const isLast = index === PAGES.length - 1;
    return (
      <View key={index} style={[styles.page, Platform.OS === 'web' && { width }]}>
        <View style={styles.card}>
          <View style={styles.text}>
            <ThemedText
              accessibilityRole="header"
              style={[styles.headline, { fontSize: headlineSize, lineHeight: headlineSize * 1.2, letterSpacing: -headlineSize * 0.05 }]}
            >
              {headline}
            </ThemedText>
            <View style={styles.divider} />
            <ThemedText style={styles.subtitle}>{SUBTITLE}</ThemedText>
          </View>

          {isFirst ? (
            <View style={styles.button}>
              {/* Nothing comes before the first page, so the back arrow rests. */}
              <Image source={ARROWS.back} style={[styles.arrow, styles.arrowResting]} contentFit="contain" accessibilityElementsHidden />
              <Pressable accessibilityRole="button" accessibilityLabel="Siguiente" hitSlop={12} onPress={() => goTo(index + 1)} style={({ pressed }) => pressed && styles.pressed}>
                <Image source={ARROWS.next} style={styles.arrow} contentFit="contain" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Anterior" onPress={() => goTo(index - 1)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <Image source={ARROWS.back} style={styles.arrow} contentFit="contain" />
              </Pressable>
              {isLast ? (
                <Pressable accessibilityRole="button" onPress={finish} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                  <ThemedText style={styles.buttonText}>Iniciar sesión</ThemedText>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel="Siguiente" onPress={() => goTo(index + 1)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                  <Image source={ARROWS.next} style={styles.arrow} contentFit="contain" />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    );
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top + AppSpacing.md, paddingBottom: insets.bottom + AppSpacing.md }]}>
      {Platform.OS === 'web' ? (
        <ScrollView
          ref={webPagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.pager}
        >
          {pages}
        </ScrollView>
      ) : (
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
        >
          {pages}
        </PagerView>
      )}

      <View style={styles.footer}>
        <ThemedText style={styles.footerText}>HaNet para estudiantes y comunidades.</ThemedText>
        <Pressable accessibilityRole="button" accessibilityHint="Va directo a iniciar sesión" onPress={finish} style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
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
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: AppSpacing.md,
  },
  card: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 32,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  text: {
    gap: 32,
  },
  headline: {
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: AppColors.textSecondary,
  },
  subtitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    height: 56,
    paddingHorizontal: AppSpacing.xl,
    gap: AppSpacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  arrow: {
    width: 24,
    height: 24,
  },
  arrowResting: {
    opacity: 0.4,
  },
  buttonText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textSecondary,
  },
  footer: {
    marginHorizontal: AppSpacing.md,
    minHeight: 112,
    padding: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.lg,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.accent,
  },
  footerText: {
    flexShrink: 1,
    maxWidth: 221,
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textOnLight,
  },
  skip: {
    height: 40,
    paddingHorizontal: AppSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  skipText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: -0.35,
    color: AppColors.textSecondary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
});
