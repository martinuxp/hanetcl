import { ThemedText } from '@/components/themed-text';
import { AreaIcon } from '@/components/tools/area-icon';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { getElectividad, loadProgress, peekElectividad, rememberResult } from '@/services/electividad-service';
import type { ElectividadState, Progress } from '@/services/electividad-service';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// HaNet Electividad's entry: what the test is before starting it, where to
// pick it up when paused, or one's result once answered.

const FACTS: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'list-outline', text: '72 preguntas: en cada una eliges entre dos actividades.' },
  { icon: 'time-outline', text: 'Toma cerca de 10 minutos. Puedes pausar y seguir después.' },
  { icon: 'shield-checkmark-outline', text: 'No hay respuestas correctas ni incorrectas: mide tus preferencias, no tu rendimiento.' },
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
        setError(describeAuthError(err, 'No pudimos cargar el test. Inténtalo nuevamente.'));
      });
    return () => { alive = false; };
  }, []));

  const result = state?.result ?? null;
  const answered = progress ? Object.keys(progress.answers).length : 0;

  return (
    <FrostedScreen style={styles.screen}>
      <ScrollView contentContainerStyle={withTopInset(styles.page, insets.top)} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={styles.eyebrow}>Herramientas</ThemedText>
          <ThemedText accessibilityRole="header" style={styles.title}>HaNet Electividad</ThemedText>
          <ThemedText style={styles.intro}>Un test de intereses para ayudarte a elegir tus electivos de 3° medio.</ThemedText>
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
            <ThemedText style={styles.cardEyebrow}>Tus áreas de mayor interés</ThemedText>
            <ThemedText style={styles.cardTitle}>{result.areas.slice(0, 3).map(area => area.name).join(', ')}</ThemedText>
            <HanetButton
              label="Ver mi resultado"
              variant="accent"
              onPress={() => {
                rememberResult(result);
                router.push('/tools/electividad/result');
              }}
            />
            <HanetButton
              label="Ver la animación"
              variant="surface"
              onPress={() => {
                rememberResult(result);
                router.push('/tools/electividad/reveal');
              }}
            />
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
                Tu resultado lo verán tú y la administración de tu liceo, para orientarte en la elección. Se responde una sola vez.
              </ThemedText>
            </View>
            <HanetButton
              label={answered > 0 ? `Continuar (pregunta ${Math.min(answered + 1, 72)} de 72)` : 'Comenzar el test'}
              variant="accent"
              onPress={() => router.push('/tools/electividad/test')}
            />
          </>
        )}

        <ThemedText style={styles.footnote}>Postulación a electivos: Próximamente.</ThemedText>
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
  footnote: { ...AppType.caption, color: AppColors.surfaceSoft, textAlign: 'center' },
});
