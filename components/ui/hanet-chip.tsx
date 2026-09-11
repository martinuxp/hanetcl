import { AppColors, AppRadii } from '@/constants/design-tokens';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { ThemedText } from '@/components/themed-text';

type HanetChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  compact?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function HanetChip({ label, selected = false, onPress, icon, compact = false, disabled = false, accessibilityHint, style }: HanetChipProps) {
  const content = <><>{icon}</><ThemedText style={[styles.label, selected && styles.selectedLabel]}>{label}</ThemedText></>;
  const isDisabled = disabled || !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        selected && styles.selected,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 40, borderRadius: AppRadii.pill, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: AppColors.controlContainer },
  compact: { minHeight: 28, paddingHorizontal: 16, paddingVertical: 5 },
  selected: { backgroundColor: AppColors.accent },
  label: { color: AppColors.textPrimary, fontSize: 14, lineHeight: 20, fontFamily: 'DMSans_500Medium' },
  selectedLabel: { fontFamily: 'DMSans_700Bold' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.72 },
});
