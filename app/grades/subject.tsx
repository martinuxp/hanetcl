import { gradeMeta, NewGradesBanner } from '@/components/classhall/grades-ui';
import { GradesLocked } from '@/components/grades/grades-lock';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { AppColors, AppDisplay, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { getMyGrades } from '@/services/classhall-service';
import type { MyGrade } from '@/services/classhall-service';
import { currentSemester, inSemester, subjectAverage, thisYear } from '@/services/grade-book';
import { formatGrade } from '@/services/grades';
import { useGradesLock } from '@/services/grades-lock';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

// One subject in Notas: its averages, the grades still covered (to scratch
// off, as in the Hall) and the rest by semester, with their weights.

function GradeList({ grades }: { grades: MyGrade[] }) {
  return (
    <View style={styles.list}>
      {grades.map((grade, index) => (
        <View
          key={grade.evaluationId}
          style={[styles.row, index > 0 && styles.rowRule]}
          accessible
          accessibilityLabel={`${grade.title}${grade.weight ? `, ${grade.weight} %` : ''}: ${formatGrade(grade.grade)}`}
        >
          <View style={styles.rowText}>
            <ThemedText style={styles.rowTitle}>{grade.title}</ThemedText>
            {!!gradeMeta(grade) && <ThemedText style={styles.muted}>{gradeMeta(grade)}</ThemedText>}
          </View>
          <View style={styles.gradePill}>
            <ThemedText style={styles.gradeText}>{formatGrade(grade.grade)}</ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function SubjectGradesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hallId, subject, teacher } = useLocalSearchParams<{ hallId: string; subject?: string; teacher?: string }>();
  const [loaded, setGrades] = useState<MyGrade[] | null>(null);
  const { locked } = useGradesLock();
  const grades = locked ? null : loaded;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showFirst, setShowFirst] = useState(false);

  // Reloads when coming back from the reveal.
  useFocusEffect(useCallback(() => {
    if (!hallId) return;
    let active = true;
    getMyGrades(hallId)
      .then(result => { if (active) { setGrades(result); setError(null); } })
      .catch(loadError => { if (active) setError(describeAuthError(loadError, t('grades.noPudimosCargarTusNotas'))); });
    return () => { active = false; };
    // `attempt` re-runs the load from the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hallId, attempt]));

  const all = grades ?? [];
  const covered = all.filter(grade => !grade.seen);
  const seen = thisYear(all).filter(grade => grade.seen);
  const now = currentSemester();
  const semesters = (now === 2 ? [2, 1] : [1]) as (1 | 2)[];
  const current = subjectAverage(all, now);
  const year = subjectAverage(all, 'year');

  return (
    <FrostedScreen style={styles.screen}>
      <ScrollView contentContainerStyle={withTopInset(styles.page, insets.top)} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={styles.eyebrow}>{t('classhall.evaluation.notas')}</ThemedText>
          <ThemedText accessibilityRole="header" style={styles.title}>{subject || 'Asignatura'}</ThemedText>
          {!!teacher && <ThemedText style={styles.muted}>{t('grades.subject.docenteTeacher', { teacher })}</ThemedText>}
        </View>

        {locked && <GradesLocked auto />}
        {!locked && !grades && !error && <ActivityIndicator color={AppColors.textSecondary} style={styles.loading} />}
        {!locked && !grades && !!error && (
          <View style={styles.card}>
            <ThemedText accessibilityLiveRegion="polite" style={styles.body}>{error}</ThemedText>
            <HanetButton label={t('common.reintentar')} variant="surface" onPress={() => { setError(null); setAttempt(value => value + 1); }} />
          </View>
        )}

        {!!grades && (
          <>
            <View style={styles.pair}>
              <View style={styles.stat} accessible accessibilityLabel={t('grades.subject.n2SemestreValueAproximado', { count: now, value: current === null ? t('grades.sinPromedio') : formatGrade(current) })}>
                <ThemedText style={styles.muted}>{t('grades.subject.n2Semestre', { count: now })}</ThemedText>
                <ThemedText style={styles.big}>{current === null ? '—' : formatGrade(current)}</ThemedText>
                <ThemedText style={styles.muted}>{'aproximado'}</ThemedText>
              </View>
              <View style={styles.stat} accessible accessibilityLabel={t('grades.subject.anualValueAproximado', { value: year === null ? t('grades.sinPromedio') : formatGrade(year) })}>
                <ThemedText style={styles.muted}>{t('grades.anual')}</ThemedText>
                <ThemedText style={styles.big}>{year === null ? '—' : formatGrade(year)}</ThemedText>
                <ThemedText style={styles.muted}>{'aproximado'}</ThemedText>
              </View>
            </View>

            <NewGradesBanner hallId={hallId} subject={subject ?? ''} count={covered.length} />

            {grades.length === 0 && (
              <View style={styles.card}>
                <ThemedText style={styles.body}>{t('grades.subject.todaviaNoHayNotasDe')}</ThemedText>
              </View>
            )}

            {semesters.map(semester => {
              const list = inSemester(seen, semester);
              if (!list.length) return null;
              const name = t('grades.subject.n2Semestre', { count: semester });
              const average = subjectAverage(all, semester);
              const folded = semester === 1 && now === 2 && !showFirst;
              return (
                <View key={semester} style={styles.section}>
                  <ThemedText style={styles.label}>{name}</ThemedText>
                  {folded ? (
                    <HanetButton
                      label={t('grades.subject.countNotasValueVer', { count: list.length, value: average === null ? '' : t('grades.subject.promedioGrade', { grade: formatGrade(average) }) })}
                      variant="surface"
                      onPress={() => setShowFirst(true)}
                    />
                  ) : (
                    <GradeList grades={list} />
                  )}
                </View>
              );
            })}

            <HanetButton label={t('components.schedule.scheduleView.abrirElHall')} onPress={() => router.push({ pathname: '/classhall/hall', params: { id: hallId } })} />
            <ThemedText style={styles.hint}>{t('grades.subject.promedioPonderadoCuandoCadaEvaluacion')}</ThemedText>
          </>
        )}
      </ScrollView>
    </FrostedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas },
  page: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingBottom: 150, gap: AppSpacing.lg },
  header: { paddingTop: AppSpacing.lg, gap: AppSpacing.xs },
  eyebrow: { ...AppType.caption, color: AppColors.textSecondary },
  title: { ...AppType.title1, color: AppColors.textPrimary },
  loading: { marginTop: AppSpacing.xxl },
  muted: { ...AppType.footnote, color: AppColors.textSecondary },
  body: { ...AppType.callout, color: AppColors.textPrimary },
  hint: { ...AppType.footnote, color: AppColors.textSecondary, paddingHorizontal: AppSpacing.xs },
  label: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textSecondary, paddingHorizontal: AppSpacing.xs },
  card: { gap: AppSpacing.md, padding: AppSpacing.lg, borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.surface },
  section: { gap: AppSpacing.md },
  pair: { flexDirection: 'row', gap: AppSpacing.md },
  stat: { flex: 1, gap: 2, paddingVertical: 16, paddingHorizontal: 18, borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.surface },
  big: { ...AppDisplay.number, fontSize: 44, lineHeight: 48, color: AppColors.textPrimary, fontVariant: ['tabular-nums'] },
  list: { borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.surface, overflow: 'hidden' },
  row: { minHeight: 60, paddingVertical: 10, paddingLeft: 18, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AppColors.surfaceMuted },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { ...AppType.body, fontFamily: 'DMSans_500Medium', lineHeight: 20, color: AppColors.textPrimary },
  gradePill: { minWidth: 56, height: 40, paddingHorizontal: 10, borderRadius: AppRadii.pill, backgroundColor: AppColors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  gradeText: { ...AppType.headline, fontSize: 18, color: AppColors.textPrimary, fontVariant: ['tabular-nums'] },
});
