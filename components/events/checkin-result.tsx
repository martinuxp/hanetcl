import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import type { CheckIn } from '@/services/events-service';
import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

export type CheckInResult = { kind: 'ok'; checkIn: CheckIn } | { kind: 'error'; message: string };

/** What the door scanner says about the last HN-QR it read. */
export function CheckInResultCard({ result }: { result: CheckInResult }) {
  const reducedMotion = useReducedMotion();
  return (
    <Animated.View
      key={result.kind === 'ok' ? `${result.checkIn.name}-${result.checkIn.count}` : result.message}
      entering={reducedMotion ? undefined : FadeIn.duration(120)}
      style={[styles.card, result.kind === 'error' && styles.cardError, result.kind === 'ok' && result.checkIn.already && styles.cardAlready]}
      accessibilityLiveRegion="assertive"
    >
      {result.kind === 'ok' ? (
        <>
          <ThemedText style={[styles.title, result.checkIn.already && styles.titleAlready]}>{result.checkIn.already ? 'Ya estaba registrado' : '¡Llegó!'}</ThemedText>
          <ThemedText style={styles.name}>{result.checkIn.name}</ThemedText>
          <ThemedText style={styles.text}>
            {[result.checkIn.courseId, result.checkIn.signedUp === false ? 'No estaba inscrito' : result.checkIn.signedUp ? 'Inscrito' : null].filter(Boolean).join(' · ')}
          </ThemedText>
        </>
      ) : (
        <ThemedText style={styles.text}>{result.message}</ThemedText>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 2,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
    borderWidth: 2,
    borderColor: AppColors.accentMint,
  },
  cardAlready: {
    borderColor: AppColors.controlActive,
  },
  cardError: {
    borderColor: AppColors.accent,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.accentMint,
  },
  titleAlready: {
    color: AppColors.controlActive,
  },
  name: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 22,
    lineHeight: 28,
    color: AppColors.textPrimary,
  },
  text: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 21,
    color: AppColors.textSecondary,
  },
});
