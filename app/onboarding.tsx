import { ThemedText } from '@/components/themed-text';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { markOnboardingSeen } from '@/services/onboarding';
import PagerView from '@/components/PagerView';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import React, { useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Kept honest: the network is just starting (CLAUDE.md, no invented figures).
const PAGES = [
  'Únete a la red escolar de HaNet, solo faltas tú.',
  'Calendario, anuncios, tareas y evaluaciones en una sola app.',
];
const SUBTITLE = 'Para estar al día con tu institución.';

// Headline growth with the system text size is capped so it still reads as a
// headline; past that the card scrolls instead of clipping.
const HEADLINE_MAX_SCALE = 1.25;

/** One dot per page; the current one stretches, following the pages as they move. */
function PageDot({ index, position }: { index: number; position: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const nearness = Math.max(0, 1 - Math.abs(position.get() - index));
    return {
      width: interpolate(nearness, [0, 1], [8, 24]),
      opacity: interpolate(nearness, [0, 1], [0.4, 1]),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

// Figma [Walkthrough] 1 and 2 (10584:10855, 10584:10927).
const ARROWS = {
  back: require('@/assets/onboarding/arrow-left-long.svg'),
  next: require('@/assets/onboarding/arrow-right-long.svg'),
};

/** The two welcome pages shown once, before signing in for the first time. */
export default function OnboardingScreen() {
  const router = useRouter();
  // Opened from the HNT panel to look at it: finishing goes back there and
  // changes nothing on this device.
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pagerRef = useRef<PagerView>(null);
  const webPagerRef = useRef<ScrollView>(null);
  // Page position as a continuous value (0 → 1 while swiping to the second).
  const position = useSharedValue(0);
  // Shorter phones get a smaller headline so six lines still fit the card.
  const headlineSize = height < 760 ? 40 : 48;

  const goTo = (index: number) => {
    pagerRef.current?.setPage(index);
    webPagerRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const finish = () => {
    if (preview) {
      if (router.canGoBack()) router.back();
      else router.replace('/hnt-admin');
      return;
    }
    void markOnboardingSeen();
    router.replace('/auth');
  };

  const pages = PAGES.map((headline, index) => {
    const isFirst = index === 0;
    const isLast = index === PAGES.length - 1;
    return (
      <View key={index} style={[styles.page, Platform.OS === 'web' && { width }]}>
        <View style={styles.card}>
          <ScrollView style={styles.textScroll} contentContainerStyle={styles.text} showsVerticalScrollIndicator={false} bounces={false}>
            <ThemedText
              accessibilityRole="header"
              maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
              style={[styles.headline, { fontSize: headlineSize, lineHeight: headlineSize * 1.2, letterSpacing: -headlineSize * 0.05 }]}
            >
              {headline}
            </ThemedText>
            <View style={styles.divider} />
            <ThemedText style={styles.subtitle}>{SUBTITLE}</ThemedText>
          </ScrollView>

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
          scrollEventThrottle={16}
          onScroll={event => position.set(event.nativeEvent.contentOffset.x / width)}
        >
          {pages}
        </ScrollView>
      ) : (
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageScroll={(event: { nativeEvent: { position: number; offset: number } }) => position.set(event.nativeEvent.position + event.nativeEvent.offset)}
        >
          {pages}
        </PagerView>
      )}

      {/* Visual only: each page already reads as its own screen. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.pageControl}>
        {PAGES.map((_, index) => <PageDot key={index} index={index} position={position} />)}
      </View>

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
    gap: AppSpacing.xl,
    padding: 32,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  textScroll: {
    flex: 1,
  },
  text: {
    gap: 32,
  },
  pageControl: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.textSecondary,
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
  pressed: AppPressed,
});
