import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ASSETS = {
  logotype: require('@/assets/onboarding/logotype.svg'),
  secure: require('@/assets/onboarding/sync-secure.svg'),
  download: require('@/assets/onboarding/sync-download.svg'),
  ha: require('@/assets/onboarding/ha.svg'),
  net: require('@/assets/onboarding/net.svg'),
};

// Figma "[Verify] verify connect email sended" (10586:1520, 10586:1283):
// first the secure connection, then the data coming over.
const SECURE_MS = 900;

type Props = {
  logoUrl?: string | null;
};

/**
 * Shown while the identity link completes: HaNet's mark and the
 * institution's shield, joined first by a lock and then by arrows that carry
 * its data across, over the HA NET card.
 */
export function InstitutionSync({ logoUrl }: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<'secure' | 'download'>('secure');
  const [wordWidth, setWordWidth] = useState(0);
  // Narrow phones shrink HA NET so it keeps its padding (HA 147 + 24 + NET 125).
  const scale = wordWidth ? Math.min(1, (wordWidth - 64) / 296) : 1;
  const drift = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => setPhase('download'), SECURE_MS);
    return () => clearTimeout(timer);
  }, []);

  // The arrows flow from the institution toward HaNet.
  useEffect(() => {
    if (reduceMotion || phase !== 'download') return;
    drift.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }), -1, false));
  }, [drift, phase, reduceMotion]);

  const arrowsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -10 * drift.get() }],
    opacity: 1 - 0.5 * drift.get(),
  }));

  const message = phase === 'secure'
    ? 'Conectando a los servidores seguros de tu institución…'
    : 'Descargando datos e información desde tu institución…';

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={[styles.root, { paddingTop: insets.top + AppSpacing.xl, paddingBottom: insets.bottom + AppSpacing.md }]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
    >
      <View style={styles.card}>
        <Image source={ASSETS.logotype} style={styles.mark} contentFit="contain" />
        <View style={styles.link}>
          {phase === 'secure' ? (
            <Animated.View key="secure" entering={reduceMotion ? undefined : FadeIn.duration(150)}>
              <Image source={ASSETS.secure} style={styles.secure} contentFit="contain" />
            </Animated.View>
          ) : (
            <Animated.View key="download" entering={reduceMotion ? undefined : FadeIn.duration(150)} style={arrowsStyle}>
              <Image source={ASSETS.download} style={styles.download} contentFit="contain" />
            </Animated.View>
          )}
        </View>
        {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.shield} contentFit="contain" transition={150} /> : <View style={styles.shield} />}
      </View>

      <View style={[styles.card, styles.messageCard]}>
        <ThemedText style={styles.message}>{message}</ThemedText>
      </View>

      <View style={styles.wordCard} onLayout={event => setWordWidth(event.nativeEvent.layout.width)}>
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
    zIndex: 100,
    backgroundColor: AppColors.canvas,
    paddingHorizontal: AppSpacing.md,
    gap: AppSpacing.md,
  },
  card: {
    minHeight: 158,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 32,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  mark: {
    width: 74,
    height: 96,
  },
  link: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secure: {
    width: 96,
    height: 96,
  },
  download: {
    width: 78,
    height: 16,
  },
  shield: {
    width: 72,
    height: 86,
  },
  messageCard: {
    minHeight: 111,
    justifyContent: 'flex-start',
  },
  message: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textSecondary,
  },
  wordCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 24,
    padding: 32,
    overflow: 'hidden',
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.primary,
  },
  netSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
