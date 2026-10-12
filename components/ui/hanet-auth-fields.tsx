import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { ThemedText } from '@/components/themed-text';
import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

type FieldProps = TextInputProps & {
  label: string;
  /** Icon shown before the text (for example, the @ of the username). */
  leading?: React.ReactNode;
  /** Icon or control shown after the text. */
  trailing?: React.ReactNode;
  invalid?: boolean;
};

/** Filled input with its label inside, as in the HaNet ID forms. */
export const HanetField = forwardRef<TextInput, FieldProps>(function HanetField(
  { label, leading, trailing, invalid, style, onFocus, onBlur, ...inputProps },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, focused && styles.fieldFocused, invalid && styles.fieldInvalid]}>
      {leading}
      <View style={styles.fieldText}>
        <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor="rgba(221,221,226,0.4)"
          selectionColor={AppColors.accent}
          style={[styles.fieldInput, style]}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          {...inputProps}
        />
      </View>
      {trailing}
    </View>
  );
});

type SegmentOption<T extends string> = {
  value: T;
  /** Text shown in the segment; omit it when `icon` is enough. */
  label?: string;
  /** Always read by screen readers. */
  accessibilityLabel: string;
  icon?: (active: boolean) => React.ReactNode;
};

type SegmentedProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** Taller segments, used by the treatment picker. */
  tall?: boolean;
};

export function HanetSegmented<T extends string>({ options, value, onChange, accessibilityLabel, tall }: SegmentedProps<T>) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.segmented}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.segment, tall && styles.segmentTall, active && styles.segmentActive, pressed && !active && styles.segmentPressed]}
          >
            {option.icon?.(active)}
            {!!option.label && (
              <ThemedText numberOfLines={1} style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</ThemedText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: AppColors.canvas,
    backgroundColor: AppColors.canvas,
  },
  fieldFocused: {
    borderColor: AppColors.controlActive,
  },
  fieldInvalid: {
    borderColor: AppColors.accent,
  },
  fieldText: {
    flex: 1,
    justifyContent: 'center',
  },
  fieldLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: -0.24,
    color: AppColors.textSecondary,
    opacity: 0.75,
  },
  fieldInput: {
    padding: 0,
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
    outlineStyle: 'none' as never,
  },
  segmented: {
    flexDirection: 'row',
    gap: AppSpacing.xs,
    padding: AppSpacing.sm,
    borderRadius: AppRadii.xl,
    backgroundColor: AppColors.canvas,
  },
  segment: {
    flex: 1,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.md,
    borderRadius: AppRadii.pill,
  },
  segmentTall: {
    height: 50,
  },
  segmentActive: {
    backgroundColor: AppColors.controlActive,
  },
  segmentPressed: {
    opacity: 0.6,
  },
  segmentLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: -0.35,
    color: AppColors.textPrimary,
  },
  segmentLabelActive: {
    color: AppColors.controlOnActive,
  },
});
