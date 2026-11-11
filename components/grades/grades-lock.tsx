import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { unlockGrades, useGradesLock } from '@/services/grades-lock';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '@/i18n';

// What shows in place of the grades while Notas is locked on this phone.
// `auto` asks right away (the Notas screens); without it, only the button
// asks, so opening a Hall never pops Face ID by itself.

export function GradesLocked({ auto = false }: { auto?: boolean }) {
  const { ready, enabled } = useGradesLock();
  const prompt = t('components.grades.gradesLock.desbloqueaParaVerTusNotas');

  useEffect(() => {
    if (auto && ready && enabled) void unlockGrades(prompt);
  }, [auto, ready, enabled, prompt]);

  if (!ready) return null;
  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Ionicons name="lock-closed" size={22} color={AppColors.textPrimary} />
      </View>
      <View style={styles.text}>
        <ThemedText style={styles.title}>{t('components.grades.gradesLock.tusNotasEstanProtegidas')}</ThemedText>
        <ThemedText style={styles.body}>{t('components.grades.gradesLock.desbloqueaConFaceIdTu')}</ThemedText>
      </View>
      <HanetButton label={t('components.admin.institutionMembers.desbloquear')} onPress={() => void unlockGrades(prompt)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: AppSpacing.md, padding: AppSpacing.lg, borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.surface },
  icon: { width: 44, height: 44, borderRadius: AppRadii.pill, backgroundColor: AppColors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  text: { gap: AppSpacing.xs },
  title: { ...AppType.headline, fontSize: 17, color: AppColors.textPrimary },
  body: { ...AppType.footnote, color: AppColors.textSecondary },
});
