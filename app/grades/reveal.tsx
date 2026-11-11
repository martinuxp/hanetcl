import { gradeMeta } from '@/components/classhall/grades-ui';
import { ScratchCard } from '@/components/classhall/scratch-card';
import { GradesLocked } from '@/components/grades/grades-lock';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppDisplay, AppSpacing, AppType } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { dropCached } from '@/services/cache';
import { getMyGradeBook, getMyGrades, markGradeSeen } from '@/services/classhall-service';
import type { MyGrade } from '@/services/classhall-service';
import { addGradeToCalculator, formatGrade } from '@/services/grades';
import { useGradesLock } from '@/services/grades-lock';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

// Uncovering a new grade is its own moment: the whole screen, one grade at a
// time, a big card to scratch. With `hallId` it takes that Hall's new grades,
// without it every new grade the student has. The screen is the same for
// every grade; only a high one gets a burst once it is showing.

type Pending = MyGrade & { hallId: string; subject: string };

export default function RevealGradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { hallId, subject } = useLocalSearchParams<{ hallId?: string; subject?: string }>();
  const { locked } = useGradesLock();
  const [queue, setQueue] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    const load = hallId
      ? getMyGrades(hallId).then(grades => grades.filter(grade => !grade.seen).map(grade => ({ ...grade, hallId, subject: subject ?? '' })))
      : getMyGradeBook().then(book => (book.on ? book.subjects.flatMap(item => item.grades.filter(grade => !grade.seen).map(grade => ({ ...grade, hallId: item.hallId, subject: item.subject }))) : []));
    load
      .then(result => { if (active) setQueue(result.reverse()); })
      .catch(loadError => { if (active) setError(describeAuthError(loadError, t('grades.noPudimosCargarTusNotas'))); });
    return () => { active = false; };
  }, [hallId, subject]);

  const current = queue?.[index];
  const close = () => (router.canGoBack() ? router.back() : router.replace('/grades'));

  const reveal = () => {
    if (!current || revealed) return;
    setRevealed(true);
    markGradeSeen(current.hallId, current.evaluationId).catch(() => undefined);
    // ClassHall, Notas and the Home tile stop counting it as new.
    dropCached('halls');
    dropCached('gradebook');
    dropCached('gradesBadge');
  };

  const next = () => {
    if (!queue || index + 1 >= queue.length) {
      close();
      return;
    }
    setIndex(value => value + 1);
    setRevealed(false);
  };

  const addToCalculator = async () => {
    if (!current || adding) return;
    setAdding(true);
    await addGradeToCalculator(current.grade, current.weight);
    setAdding(false);
    router.replace('/tools/grades');
  };

  const last = !!queue && index + 1 >= queue.length;
  const cardHeight = Math.min(340, Math.max(220, screenHeight * 0.36));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + AppSpacing.sm, paddingBottom: insets.bottom + AppSpacing.lg }]}>
      <View style={styles.top}>
        <ThemedText style={styles.counter}>{queue && queue.length > 1 ? `${index + 1} de ${queue.length}` : ''}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.cerrar')} onPress={close} hitSlop={8} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Ionicons name="close" size={22} color={AppColors.textPrimary} />
        </Pressable>
      </View>

      {locked ? (
        <View style={styles.center}><GradesLocked auto /></View>
      ) : !queue ? (
        <View style={styles.center}>
          {error ? (
            <>
              <ThemedText style={styles.body}>{error}</ThemedText>
              <HanetButton label={t('common.cerrar')} variant="surface" onPress={close} />
            </>
          ) : <ActivityIndicator color={AppColors.textSecondary} />}
        </View>
      ) : !current ? (
        <View style={styles.center}>
          <ThemedText style={styles.title}>{t('grades.reveal.noTienesNotasPorDestapar')}</ThemedText>
          <HanetButton label={t('common.cerrar')} variant="surface" onPress={close} />
        </View>
      ) : (
        <View key={current.evaluationId} style={styles.stage}>
          <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(320)} style={styles.heading}>
            <ThemedText style={styles.subject}>{current.subject}</ThemedText>
            <ThemedText accessibilityRole="header" style={styles.title}>{current.title}</ThemedText>
            {!!gradeMeta(current) && <ThemedText style={styles.meta}>{gradeMeta(current)}</ThemedText>}
            {current.corrected && <ThemedText style={styles.meta}>{t('components.classhall.gradesUi.tuDocenteCorrigioEstaNota')}</ThemedText>}
          </Animated.View>

          <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(120).duration(360)}>
            <ScratchCard
              height={cardHeight}
              revealed={revealed}
              onReveal={reveal}
              celebrate={current.grade >= 6}
              label={t('components.classhall.gradesUi.raspaParaVerTuNota')}
              accessibilityLabel={t('components.classhall.gradesUi.notaDeTitleTapada', { title: current.title })}
              accessibilityHint={t('grades.reveal.raspaConElDedoO')}
            >
              <ThemedText style={styles.grade} accessibilityLabel={t('components.classhall.gradesUi.tuNotaEsGrade', { grade: formatGrade(current.grade) })}>{formatGrade(current.grade)}</ThemedText>
            </ScratchCard>
          </Animated.View>

          <View style={styles.actions}>
            {revealed ? (
              <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(380).duration(260)} style={styles.actionsInner}>
                <HanetButton label={last ? t('common.listo') : t('grades.reveal.siguienteNota')} onPress={next} />
                <HanetButton label={adding ? t('common.guardando') : t('components.classhall.gradesUi.agregarALaCalculadora')} variant="surface" disabled={adding} onPress={() => void addToCalculator()} />
              </Animated.View>
            ) : (
              <HanetButton label={t('components.classhall.gradesUi.verSinRaspar')} variant="surface" onPress={reveal} />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas, paddingHorizontal: AppSpacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  counter: { ...AppType.callout, color: AppColors.textSecondary },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.84 },
  center: { flex: 1, justifyContent: 'center', gap: AppSpacing.lg, width: '100%', maxWidth: 520, alignSelf: 'center' },
  body: { ...AppType.callout, color: AppColors.textPrimary, textAlign: 'center' },
  stage: { flex: 1, justifyContent: 'center', gap: AppSpacing.xl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  heading: { gap: AppSpacing.xs, alignItems: 'center' },
  subject: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textSecondary, textAlign: 'center' },
  title: { ...AppType.title2, color: AppColors.textPrimary, textAlign: 'center' },
  meta: { ...AppType.footnote, color: AppColors.textSecondary, textAlign: 'center' },
  grade: { ...AppDisplay.number, fontSize: 112, lineHeight: 120, color: AppColors.textPrimary, fontVariant: ['tabular-nums'] },
  actions: { minHeight: 112, justifyContent: 'flex-start' },
  actionsInner: { gap: AppSpacing.sm },
});
