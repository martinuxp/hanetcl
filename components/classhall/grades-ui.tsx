import { hallDay } from '@/components/classhall/hall-ui';
import { GradesLocked } from '@/components/grades/grades-lock';
import { Stripes } from '@/components/grades/stripes';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { getMyGrades } from '@/services/classhall-service';
import type { MyGrade } from '@/services/classhall-service';
import { approximateAverage } from '@/services/grade-book';
import { formatGrade } from '@/services/grades';
import { useGradesLock } from '@/services/grades-lock';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { t } from '@/i18n';

// Notas in a Hall, for the student: each new grade comes covered, to scratch
// it off or uncover it with the button; uncovered grades stay in the list
// with an approximate average. The liceo's average is the official one.


export function gradeMeta(grade: MyGrade) {
  return [grade.date ? hallDay(grade.date) : null, grade.weight ? `${grade.weight} %` : null].filter(Boolean).join(' · ');
}

/** The grades still covered, as a striped banner that opens the full-screen reveal. */
export function NewGradesBanner({ hallId, subject, count }: { hallId: string; subject: string; count: number }) {
  const router = useRouter();
  if (!count) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('components.classhall.gradesUi.tienesCountNotasNuevasDestapar', { count })}
      onPress={() => router.push({ pathname: '/grades/reveal', params: { hallId, subject } })}
      style={({ pressed }) => [styles.banner, pressed && styles.bannerPressed]}
    >
      <Stripes />
      <ThemedText style={styles.bannerTitle}>{t('components.classhall.gradesUi.tienesCountNotasNuevas', { count })}</ThemedText>
      <View style={styles.bannerButton}>
        <ThemedText style={styles.bannerButtonText}>{t('grades.destapar')}</ThemedText>
      </View>
    </Pressable>
  );
}

const SHOWN_AT_FIRST = 3;

/**
 * The student's grades at the top of the Hall: new ones covered, then the
 * ones already seen. Shows nothing while the Hall has no grade for them.
 * `expected`: new grades getHall counted, so loading shows only when there are some.
 */
export function StudentGrades({ hallId, subject, expected }: { hallId: string; subject: string; expected: number }) {
  const [grades, setGrades] = useState<MyGrade[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const { locked } = useGradesLock();

  // Reloads when coming back from the reveal.
  useFocusEffect(useCallback(() => {
    let active = true;
    getMyGrades(hallId)
      .then(result => { if (active) { setGrades(result); setError(null); } })
      .catch(loadError => { if (active) setError(describeAuthError(loadError, t('components.classhall.gradesUi.noPudimosCargarTusNotas'))); });
    return () => { active = false; };
    // `attempt` re-runs the load from the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hallId, attempt]));

  if (error && !grades) {
    if (!expected) return null;
    return (
      <View style={styles.card}>
        <ThemedText accessibilityLiveRegion="polite" style={styles.body}>{error}</ThemedText>
        <HanetButton label={t('common.reintentar')} variant="surface" onPress={() => { setError(null); setAttempt(count => count + 1); }} />
      </View>
    );
  }
  if (!grades) {
    if (!expected) return null;
    return (
      <View style={styles.card}>
        <ThemedText style={styles.body}>{t('components.classhall.gradesUi.cargandoTusNotas')}</ThemedText>
      </View>
    );
  }
  if (!grades.length) return null;
  if (locked) return <GradesLocked />;

  const unseen = grades.filter(grade => !grade.seen);
  const seen = grades.filter(grade => grade.seen);
  const shown = showAll ? seen : seen.slice(0, SHOWN_AT_FIRST);
  const average = approximateAverage(seen);

  return (
    <View style={styles.wrap}>
      <NewGradesBanner hallId={hallId} subject={subject} count={unseen.length} />
      {seen.length > 0 && (
        <>
          <ThemedText style={styles.label}>{t('components.classhall.gradesUi.tusNotas')}</ThemedText>
          <View style={styles.list}>
            {shown.map((grade, index) => (
              <View
                key={grade.evaluationId}
                style={[styles.row, index > 0 && styles.rowRule]}
                accessible
                accessibilityLabel={`${grade.title}${grade.weight ? `, ${grade.weight} %` : ''}: ${formatGrade(grade.grade)}`}
              >
                <View style={styles.rowText}>
                  <ThemedText numberOfLines={2} style={styles.rowTitle}>{grade.title}</ThemedText>
                  {!!gradeMeta(grade) && <ThemedText style={styles.rowMeta}>{gradeMeta(grade)}</ThemedText>}
                </View>
                <ThemedText style={styles.rowGrade}>{formatGrade(grade.grade)}</ThemedText>
              </View>
            ))}
            {average && (
              <View style={[styles.row, styles.rowRule]} accessible accessibilityLabel={`${average.weighted ? t('components.classhall.gradesUi.promedioPonderadoAproximado') : t('components.classhall.gradesUi.promedioAproximado')}: ${formatGrade(average.value)}`}>
                <ThemedText style={styles.averageLabel}>{average.weighted ? t('components.classhall.gradesUi.promedioPonderadoAproximado') : t('components.classhall.gradesUi.promedioAproximado')}</ThemedText>
                <ThemedText style={styles.rowGrade}>{formatGrade(average.value)}</ThemedText>
              </View>
            )}
          </View>
          {seen.length > SHOWN_AT_FIRST && (
            <HanetButton label={showAll ? t('anniversary.verMenos') : t('components.classhall.gradesUi.verLasSeencountNotas', { seenCount: seen.length })} variant="surface" onPress={() => setShowAll(value => !value)} />
          )}
          <ThemedText style={styles.hint}>{t('components.classhall.gradesUi.elPromedioOficialEsEl')}</ThemedText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { minHeight: 72, paddingVertical: 14, paddingLeft: 18, paddingRight: 12, borderRadius: AppRadii.lg, borderCurve: 'continuous', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  bannerPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  bannerTitle: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 23, letterSpacing: -0.4, color: AppColors.textPrimary },
  bannerButton: { height: 44, paddingHorizontal: 18, borderRadius: AppRadii.pill, backgroundColor: AppColors.textPrimary, alignItems: 'center', justifyContent: 'center' },
  bannerButtonText: { fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 20, color: AppColors.textOnLight },
  wrap: {
    gap: AppSpacing.md,
  },
  label: {
    marginTop: AppSpacing.sm,
    paddingHorizontal: AppSpacing.xs,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  card: {
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.xs,
  },
  cardTitle: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  cardMeta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  corrected: {
    paddingHorizontal: AppSpacing.xs,
    marginTop: -AppSpacing.xs,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  grade: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 72,
    lineHeight: 80,
    letterSpacing: -4,
    color: AppColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  gradeNote: {
    minHeight: 18,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  action: {
    flex: 1,
  },
  list: {
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.xs,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
  },
  rowRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.surfaceMuted,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  rowMeta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  rowGrade: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 17,
    lineHeight: 22,
    color: AppColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  averageLabel: {
    flex: 1,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  hint: {
    paddingHorizontal: AppSpacing.xs,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: AppColors.textPrimary,
  },
  emptyTitle: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.5,
    color: AppColors.textPrimary,
  },
});
