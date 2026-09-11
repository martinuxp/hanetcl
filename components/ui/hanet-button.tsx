import { AppColors, AppRadii } from '@/constants/design-tokens';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { ThemedText } from '@/components/themed-text';

type HanetButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'accent' | 'primary' | 'surface';
  icon?: React.ReactNode;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function HanetButton({ label, onPress, variant = 'primary', icon, disabled = false, accessibilityHint, style }: HanetButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon}
        <ThemedText style={[styles.label, variant === 'surface' && styles.surfaceLabel]}>{label}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 50, borderRadius: AppRadii.pill, paddingHorizontal: 24, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  accent: { backgroundColor: AppColors.accent },
  primary: { backgroundColor: AppColors.primary },
  surface: { backgroundColor: AppColors.surfaceMuted },
  label: { color: AppColors.textPrimary, fontSize: 16, lineHeight: 24, fontFamily: 'DMSans_700Bold', textAlign: 'center' },
  surfaceLabel: { color: AppColors.textPrimary },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
});
