import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { ThemedText } from '@/components/themed-text';
import React from 'react';
import { StyleSheet, View } from 'react-native';

const STEPS = ['Cuenta', 'Correo', 'Invitación', 'Institución'] as const;

/** Where the person is on the way from sign-up to their institution. */
export function OnboardingProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Paso ${step} de ${STEPS.length}: ${STEPS[step - 1]}`}
      accessibilityValue={{ min: 1, max: STEPS.length, now: step }}
      style={styles.wrap}
    >
      <ThemedText style={styles.label}>
        Paso {step} de {STEPS.length} · {STEPS[step - 1]}
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
