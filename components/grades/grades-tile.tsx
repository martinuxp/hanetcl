import { Stripes } from '@/components/grades/stripes';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppType } from '@/constants/design-tokens';
import { useRole, useSession } from '@/services/auth-service';
import { cached, useCached } from '@/services/cache';
import { getMyNewGradesCount } from '@/services/classhall-service';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { t } from '@/i18n';

// Notas inside ClassHall ("ClassHall y calificaciones", decided 2026-11-11;
// it was a tile on the Home): for students where the module is on.
// When grades wait to be uncovered it carries the scratch card's stripes and
// the count; it never shows a grade or an average, since it is what people
// glance at over a shoulder.

type Badge = Awaited<ReturnType<typeof getMyNewGradesCount>>;

const STAFF = ['Profesor', 'Admin', 'HNT'];

function GradesIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={AppColors.textOnLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <Path d="M14 3v5h5" />
      <Path d="M9 14l2 2 4-4" />
    </Svg>
  );
}

/**
 * For students where Notas is on: whether it is on and how many grades wait
 * to be uncovered (what the phone kept, then a fresh count on each visit).
 * null for staff, signed-out accounts and where the module is off.
 */
export function useGradesBadge() {
  const { user } = useSession();
  const role = useRole();
  const kept = useCached<Badge>(user ? 'gradesBadge' : null);
  const [fresh, setFresh] = useState<Badge | null>(null);
  const student = !!role && !STAFF.includes(role);

  useFocusEffect(useCallback(() => {
    if (!user || !student) return;
    let active = true;
    cached('gradesBadge', getMyNewGradesCount)
      .then(result => { if (active) setFresh(result); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [user, student]));

  const badge = fresh ?? kept;
  if (!user || !student || !badge?.on) return null;
  return { newGrades: badge.newGrades };
}

/** Notas at the top of ClassHall ("ClassHall y calificaciones"). */
export function GradesTile({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const badge = useGradesBadge();
  if (!badge) return null;
  const count = badge.newGrades;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count === 0 ? t('classhall.evaluation.notas') : t('components.grades.gradesTile.notasTienesCountNotasNuevas', { count })}
      onPress={() => router.push('/grades')}
      style={({ pressed }) => [styles.tile, style, pressed && styles.pressed]}
    >
      <GradesIcon />
      <View style={styles.text}>
        <ThemedText style={styles.title}>{t('classhall.evaluation.notas')}</ThemedText>
        <ThemedText style={styles.subtitle}>{t('components.grades.gradesTile.tusPromediosDeClasshall')}</ThemedText>
      </View>
      {count > 0 && (
        <View style={styles.badge}>
          <Stripes />
          <ThemedText style={styles.badgeMain}>{t('grades.countNuevas', { count })}</ThemedText>
          <ThemedText style={styles.badgeSub}>{t('components.grades.gradesTile.porDestapar')}</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 84,
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 10,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: AppColors.textOnLight,
  },
  subtitle: {
    ...AppType.footnote,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.surface,
  },
  badge: {
    width: 112,
    height: 64,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeMain: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  badgeSub: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
    lineHeight: 14,
    color: AppColors.textPrimary,
  },
});
