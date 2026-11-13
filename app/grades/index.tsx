import { GradesLocked } from '@/components/grades/grades-lock';
import { Stripes } from '@/components/grades/stripes';
import { ThemedText } from '@/components/themed-text';
import { HanetSegmented } from '@/components/ui/hanet-auth-fields';
import { HanetAvatar } from '@/components/ui/hanet-avatar';
import { HanetButton } from '@/components/ui/hanet-button';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { AppColors, AppDisplay, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import type { MyProfile } from '@/services/auth-service';
import { cached, useCached } from '@/services/cache';
import { getMyGradeBook } from '@/services/classhall-service';
import type { GradeBook, GradeBookSubject } from '@/services/classhall-service';
import { currentSemester, gradesIn, overallAverage, subjectAverage } from '@/services/grade-book';
import type { Period } from '@/services/grade-book';
import { formatGrade } from '@/services/grades';
import { useGradesLock } from '@/services/grades-lock';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';
import { useDocumentScroll } from '@/hooks/use-document-scroll';

// Notas: every subject of the student with its approximate average, by
// semester or for the year, and the grades still covered on top. Reached from
// the Home tile; each subject opens its detail (app/grades/subject.tsx).

type Choice = 's1' | 's2' | 'year';

const PERIOD: Record<Choice, Period> = { s1: 1, s2: 2, year: 'year' };

function unseenIn(subject: GradeBookSubject) {
  return subject.grades.filter(grade => !grade.seen).length;
}

export default function GradesScreen() {
  // On a phone's browser the page scrolls with it, so the browser's bars shrink.
  const pageScroll = useDocumentScroll();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();
  const profile = useCached<MyProfile>(user ? 'profile' : null);
  const kept = useCached<GradeBook>(user ? 'gradebook' : null);
  const [fresh, setFresh] = useState<GradeBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [choice, setChoice] = useState<Choice>(() => (currentSemester() === 1 ? 's1' : 's2'));

  // Reloads when coming back from a subject, where a grade may have been uncovered.
  useFocusEffect(useCallback(() => {
    if (!user) return;
    let active = true;
    cached('gradebook', getMyGradeBook)
      .then(result => { if (active) { setFresh(result); setError(null); } })
      .catch(loadError => { if (active) setError(describeAuthError(loadError, t('grades.noPudimosCargarTusNotas'))); });
    return () => { active = false; };
    // `attempt` re-runs the load from the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, attempt]));

  const { locked } = useGradesLock();
  const book = locked ? undefined : fresh ?? kept;
  const period = PERIOD[choice];
  const subjects = book?.on ? book.subjects : [];
  const pending = subjects.filter(subject => unseenIn(subject) > 0);
  const pendingCount = pending.reduce((sum, subject) => sum + unseenIn(subject), 0);
  const average = overallAverage(subjects, period);
  const count = subjects.reduce((sum, subject) => sum + gradesIn(subject.grades, period).filter(grade => grade.seen).length, 0);
  const periodName = choice === 's1' ? t('grades.n1erSemestre') : choice === 's2' ? t('grades.n2Semestre') : t('grades.anual');

  const open = (subject: GradeBookSubject) => router.push({ pathname: '/grades/subject', params: { hallId: subject.hallId, subject: subject.subject, teacher: subject.teacherName ?? '' } });

  return (
    <FrostedScreen style={styles.screen}>
      <ScrollView ref={pageScroll} contentContainerStyle={withTopInset(styles.page, insets.top)} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={styles.eyebrow}>ClassHall</ThemedText>
          <ThemedText accessibilityRole="header" style={styles.title}>{t('classhall.evaluation.notas')}</ThemedText>
        </View>

        {!!book?.on && (
          <View style={styles.identity}>
            <HanetAvatar seed={profile?.avatarSeed} fallback={(profile?.fullName ?? '').slice(0, 1).toLocaleUpperCase('es')} width={48} height={56} radius={16} />
            <View style={styles.identityText}>
              <ThemedText style={styles.course}>{book.courseId ?? 'Tu curso'}</ThemedText>
              {!!book.institutionName && <ThemedText style={styles.muted}>{book.institutionName}</ThemedText>}
            </View>
          </View>
        )}

        {locked && <GradesLocked auto />}
        {!locked && !book && !error && <ActivityIndicator color={AppColors.textSecondary} style={styles.loading} />}
        {!locked && !book && !!error && (
          <View style={styles.card}>
            <ThemedText accessibilityLiveRegion="polite" style={styles.body}>{error}</ThemedText>
            <HanetButton label={t('common.reintentar')} variant="surface" onPress={() => { setError(null); setAttempt(value => value + 1); }} />
          </View>
        )}
        {book && !book.on && (
          <View style={styles.card}>
            <ThemedText style={styles.body}>{t('grades.notasNoEstaActivoEn')}</ThemedText>
          </View>
        )}

        {pendingCount > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('grades.tienesCountNotasPorDestapar', { count: pendingCount, subject: pending[0].subject })}
            onPress={() => router.push('/grades/reveal')}
            style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
          >
            <Stripes />
            <View style={styles.bannerText}>
              <ThemedText style={styles.bannerTitle}>{t('grades.tienesCountNotasPorDestapar2', { count: pendingCount })}</ThemedText>
              <ThemedText numberOfLines={1} style={styles.bannerSub}>{pending.map(subject => subject.subject).join(', ')}</ThemedText>
            </View>
            <View style={styles.bannerButton}>
              <ThemedText style={styles.bannerButtonText}>{t('grades.destapar')}</ThemedText>
            </View>
          </Pressable>
        )}

        {!!book?.on && (
          <>
            <View style={styles.summary} accessible accessibilityLabel={average === null ? t('grades.periodnameTodaviaNoHayNotas', { periodName }) : t('grades.promedioAproximadoDelPeriodnameGrade', { periodName, grade: formatGrade(average), countValue: count })}>
              <View style={styles.summaryTop}>
                <View>
                  <ThemedText style={styles.muted}>{t('grades.promedioAproximadoPeriodname', { periodName })}</ThemedText>
                  <ThemedText style={styles.big}>{average === null ? '—' : formatGrade(average)}</ThemedText>
                </View>
                <View style={styles.summaryCount}>
                  <ThemedText style={styles.countNumber}>{count}</ThemedText>
                  <ThemedText style={styles.muted}>{t('grades.notasEnHanet', { count })}</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.muted}>{t('grades.calculadoConLasNotasQue')}</ThemedText>
            </View>

            <HanetSegmented<Choice>
              accessibilityLabel={t('grades.periodo')}
              value={choice}
              onChange={setChoice}
              options={[
                { value: 's1', label: t('grades.n1erSemestre'), accessibilityLabel: t('grades.primerSemestre') },
                { value: 's2', label: t('grades.n2Semestre'), accessibilityLabel: t('grades.segundoSemestre') },
                { value: 'year', label: t('grades.anual'), accessibilityLabel: t('grades.anual') },
              ]}
            />

            {subjects.length === 0 ? (
              <View style={styles.card}>
                <ThemedText style={styles.body}>{t('grades.todaviaNoTienesClasesEn')}</ThemedText>
              </View>
            ) : (
              <View style={styles.list}>
                <View style={styles.listHead}>
                  <ThemedText style={styles.muted}>{t('classhall.create.asignatura')}</ThemedText>
                  <ThemedText style={styles.muted}>{t('tools.grades.promedio')}</ThemedText>
                </View>
                {subjects.map(subject => {
                  const value = subjectAverage(subject.grades, period);
                  const shown = gradesIn(subject.grades, period);
                  const seenCount = shown.filter(grade => grade.seen).length;
                  const covered = shown.filter(grade => !grade.seen).length;
                  const none = subject.grades.length === 0;
                  return (
                    <Pressable
                      key={subject.hallId}
                      accessibilityRole="button"
                      accessibilityLabel={`${subject.subject}: ${value === null ? t('grades.sinPromedio') : `promedio ${formatGrade(value)}`}${covered ? t('grades.coveredPorDestapar', { covered }) : ''}`}
                      onPress={() => open(subject)}
                      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    >
                      <View style={styles.rowText}>
                        <ThemedText style={styles.rowTitle}>{subject.subject}</ThemedText>
                        <View style={styles.rowMetaLine}>
                          <ThemedText style={styles.muted}>{none ? t('grades.sinNotasEnHanet') : t('grades.countNotas', { count: seenCount })}</ThemedText>
                          {covered > 0 && (
                            <View style={styles.newPill}>
                              <Stripes />
                              <ThemedText style={styles.newPillText}>{t('grades.countNuevas', { count: covered })}</ThemedText>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={[styles.gradePill, value === null && styles.gradePillEmpty]}>
                        <ThemedText style={[styles.gradeText, value === null && styles.gradeTextEmpty]}>{value === null ? '—' : formatGrade(value)}</ThemedText>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={AppColors.surfaceSoft} />
                    </Pressable>
                  );
                })}
              </View>
            )}
            <ThemedText style={styles.hint}>{t('grades.lasAsignaturasSinNotasEn')}</ThemedText>
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
  identity: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  identityText: { flex: 1, gap: 2 },
  course: { ...AppType.headline, fontSize: 17, color: AppColors.textPrimary },
  muted: { ...AppType.footnote, color: AppColors.textSecondary },
  body: { ...AppType.callout, color: AppColors.textPrimary },
  hint: { ...AppType.footnote, color: AppColors.textSecondary, paddingHorizontal: AppSpacing.xs },
  card: { gap: AppSpacing.md, padding: AppSpacing.lg, borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.surface },
  pressed: { opacity: AppPressed.opacity, transform: [{ scale: 0.98 }] },
  banner: { minHeight: 84, paddingVertical: 16, paddingLeft: 18, paddingRight: 14, borderRadius: AppRadii.lg, borderCurve: 'continuous', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { ...AppType.title3, fontSize: 19, lineHeight: 24, color: AppColors.textPrimary },
  bannerSub: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  bannerButton: { height: 44, paddingHorizontal: 18, borderRadius: AppRadii.pill, backgroundColor: AppColors.textPrimary, alignItems: 'center', justifyContent: 'center' },
  bannerButtonText: { ...AppType.headline, color: AppColors.textOnLight },
  summary: { gap: AppSpacing.sm, paddingVertical: 18, paddingHorizontal: 20, borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.surface },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: AppSpacing.md },
  big: { ...AppDisplay.number, fontSize: 64, lineHeight: 68, color: AppColors.textPrimary, fontVariant: ['tabular-nums'] },
  summaryCount: { alignItems: 'flex-end', paddingBottom: 8 },
  countNumber: { ...AppType.title2, color: AppColors.textPrimary },
  list: { borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.surface, overflow: 'hidden' },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8 },
  row: { minHeight: 64, paddingVertical: 10, paddingLeft: 18, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AppColors.surfaceMuted },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { ...AppType.body, fontFamily: 'DMSans_500Medium', lineHeight: 20, color: AppColors.textPrimary },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm },
  newPill: { height: 22, paddingHorizontal: 9, borderRadius: AppRadii.pill, overflow: 'hidden', justifyContent: 'center' },
  newPillText: { ...AppType.caption, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  gradePill: { minWidth: 56, height: 40, paddingHorizontal: 10, borderRadius: AppRadii.pill, backgroundColor: AppColors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  gradePillEmpty: { backgroundColor: 'transparent' },
  gradeText: { ...AppType.headline, fontSize: 18, color: AppColors.textPrimary, fontVariant: ['tabular-nums'] },
  gradeTextEmpty: { color: AppColors.surfaceSoft },
});
