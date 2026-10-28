import { TrophyIcon } from '@/assets/animated-icons/trophy';
import { allianceFills } from '@/components/anniversary/anniversary-ui';
import { GradientCard } from '@/components/anniversary/gradient-card';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppFlexFonts, AppType } from '@/constants/design-tokens';
import type { Anniversary } from '@/services/anniversary-service';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

// The Home tile once the anniversary has started and this device hasn't
// opened it yet: lit by the alianzas' colors, with rings that go out from
// the trophy like a bell, asking for the tap that opens the welcome.

const CYCLE_MS = 2400;
const RING = 44;

function Ring({ delay }: { delay: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.out(Easing.cubic) }), -1, false));
  }, [delay, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - progress.value),
    transform: [{ scale: 0.7 + progress.value * 1.3 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
}

export function CelebrationTile({ anniversary, day, height }: { anniversary: Anniversary; day: string; height: number }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const mine = anniversary.alliances.find(alliance => alliance.id === anniversary.myAllianceId);
  const fills = allianceFills([...(mine ? [mine] : []), ...anniversary.alliances.filter(alliance => alliance.id !== mine?.id)]);

  // The trophy jumps when each ring leaves it.
  const bump = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    bump.value = withRepeat(
      withSequence(withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 320, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: CYCLE_MS - 460 })),
      -1,
      false,
    );
  }, [bump, reduceMotion]);
  const trophyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -4 * bump.value }, { rotate: `${-8 * bump.value}deg` }, { scale: 1 + 0.08 * bump.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`¡Empezó el ${anniversary.title}! ${day}. Toca para entrar`}
      onPress={() => router.push('/anniversary')}
      style={({ pressed }) => [styles.press, { minHeight: height }, pressed && styles.pressed]}
    >
      <GradientCard colors={fills} style={styles.card}>
        <View style={styles.head}>
          <View style={styles.trophy}>
            {!reduceMotion && <Ring delay={0} />}
            {!reduceMotion && <Ring delay={CYCLE_MS / 2} />}
            <Animated.View style={trophyStyle}>
              <TrophyIcon size={26} color={AppColors.textPrimary} />
            </Animated.View>
          </View>
          <ThemedText numberOfLines={1} style={styles.day}>{day}</ThemedText>
        </View>
        <ThemedText numberOfLines={2} style={styles.title}>¡Empezó el aniversario!</ThemedText>
        <View style={styles.pill}>
          <ThemedText style={styles.pillText}>Toca para entrar</ThemedText>
          <Ionicons name="chevron-forward" size={14} color={AppColors.textOnLight} />
        </View>
      </GradientCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: {
    borderRadius: 24,
    borderCurve: 'continuous',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  card: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 6,
    padding: 14,
    borderRadius: 24,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trophy: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RING / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: AppColors.textPrimary,
  },
  day: {
    flex: 1,
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: AppColors.textPrimary,
  },
  title: {
    fontFamily: AppFlexFonts.bold,
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: AppColors.textPrimary,
  },
  pillText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textOnLight,
  },
});
