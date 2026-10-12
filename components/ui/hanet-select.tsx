import { ThemedText } from '@/components/themed-text';
import { AlertModal } from '@/components/ui/alert-modal';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

export type SelectOption = { value: string; label: string };

type Props = {
  /** Field name, also the dialog's title. */
  label: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Field color; the canvas by default, for fields on a sheet. */
  style?: StyleProp<ViewStyle>;
};

// Long lists get a search box.
const SEARCH_FROM = 10;

function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * A field that opens its options in HaNet's alert dialog: for choices with
 * more than a handful of options, where a row of chips would get long.
 * Choosing an option closes the dialog.
 */
export function HanetSelect({ label, options, value, onChange, placeholder = 'Elegir', disabled, style }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(option => option.value === value);

  const show = () => {
    setQuery('');
    setOpen(true);
  };

  const choose = (option: SelectOption) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    onChange(option.value);
    setOpen(false);
  };

  const filtered = query.trim()
    ? options.filter(option => normalize(option.label).includes(normalize(query.trim())))
    : options;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected ? selected.label : 'sin elegir'}`}
        accessibilityHint="Abre la lista de opciones"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={show}
        style={({ pressed }) => [styles.field, style, pressed && styles.pressed, disabled && styles.disabled]}
      >
        <ThemedText numberOfLines={1} style={[styles.value, !selected && styles.placeholder]}>
          {selected ? selected.label : placeholder}
        </ThemedText>
        <View style={styles.chevron}>
          <CustomIcon name="chevron-right" size={18} color={AppColors.textSecondary} />
        </View>
      </Pressable>

      <AlertModal visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable accessibilityLabel="Cerrar sin elegir" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View accessibilityViewIsModal style={styles.dialog}>
            <ThemedText accessibilityRole="header" style={styles.title}>{label}</ThemedText>
            {options.length >= SEARCH_FROM && (
              <TextInput
                accessibilityLabel={`Buscar en ${label.toLocaleLowerCase('es')}`}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar"
                placeholderTextColor={AppColors.surfaceMuted}
                autoCorrect={false}
                selectionColor={AppColors.accent}
                style={styles.search}
              />
            )}
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
              {filtered.map(option => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => choose(option)}
                    style={({ pressed }) => [styles.option, isSelected && styles.optionSelected, pressed && styles.pressed]}
                  >
                    <ThemedText style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option.label}</ThemedText>
                    {isSelected && <CustomIcon name="check-circle" size={20} color={AppColors.controlOnActive} />}
                  </Pressable>
                );
              })}
              {filtered.length === 0 && <ThemedText style={styles.empty}>Nada coincide con “{query.trim()}”.</ThemedText>}
            </ScrollView>
            <HanetButton label="Cancelar" variant="surface" onPress={() => setOpen(false)} />
          </View>
        </View>
      </AlertModal>
    </>
  );
}

// Up to this many options fit as chips; more go in a select.
export const MAX_CHIP_OPTIONS = 5;

/**
 * Chips while the options are few (five or fewer), a select field beyond
 * that, so long lists do not spill over the form.
 */
export function HanetChoice(props: Props) {
  const { options, value, onChange, disabled, label } = props;
  if (options.length > MAX_CHIP_OPTIONS) return <HanetSelect {...props} />;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
      {options.map(option => (
        <HanetChip
          key={option.value}
          label={option.label}
          selected={option.value === value}
          accessibilityRole="radio"
          disabled={disabled}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  field: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  value: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  placeholder: {
    color: AppColors.textSecondary,
    opacity: 0.55,
  },
  chevron: {
    transform: [{ rotate: '90deg' }],
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '80%',
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
  search: {
    minHeight: AppTouch.minimum,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.canvas,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    color: AppColors.textPrimary,
    outlineStyle: 'none' as never,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: AppSpacing.xs,
  },
  option: {
    minHeight: AppTouch.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.pill,
  },
  optionSelected: {
    backgroundColor: AppColors.controlActive,
  },
  optionText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  optionTextSelected: {
    color: AppColors.controlOnActive,
  },
  empty: {
    paddingVertical: AppSpacing.md,
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: AppColors.textSecondary,
  },
});
