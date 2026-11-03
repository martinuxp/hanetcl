import { ThemedText } from '@/components/themed-text';
import { AreaIcon } from '@/components/tools/area-icon';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { getElectividad, loadProgress, peekElectividad, rememberResult } from '@/services/electividad-service';
import type { ElectividadAttempt, ElectividadState, Progress } from '@/services/electividad-service';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

// HaNet Electividad's entry: what the test is before starting it, where to
// pick it up when paused, or one's result once answered, with the earlier
// attempts and the way to take it again.

function attemptDate(at: number | null) {
  if (!at) return '';
  try {
    return new Date(at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function AttemptRow({ attempt, onPress }: { attempt: ElectividadAttempt; onPress: () => void }) {
  const top = attempt.areas.slice(0, 3);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${attemptDate(attempt.answeredAt)}: ${top.map(area => area.name).join(', ')}`}
      onPress={onPress}
      style={({ pressed }) => [styles.attempt, pressed && AppPressed]}
    >
      <View style={styles.attemptIcons}>
        {top.map(area => <AreaIcon key={area.id} area={area.id} size={16} color={AppColors.textPrimary} />)}
      </View>
      <View style={styles.attemptBody}>
        <ThemedText style={styles.attemptTitle} numberOfLines={1}>{top.map(area => area.name).join(', ')}</ThemedText>
        <ThemedText style={styles.attemptDate}>{attemptDate(attempt.answeredAt)}</ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={AppColors.textSecondary} />
    </Pressable>
  );
}

const FACTS: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'list-outline', text: t('tools.electividad.n72PreguntasEnCadaUna') },
  { icon: 'time-outline', text: t('tools.electividad.tomaCercaDe10Minutos') },
  { icon: 'shield-checkmark-outline', text: t('tools.electividad.noHayRespuestasCorrectasNi') },
];

export default function ElectividadScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [state, setState] = useState<ElectividadState | null | undefined>(() => peekElectividad());
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let alive = true;
    loadProgress().then(saved => { if (alive) setProgress(saved); });
    getElectividad()
      .then(data => { if (alive) { setState(data); setError(''); } })
      .catch(err => {
        if (!alive) return;
        setState(current => current ?? null);
        setError(describeAuthError(err, t('tools.electividad.noPudimosCargarElTest')));
      });
    return () => { alive = false; };
  }, []));

  const result = state?.result ?? null;
  const answered = progress ? Object.keys(progress.answers).length : 0;

  return (
    <FrostedScreen style={styles.screen}>
      <ScrollView contentContainerStyle={withTopInset(styles.page, insets.top)} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={styles.eyebrow}>{t('common.herramientas')}</ThemedText>
          <ThemedText accessibilityRole="header" style={styles.title}>{t('tools.electividad.hanetElectividad')}</ThemedText>
          <ThemedText style={styles.intro}>{t('tools.electividad.unTestDeInteresesPara')}</ThemedText>
        </View>

        <View style={styles.iconGrid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {(['bio', 'qui', 'mat', 'fis', 'soc', 'len', 'mus', 'vis', 'mov'] as const).map(area => (
            <View key={area} style={styles.iconTile}>
              <AreaIcon area={area} size={24} color={AppColors.textPrimary} />
            </View>
          ))}
        </View>

        {state === undefined && <ActivityIndicator color={AppColors.textSecondary} />}
        {!!error && state === null && <ThemedText style={styles.error}>{error}</ThemedText>}

        {result && (
          <View style={styles.card}>
            <ThemedText style={styles.cardEyebrow}>{t('common.tusAreasDeMayorInteres')}</ThemedText>
            <ThemedText style={styles.cardTitle}>{result.areas.slice(0, 3).map(area => area.name).join(', ')}</ThemedText>
            <HanetButton
              label={t('tools.electividad.verMiResultado')}
              variant="accent"
              onPress={() => {
                rememberResult(result);
                router.push('/tools/electividad/result');
              }}
            />
            <HanetButton
              label={t('tools.electividad.verLaAnimacion')}
              variant="surface"
              onPress={() => {
                rememberResult(result);
                router.push('/tools/electividad/reveal');
              }}
            />
            <HanetButton
              label={answered > 0 ? t('tools.electividad.continuarElNuevoIntentoPregunta', { number: Math.min(answered + 1, 72) }) : t('tools.electividad.repetirElTest')}
              variant="surface"
              icon={<Ionicons name="refresh" size={18} color={AppColors.textPrimary} />}
              onPress={() => router.push('/tools/electividad/test')}
            />
            <ThemedText style={styles.repeatNote}>{t('tools.electividad.alRepetirloEsteResultadoQueda')}</ThemedText>
          </View>
        )}

        {!!state?.history?.length && (
          <View style={styles.history}>
            <ThemedText accessibilityRole="header" style={styles.historyTitle}>{t('tools.electividad.intentosAnteriores')}</ThemedText>
            {state.history.map(attempt => (
              <AttemptRow
                key={attempt.id}
                attempt={attempt}
                onPress={() => {
                  rememberResult(attempt);
                  router.push({ pathname: '/tools/electividad/result', params: { attempt: attempt.id } });
                }}
              />
            ))}
          </View>
        )}

        {state && !result && (
          <>
            <View style={styles.card}>
              {FACTS.map(fact => (
                <View key={fact.icon} style={styles.fact}>
                  <Ionicons name={fact.icon} size={20} color={AppColors.textPrimary} />
                  <ThemedText style={styles.factText}>{fact.text}</ThemedText>
                </View>
              ))}
            </View>
            <View style={styles.notice}>
              <Ionicons name="eye-outline" size={18} color={AppColors.textSecondary} />
              <ThemedText style={styles.noticeText}>
                {t('tools.electividad.tuResultadoLoVeranTu')}
              </ThemedText>
            </View>
            <HanetButton
              label={answered > 0 ? t('tools.electividad.continuarPreguntaNumberDe72', { number: Math.min(answered + 1, 72) }) : t('tools.electividad.comenzarElTest')}
              variant="accent"
              onPress={() => router.push('/tools/electividad/test')}
            />
          </>
        )}

        <ThemedText style={styles.footnote}>{t('tools.electividad.postulacionAElectivosProximamente')}</ThemedText>
      </ScrollView>
    </FrostedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas },
  page: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingBottom: 150, gap: AppSpacing.lg },
  header: { paddingTop: AppSpacing.lg, gap: AppSpacing.xs },
  eyebrow: { ...AppType.caption, color: AppColors.textSecondary },
  title: { ...AppType.title1, color: AppColors.textPrimary },
  intro: { ...AppType.callout, color: AppColors.textSecondary, marginTop: AppSpacing.xs },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconTile: { width: 44, height: 44, borderRadius: 14, backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center' },
  error: { ...AppType.callout, color: AppColors.errorText },
  card: { padding: 18, borderRadius: AppRadii.lg, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: AppSpacing.md },
  cardEyebrow: { ...AppType.callout, color: AppColors.textSecondary },
  cardTitle: { ...AppType.title2, color: AppColors.textPrimary, marginBottom: AppSpacing.xs },
  fact: { flexDirection: 'row', gap: AppSpacing.md, alignItems: 'flex-start' },
  factText: { ...AppType.callout, color: AppColors.textPrimary, flex: 1 },
  notice: { flexDirection: 'row', gap: AppSpacing.sm, alignItems: 'flex-start', paddingHorizontal: AppSpacing.xs },
  noticeText: { ...AppType.footnote, color: AppColors.textSecondary, flex: 1 },
  repeatNote: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary, textAlign: 'center' },
  history: { gap: AppSpacing.sm },
  historyTitle: { ...AppType.headline, color: AppColors.textPrimary, marginBottom: AppSpacing.xs },
  attempt: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, padding: 14, borderRadius: AppRadii.lg, backgroundColor: AppColors.surface },
  attemptIcons: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, height: 36, borderRadius: AppRadii.pill, backgroundColor: AppColors.canvas, alignItems: 'center' },
  attemptBody: { flex: 1, gap: 2 },
  attemptTitle: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  attemptDate: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary },
  footnote: { ...AppType.caption, color: AppColors.surfaceSoft, textAlign: 'center' },
});
