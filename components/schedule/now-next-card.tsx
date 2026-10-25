import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import type { ScheduleBlock } from '@/services/schedule-service';
import React from 'react';
import { StyleSheet, View } from 'react-native';

/** The class going on now and the one after it, on top of the Horario. */
export function NowNextCard({ current, next }: { current: ScheduleBlock | null; next: ScheduleBlock | null }) {
  if (!current && !next) return null;
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={[current ? `Ahora: ${current.subject} hasta las ${current.end}` : null, next ? `Después: ${next.subject} a las ${next.start}` : null].filter(Boolean).join('. ')}
    >
      {!!current && (
        <View style={styles.row}>
          <ThemedText style={styles.label}>Ahora</ThemedText>
          <ThemedText style={styles.subject}>{current.subject}</ThemedText>
          <ThemedText style={styles.meta}>Hasta las {current.end}{current.room ? ` · ${current.room}` : ''}</ThemedText>
        </View>
      )}
      {!!next && (
        <View style={styles.row}>
          <ThemedText style={[styles.label, styles.nextLabel]}>Después</ThemedText>
          <ThemedText style={styles.nextSubject}>{next.subject}</ThemedText>
          <ThemedText style={styles.meta}>{next.start}{next.room ? ` · ${next.room}` : ''}</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  row: {
    gap: 2,
  },
  label: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: AppColors.accent,
  },
  nextLabel: {
    color: AppColors.textSecondary,
  },
  subject: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  nextSubject: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 18,
    lineHeight: 24,
    color: AppColors.textPrimary,
  },
  meta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
});
