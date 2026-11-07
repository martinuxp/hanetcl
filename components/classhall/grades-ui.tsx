import { ScratchCard } from '@/components/classhall/scratch-card';
import { hallDay } from '@/components/classhall/hall-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { dropCached } from '@/services/cache';
import { getMyGrades, markGradeSeen } from '@/services/classhall-service';
import type { MyGrade } from '@/services/classhall-service';
import { approximateAverage } from '@/services/grade-book';
import { addGradeToCalculator, formatGrade } from '@/services/grades';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '@/i18n';

// Notas in a Hall, for the student: each new grade comes covered, to scratch
// it off or uncover it with the button; uncovered grades stay in the list
// with an approximate average. The liceo's average is the official one.

const SCRATCH_HEIGHT = 148;

export function gradeMeta(grade: MyGrade) {
  return [grade.date ? hallDay(grade.date) : null, grade.weight ? `${grade.weight} %` : null].filter(Boolean).join(' · ');
}

export function NewGradeCard({ hallId, grade, onSeen, onScratching }: { hallId: string; grade: MyGrade; onSeen: (id: string) => void; onScratching: (active: boolean) => void }) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [adding, setAdding] = useState(false);

  const reveal = () => {
    setRevealed(true);
    // Seen on this phone right away; the server hears it in the background.
    markGradeSeen(hallId, grade.evaluationId).catch(() => undefined);
    // ClassHall's card, Notas and the Home tile stop counting it as new.
    dropCached('halls');
    dropCached('gradebook');
    dropCached('gradesBadge');
  };

  const addToCalculator = async () => {
    if (adding) return;
    setAdding(true);
    await addGradeToCalculator(grade.grade, grade.weight);
    setAdding(false);
    onSeen(grade.evaluationId);
    router.push('/tools/grades');
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <ThemedText numberOfLines={2} style={styles.cardTitle}>{grade.title}</ThemedText>
        {!!gradeMeta(grade) && <ThemedText style={styles.cardMeta}>{gradeMeta(grade)}</ThemedText>}
      </View>
      {grade.corrected && <ThemedText style={styles.corrected}>{t('components.classhall.gradesUi.tuDocenteCorrigioEstaNota')}</ThemedText>}
      <ScratchCard
        height={SCRATCH_HEIGHT}
        revealed={revealed}
        onReveal={reveal}
        onScratching={onScratching}
        label={t('components.classhall.gradesUi.raspaParaVerTuNota')}
        accessibilityLabel={t('components.classhall.gradesUi.notaDeTitleTapada', { title: grade.title })}
        accessibilityHint={t('components.classhall.gradesUi.raspaConElDedoO')}
      >
        <ThemedText style={styles.grade} accessibilityLabel={t('components.classhall.gradesUi.tuNotaEsGrade', { grade: formatGrade(grade.grade) })}>{formatGrade(grade.grade)}</ThemedText>
        <ThemedText style={styles.gradeNote}>{revealed ? t('components.classhall.gradesUi.agregadaATusNotas') : ''}</ThemedText>
      </ScratchCard>
      {revealed ? (
        <View style={styles.actions}>
          <HanetButton label={adding ? t('common.guardando') : t('components.classhall.gradesUi.agregarALaCalculadora')} disabled={adding} onPress={() => void addToCalculator()} style={styles.action} />
          <HanetButton label={t('common.listo')} variant="surface" onPress={() => onSeen(grade.evaluationId)} style={styles.action} />
        </View>
      ) : (
        <HanetButton label={t('components.classhall.gradesUi.verSinRaspar')} variant="surface" onPress={reveal} />
      )}
    </View>
  );
}

const SHOWN_AT_FIRST = 3;

/**
 * The student's grades at the top of the Hall: new ones covered, then the
 * ones already seen. Shows nothing while the Hall has no grade for them.
 * `expected`: new grades getHall counted, so loading shows only when there are some.
 */
export function StudentGrades({ hallId, expected, onScratching }: { hallId: string; expected: number; onScratching: (active: boolean) => void }) {
  const [grades, setGrades] = useState<MyGrade[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showAll, setShowAll] = useState(false);
  // Uncovered in this visit: they stay on their card until "Listo".
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    getMyGrades(hallId)
      .then(result => { if (active) { setGrades(result); setError(null); } })
      .catch(loadError => { if (active) setError(describeAuthError(loadError, t('components.classhall.gradesUi.noPudimosCargarTusNotas'))); });
    return () => { active = false; };
  }, [hallId, attempt]);

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

  const unseen = grades.filter(grade => !grade.seen && !done.includes(grade.evaluationId));
  const seen = grades.filter(grade => grade.seen || done.includes(grade.evaluationId));
  const shown = showAll ? seen : seen.slice(0, SHOWN_AT_FIRST);
  const average = approximateAverage(seen);

  return (
    <View style={styles.wrap}>
      {unseen.length > 0 && (
        <>
          <ThemedText style={styles.label}>{t('components.classhall.gradesUi.notasNuevas', { count: unseen.length })}</ThemedText>
          {unseen.map(grade => (
            <NewGradeCard
              key={grade.evaluationId}
              hallId={hallId}
              grade={grade}
              onScratching={onScratching}
              onSeen={id => setDone(current => (current.includes(id) ? current : [...current, id]))}
            />
          ))}
        </>
      )}
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
