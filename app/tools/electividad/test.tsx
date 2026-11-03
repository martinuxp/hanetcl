import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import {
  getElectividad,
  loadProgress,
  peekElectividad,
  rememberResult,
  saveProgress,
  submitElectividad,
} from '@/services/electividad-service';
import type { Progress, Question } from '@/services/electividad-service';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

// The test itself: one "which would you rather" question at a time. Answers
// stay on the phone (so it can be paused) until the last one, when they go to
// the server, which scores them.

type Choice = 'a' | 'b';

/** How long the chosen bubble stays filled before the next question. */
const ADVANCE_MS = 380;
/** Time between two answers counts only up to this, so a pause isn't counted. */
const MAX_STEP_MS = 2 * 60 * 1000;

const clock = () => Date.now();

export default function ElectividadTestScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [questions, setQuestions] = useState<Question[] | null>(() => {
    const cached = peekElectividad();
    return cached?.questions?.length ? cached.questions : null;
  });
  const [progress, setProgress] = useState<Progress | null>(null);
  const [picked, setPicked] = useState<Choice | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const lastTick = useRef(0);
  const advancing = useRef(false);

  useEffect(() => {
    let alive = true;
    lastTick.current = clock();
    loadProgress().then(saved => {
      if (alive) setProgress(saved ?? { answers: {}, index: 0, activeMs: 0 });
    });
    getElectividad()
      .then(data => {
        // A new attempt works the same as the first one: the current result
        // moves to the history when this one is sent.
        if (alive) setQuestions(data.questions);
      })
      .catch(err => {
        if (alive) setError(describeAuthError(err, t('tools.electividad.test.noPudimosCargarLasPreguntas')));
      });
    return () => { alive = false; };
  }, [router]);

  const total = questions?.length ?? 72;
  const index = Math.min(progress?.index ?? 0, Math.max(total - 1, 0));
  const question = questions?.[index];
  const answeredCount = progress ? Object.keys(progress.answers).length : 0;
  const complete = !!questions && answeredCount >= questions.length;

  const bar = useSharedValue(0);
  useEffect(() => {
    const target = total ? answeredCount / total : 0;
    bar.value = reduceMotion ? target : withTiming(target, { duration: 240 });
  }, [answeredCount, bar, reduceMotion, total]);
  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));

  const send = useCallback(async (answers: Progress['answers'], activeMs: number) => {
    setSending(true);
    setError('');
    try {
      const result = await submitElectividad(answers, Math.round(activeMs / 1000));
      rememberResult(result);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/tools/electividad/reveal');
    } catch (err) {
      setSending(false);
      setError(describeAuthError(err, t('tools.electividad.test.noPudimosEnviarTusRespuestas')));
    }
  }, [router]);

  const choose = (choice: Choice) => {
    if (!progress || !questions || !question || advancing.current || sending) return;
    advancing.current = true;
    setPicked(choice);
    if (Platform.OS === 'ios') void Haptics.selectionAsync();
    const now = clock();
    const activeMs = progress.activeMs + Math.min(now - lastTick.current, MAX_STEP_MS);
    lastTick.current = now;
    const answers = { ...progress.answers, [question.id]: choice };
    // Forward one by one (a revised answer leads to the next question, already
    // answered or not); after the last one, back to any left open.
    const firstOpen = questions.findIndex(item => !answers[item.id]);
    const nextIndex = index + 1 < questions.length ? index + 1 : firstOpen >= 0 ? firstOpen : index;
    const next: Progress = { answers, index: nextIndex, activeMs };
    saveProgress(next);
    setTimeout(() => {
      advancing.current = false;
      setPicked(null);
      setProgress(next);
      if (firstOpen < 0) void send(answers, activeMs);
    }, reduceMotion ? 120 : ADVANCE_MS);
  };

  const goBack = () => {
    if (!progress || index === 0 || advancing.current || sending) return;
    const next = { ...progress, index: index - 1 };
    setProgress(next);
    saveProgress(next);
  };

  const pause = () => {
    if (progress && !sending) {
      const now = clock();
      saveProgress({ ...progress, activeMs: progress.activeMs + Math.min(now - lastTick.current, MAX_STEP_MS) });
    }
    router.back();
  };

  const current = question ? (picked ?? progress?.answers[question.id] ?? null) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + AppSpacing.sm, paddingBottom: insets.bottom + AppSpacing.lg }]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tools.electividad.test.cerrarElTestTusRespuestas')}
          hitSlop={8}
          onPress={pause}
          style={({ pressed }) => [styles.round, pressed && AppPressed]}
        >
          <Ionicons name="close" size={22} color={AppColors.textPrimary} />
        </Pressable>
        <ThemedText style={styles.topTitle}>{t('tools.electividad.reveal.testDeIntereses')}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tools.electividad.test.pausarPuedesSeguirDespuesDesde')}
          onPress={pause}
          disabled={sending}
          style={({ pressed }) => [styles.pausePill, pressed && AppPressed]}
        >
          <Ionicons name="pause" size={14} color={AppColors.textPrimary} />
          <ThemedText style={styles.pauseText}>{t('tools.electividad.test.pausar')}</ThemedText>
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.progressBlock}>
          <View style={styles.progressRow}>
            <ThemedText style={styles.counter}>{t('tools.electividad.test.preguntaNumberDeTotal', { number: Math.min(index + 1, total), total })}</ThemedText>
            <ThemedText style={styles.percent}>{Math.round((answeredCount / total) * 100)}%</ThemedText>
          </View>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: total, now: answeredCount }}
          >
            <Animated.View style={[styles.fill, barStyle]} />
          </View>
        </View>

        {!question && !error && <ActivityIndicator color={AppColors.textSecondary} style={styles.loading} />}

        {question && !sending && !complete && (
          <Animated.View key={question.id} entering={reduceMotion ? undefined : FadeIn.duration(160)} style={styles.questionBlock}>
            <ThemedText accessibilityRole="header" style={styles.prompt}>{t('tools.electividad.test.queActividadPrefieres')}</ThemedText>
            {(['a', 'b'] as const).map(choice => {
              const selected = current === choice;
              return (
                <Pressable
                  key={choice}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={t('tools.electividad.test.opcionChoiceQuestion', { choice: choice.toUpperCase(), question: question[choice] })}
                  onPress={() => choose(choice)}
                  style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && !selected && AppPressed]}
                >
                  <View style={[styles.bubble, selected && styles.bubbleSelected]}>
                    <ThemedText style={[styles.bubbleText, selected && styles.bubbleTextSelected]}>{choice.toUpperCase()}</ThemedText>
                  </View>
                  <ThemedText style={styles.optionText}>{question[choice]}</ThemedText>
                </Pressable>
              );
            })}
          </Animated.View>
        )}

        {sending && (
          <View style={styles.sending}>
            <ActivityIndicator color={AppColors.accent} />
            <ThemedText style={styles.sendingText}>{t('tools.electividad.test.enviandoTusRespuestas')}</ThemedText>
          </View>
        )}

        {(!!error || (complete && !sending)) && (
          <View style={styles.errorBox}>
            {!!error && <ThemedText style={styles.error}>{error}</ThemedText>}
            {complete && !sending && progress && (
              <>
                {!error && <ThemedText style={styles.sendingText}>{t('tools.electividad.test.respondisteLas72Preguntas')}</ThemedText>}
                <HanetButton label={error ? t('tools.electividad.test.enviarNuevamente') : t('tools.electividad.test.enviarMisRespuestas')} variant="accent" onPress={() => void send(progress.answers, progress.activeMs)} />
              </>
            )}
          </View>
        )}
      </View>

      {question && !sending && !complete && (
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('tools.electividad.test.preguntaAnterior')}
            accessibilityState={{ disabled: index === 0 }}
            disabled={index === 0}
            onPress={goBack}
            style={({ pressed }) => [styles.backPill, index === 0 && styles.disabled, pressed && AppPressed]}
          >
            <Ionicons name="chevron-back" size={16} color={AppColors.textPrimary} />
            <ThemedText style={styles.backText}>{t('onboarding.anterior')}</ThemedText>
          </Pressable>
          <ThemedText style={styles.hint}>{t('tools.electividad.test.eligeLaQueMasTe')}</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas, paddingHorizontal: AppSpacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: AppSpacing.md, width: '100%', maxWidth: 430, alignSelf: 'center' },
  round: { width: 40, height: 40, borderRadius: AppRadii.pill, backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...AppType.headline, color: AppColors.textPrimary, flex: 1, textAlign: 'center' },
  pausePill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 14, borderRadius: AppRadii.pill, backgroundColor: AppColors.surface },
  pauseText: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  body: { flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center', paddingTop: AppSpacing.xl, gap: AppSpacing.xl },
  progressBlock: { gap: AppSpacing.sm },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  counter: { ...AppType.callout, color: AppColors.textSecondary },
  percent: { ...AppType.caption, fontFamily: 'DMSans_700Bold', color: AppColors.accent },
  track: { height: 6, borderRadius: AppRadii.pill, backgroundColor: AppColors.surface, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: AppRadii.pill, backgroundColor: AppColors.accent },
  loading: { marginTop: AppSpacing.xxl },
  questionBlock: { gap: AppSpacing.md },
  prompt: { ...AppType.title2, color: AppColors.textPrimary, marginBottom: AppSpacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    minHeight: 96,
    padding: 18,
    borderRadius: AppRadii.lg,
    backgroundColor: AppColors.surface,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  optionSelected: { borderColor: AppColors.accent, backgroundColor: 'rgba(239,34,116,0.12)' },
  bubble: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: AppColors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  bubbleSelected: { backgroundColor: AppColors.accent, borderColor: AppColors.accent },
  bubbleText: { ...AppType.headline, color: AppColors.surfaceSoft },
  bubbleTextSelected: { color: AppColors.textPrimary },
  optionText: { ...AppType.body, fontFamily: 'DMSans_500Medium', color: AppColors.textPrimary, flex: 1 },
  sending: { alignItems: 'center', gap: AppSpacing.md, marginTop: AppSpacing.xxl },
  sendingText: { ...AppType.callout, color: AppColors.textSecondary },
  errorBox: { gap: AppSpacing.md },
  error: { ...AppType.callout, color: AppColors.errorText },
  footer: { width: '100%', maxWidth: 430, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  backPill: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 40, paddingLeft: 10, paddingRight: 16, borderRadius: AppRadii.pill, backgroundColor: AppColors.surface },
  backText: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  disabled: { opacity: 0.4 },
  hint: { ...AppType.caption, color: AppColors.textSecondary, flex: 1 },
});
