import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { ThemedText } from '@/components/themed-text';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '@/i18n';

const STEPS = [t('settings.cuenta'), t('common.correo'), t('components.onboardingProgress.invitacion'), t('components.onboardingProgress.institucion')] as const;

/** Where the person is on the way from sign-up to their institution. */
export function OnboardingProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('components.onboardingProgress.pasoStepDeStepscountSteps', { step, sTEPSCount: STEPS.length, steps: STEPS[step - 1] })}
      accessibilityValue={{ min: 1, max: STEPS.length, now: step }}
      style={styles.wrap}
    >
      <ThemedText style={styles.label}>
        {t('components.onboardingProgress.pasoStepDeStepscountSteps2', { step, sTEPSCount: STEPS.length, steps: STEPS[step - 1] })}
      </ThemedText>
      <View style={styles.track}>
        {STEPS.map((name, index) => (
          <View key={name} style={[styles.segment, index < step && styles.segmentDone]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.sm,
  },
  label: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  track: {
    flexDirection: 'row',
    gap: AppSpacing.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  segmentDone: {
    backgroundColor: AppColors.controlActive,
  },
});
