import { hallLongDate } from '@/components/classhall/hall-ui';
import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { allianceColor, placeLabel } from '@/components/anniversary/anniversary-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetDateTimePickerModal } from '@/components/ui/hanet-date-time-picker';
import { AppColors, AppRadii, AppSpacing, AppTouch, AppType } from '@/constants/design-tokens';
import type { Alliance } from '@/services/anniversary-service';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Pieces shared by the anniversary's sheets, on top of the Hall's form look.

export { styles as formStyles };

/** Who hears about a deadline or a flash test. */
export const AUDIENCE_OPTIONS = [
  { value: 'leads', label: 'Jefes de alianza' },
  { value: 'all', label: 'Toda la alianza' },
];

/** The sheet's scrolling body, with its title and lead. */
export function SheetBody({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{title}</ThemedText>
      {!!lead && <ThemedText style={styles.lead}>{lead}</ThemedText>}
      {children}
    </ScrollView>
  );
}

/** The main button and "Cancelar", as every HaNet sheet ends. */
export function SheetActions({ label, busyLabel, ready, busy, onSubmit, error }: { label: string; busyLabel: string; ready: boolean; busy: boolean; onSubmit: () => void; error?: string | null }) {
  const router = useRouter();
  return (
    <>
      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || busy, busy }}
        disabled={!ready || busy}
        onPress={onSubmit}
        style={({ pressed }) => [styles.submit, (!ready || busy) && styles.submitDisabled, pressed && styles.pressed]}
      >
        <ThemedText style={styles.submitText}>{busy ? busyLabel : label}</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
      </Pressable>
    </>
  );
}

/** A labeled text field. */
export function TextField({ label, optional, value, onChange, placeholder, multiline, maxLength = 80, disabled, keyboardType, autoFocus }: {
  label: string;
  optional?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  disabled?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'url';
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.label}>{label}{optional && <ThemedText style={styles.optional}> (opcional)</ThemedText>}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={AppColors.surfaceMuted}
        multiline={multiline}
        maxLength={maxLength}
        editable={!disabled}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'url' ? 'none' : 'sentences'}
        autoCorrect={keyboardType !== 'url'}
        autoFocus={autoFocus}
        selectionColor={AppColors.accent}
        style={[styles.input, multiline && local.multiline]}
      />
    </View>
  );
}

/** A date and time that opens HaNet's picker; optional ones can be cleared. */
export function DateField({ label, value, onChange, optional, disabled }: { label: string; value: number | null; onChange: (value: number | null) => void; optional?: boolean; disabled?: boolean }) {
  const [picking, setPicking] = useState(false);
  return (
    <View style={styles.field}>
      <ThemedText style={styles.label}>{label}{optional && <ThemedText style={styles.optional}> (opcional)</ThemedText>}</ThemedText>
      <View style={local.dateRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? hallLongDate(value) : 'sin fecha'}. Cambiar`}
          disabled={disabled}
          onPress={() => setPicking(true)}
          style={({ pressed }) => [styles.input, local.dateButton, pressed && styles.pressed]}
        >
          <ThemedText numberOfLines={1} style={local.dateText}>{value ? hallLongDate(value) : 'Sin fecha'}</ThemedText>
          <ThemedText style={local.dateAction}>{value ? 'Cambiar' : 'Elegir'}</ThemedText>
        </Pressable>
        {optional && value !== null && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${label.toLocaleLowerCase('es')}`} disabled={disabled} onPress={() => onChange(null)} style={({ pressed }) => [local.clear, pressed && styles.pressed]}>
            <ThemedText style={local.dateAction}>Quitar</ThemedText>
          </Pressable>
        )}
      </View>
      <HanetDateTimePickerModal
        visible={picking}
        value={new Date(value ?? defaultTime())}
        onCancel={() => setPicking(false)}
        onConfirm={date => { setPicking(false); onChange(date.getTime()); }}
      />
    </View>
  );
}

/** Tomorrow at 18:00, where a new date starts. */
export function defaultTime() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(18, 0, 0, 0);
  return date.getTime();
}

export function digitsOnly(value: string) {
  return value.replace(/[^0-9]/g, '').slice(0, 7);
}

/** One points field per place, 1° first. */
export function PointsFields({ label, points, count, onChange, disabled }: { label: string; points: string[]; count: number; onChange: (points: string[]) => void; disabled?: boolean }) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={local.pointsGrid}>
        {Array.from({ length: count }, (_, index) => (
          <View key={index} style={local.pointCell}>
            <ThemedText style={local.place}>{placeLabel(index)}</ThemedText>
            <TextInput
              accessibilityLabel={`Puntos del ${placeLabel(index)} lugar`}
              value={points[index] ?? ''}
              onChangeText={text => {
                const next = Array.from({ length: count }, (_, i) => points[i] ?? '');
                next[index] = digitsOnly(text);
                onChange(next);
              }}
              placeholder="0"
              placeholderTextColor={AppColors.surfaceMuted}
              keyboardType="number-pad"
              editable={!disabled}
              selectionColor={AppColors.accent}
              style={[styles.input, local.pointInput]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Pick one alianza, as colored pills. */
export function AlliancePicker({ alliances, value, onChange, disabled }: { alliances: Alliance[]; value: string | null; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <View accessibilityRole="radiogroup" style={local.allianceRow}>
      {alliances.map(alliance => {
        const color = allianceColor(alliance);
        const selected = alliance.id === value;
        return (
          <Pressable
            key={alliance.id}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={alliance.name}
            disabled={disabled}
            onPress={() => onChange(alliance.id)}
            style={({ pressed }) => [
              local.alliance,
              selected ? { backgroundColor: color.fill, borderColor: color.fill } : local.allianceIdle,
              pressed && styles.pressed,
            ]}
          >
            <View style={[local.swatch, { backgroundColor: color.fill }]} />
            <ThemedText numberOfLines={1} style={[local.allianceText, selected && { color: color.ink }]}>{alliance.name}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const local = StyleSheet.create({
  multiline: {
    minHeight: 120,
    paddingTop: AppSpacing.lg,
    paddingBottom: AppSpacing.lg,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  dateText: {
    flex: 1,
    ...AppType.callout,
    color: AppColors.textPrimary,
  },
  dateAction: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
  },
  clear: {
    minHeight: AppTouch.minimum,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.md,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  pointsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  pointCell: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  place: {
    width: 28,
    ...AppType.headline,
    color: AppColors.textSecondary,
  },
  pointInput: {
    flex: 1,
    minHeight: 48,
    fontVariant: ['tabular-nums'],
  },
  allianceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  alliance: {
    minHeight: AppTouch.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    borderWidth: 1,
  },
  allianceIdle: {
    backgroundColor: AppColors.canvas,
    borderColor: AppColors.canvas,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  allianceText: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
});
