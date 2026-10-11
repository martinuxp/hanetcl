import { ThemedText } from '@/components/themed-text';
import { AlertModal } from '@/components/ui/alert-modal';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  /** Tapping outside the card closes it too (leave off while an action is running). */
  dismissOnBackdrop?: boolean;
  title?: string;
  body?: string;
  children?: React.ReactNode;
};

/**
 * HaNet's alert dialog: a rounded card over the dimmed screen, title, text
 * and pill buttons. Opens in 120 ms and leaves the way it came (AlertModal).
 */
export function HanetDialog({ visible, onRequestClose, dismissOnBackdrop = false, title, body, children }: Props) {
  return (
    <AlertModal visible={visible} onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        {dismissOnBackdrop && <Pressable accessibilityLabel="Cerrar" style={StyleSheet.absoluteFill} onPress={onRequestClose} />}
        <View accessibilityViewIsModal style={styles.dialog}>
          {!!title && <ThemedText accessibilityRole="header" style={styles.title}>{title}</ThemedText>}
          {!!body && <ThemedText style={styles.body}>{body}</ThemedText>}
          {children}
        </View>
      </View>
    </AlertModal>
  );
}

/** Buttons side by side, each taking half. */
export function HanetDialogActions({ children }: { children: React.ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

export const dialogStyles = StyleSheet.create({
  action: {
    flex: 1,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    padding: AppSpacing.xl,
    gap: AppSpacing.md,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
});
