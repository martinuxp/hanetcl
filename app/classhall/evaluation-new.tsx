import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { ThemedText } from '@/components/themed-text';
import { HanetDialog } from '@/components/ui/hanet-dialog';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { DocumentError, pickHallDocument, scanSpecTable, setPendingScan } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The first step of a new evaluation, as a half-height sheet: scan the
 * specification table or fill it in by hand. Scanning opens the file picker
 * here and reads the file behind a loading dialog; either way the form opens
 * next, filled with what was read and keeping what came along (a Calendar
 * event being completed).
 */
function NewEvaluationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ hallId: string; fromEvent?: string; title?: string; date?: string }>();

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openForm = () => router.replace({ pathname: '/classhall/evaluation-form', params });

  const scan = async () => {
    if (scanning) return;
    setError(null);
    try {
      const picked = await pickHallDocument('scan');
      if (!picked) return;
      // iOS cannot show the dialog while the picker is still leaving.
      if (Platform.OS === 'ios') await new Promise(resolve => setTimeout(resolve, 350));
      setScanning(true);
      const { draft, staged } = await scanSpecTable(params.hallId, picked);
      setPendingScan(params.hallId, draft, staged);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScanning(false);
      openForm();
    } catch (readError) {
      setScanning(false);
      setError(readError instanceof DocumentError ? readError.message : describeAuthError(readError, 'No pudimos leer la tabla. Agrégala a mano.'));
    }
  };

  return (
    // A fixed view: the two choices fit the half sheet without scrolling.
    <View style={[styles.sheet, styles.content, local.content, { paddingTop: AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.lg }]}>
      <ThemedText accessibilityRole="header" style={styles.title}>{params.fromEvent ? 'Completar evaluación' : 'Nueva evaluación'}</ThemedText>
      <ThemedText style={styles.lead}>¿Cómo quieres agregar la tabla de especificaciones?</ThemedText>

      <Pressable accessibilityRole="button" disabled={scanning} onPress={() => void scan()} style={({ pressed }) => [local.option, local.optionAccent, pressed && styles.pressed]}>
        <ThemedText style={[local.optionTitle, local.onAccent]}>Escanear T.E.</ThemedText>
        <ThemedText style={[local.optionText, local.onAccent]}>Elige la tabla en PDF, Word o foto y llenamos todo por ti. Después la revisas.</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={scanning} onPress={openForm} style={({ pressed }) => [local.option, pressed && styles.pressed]}>
        <ThemedText style={local.optionTitle}>Agregar a mano</ThemedText>
        <ThemedText style={local.optionText}>Escribe el nombre, el día y, si quieres, la tabla.</ThemedText>
      </Pressable>
      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      {/* On iOS the sheet is closed by swiping it down, so there is no Cancel button to push the choices out of view. */}
      {Platform.OS !== 'ios' && (
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
          <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
        </Pressable>
      )}

      <HanetDialog visible={scanning} onRequestClose={() => {}}>
        <View style={local.loading}>
          <ActivityIndicator size="large" color={AppColors.textPrimary} />
          <ThemedText accessibilityLiveRegion="polite" style={local.loadingTitle}>Leyendo la tabla…</ThemedText>
          <ThemedText style={local.loadingText}>Buscamos los contenidos, los puntajes y los objetivos. Puede tardar unos segundos.</ThemedText>
        </View>
      </HanetDialog>
    </View>
  );
}

const local = StyleSheet.create({
  content: {
    gap: AppSpacing.lg,
  },
  option: {
    gap: 4,
    padding: AppSpacing.xl,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  optionAccent: {
    backgroundColor: AppColors.accent,
  },
  optionTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  optionText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  loading: {
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.md,
  },
  loadingTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  loadingText: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  onAccent: {
    color: AppColors.textOnLight,
  },
});

export default withSheetFrame(NewEvaluationScreen, AppColors.surface);
