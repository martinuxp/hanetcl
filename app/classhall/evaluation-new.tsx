import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { ThemedText } from '@/components/themed-text';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The first step of a new evaluation, as a half-height sheet: scan the
 * specification table or fill it in by hand. Either way the form opens next,
 * keeping what came along (a Calendar event being completed).
 */
function NewEvaluationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ hallId: string; fromEvent?: string; title?: string; date?: string }>();

  const open = (scan: boolean) => router.replace({
    pathname: '/classhall/evaluation-form',
    params: { ...params, ...(scan ? { scan: '1' } : {}) },
  });

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, local.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{params.fromEvent ? 'Completar evaluación' : 'Nueva evaluación'}</ThemedText>
      <ThemedText style={styles.lead}>¿Cómo quieres agregar la tabla de especificaciones?</ThemedText>

      <Pressable accessibilityRole="button" onPress={() => open(true)} style={({ pressed }) => [local.option, local.optionAccent, pressed && styles.pressed]}>
        <ThemedText style={[local.optionTitle, local.onAccent]}>Escanear T.E.</ThemedText>
        <ThemedText style={[local.optionText, local.onAccent]}>Sube la tabla en PDF o una foto y llenamos todo por ti. Después la revisas.</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => open(false)} style={({ pressed }) => [local.option, pressed && styles.pressed]}>
        <ThemedText style={local.optionTitle}>Agregar a mano</ThemedText>
        <ThemedText style={local.optionText}>Escribe el nombre, el día y, si quieres, la tabla.</ThemedText>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
      </Pressable>
    </ScrollView>
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
  onAccent: {
    color: AppColors.textOnLight,
  },
});

export default withSheetFrame(NewEvaluationScreen, AppColors.surface);
