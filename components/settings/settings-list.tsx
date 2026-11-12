import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * A titled group of rows on one card, like the phone's own settings. The
 * footer is for a short note that applies to the whole group.
 */
export function SettingsGroup({ title, footer, children }: { title?: string; footer?: React.ReactNode; children: React.ReactNode }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {!!title && <ThemedText accessibilityRole="header" style={styles.groupTitle}>{title}</ThemedText>}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <React.Fragment key={index}>
            {index > 0 && <View style={styles.divider} />}
            {row}
          </React.Fragment>
        ))}
      </View>
      {typeof footer === 'string' ? <ThemedText style={styles.footer}>{footer}</ThemedText> : footer}
    </View>
  );
}

/** A short note under a group, outside its card. */
export function SettingsNote({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <ThemedText accessibilityLiveRegion={error ? 'assertive' : undefined} style={[styles.footer, error && styles.error]}>
      {children}
    </ThemedText>
  );
}

function Badge({ icon }: { icon: IconName }) {
  return (
    <View style={styles.badge}>
      <Ionicons name={icon} size={17} color={AppColors.textPrimary} />
    </View>
  );
}

/** A row that opens something: a screen, the mail app. */
export function SettingsLinkRow({ icon, label, detail, onPress, hint }: { icon: IconName; label: string; detail?: string; onPress: () => void; hint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Badge icon={icon} />
      <ThemedText numberOfLines={1} style={[styles.label, styles.copy]}>{label}</ThemedText>
      {!!detail && <ThemedText numberOfLines={1} style={styles.detail}>{detail}</ThemedText>}
      <Ionicons name="chevron-forward" size={17} color={AppColors.textSecondary} />
    </Pressable>
  );
}

/**
 * An on/off setting. The whole row toggles it, not only the switch, so it
 * is an easy target; the pink track is the screen's one strong color.
 */
export function SettingsToggleRow({ icon, label, detail, value, onChange, disabled = false }: {
  icon: IconName;
  label: string;
  detail?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Badge icon={icon} />
      <View style={styles.copy}>
        <ThemedText style={styles.label}>{label}</ThemedText>
        {!!detail && <ThemedText style={styles.rowDetail}>{detail}</ThemedText>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: AppColors.surfaceMuted, true: AppColors.accent }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={AppColors.surfaceMuted}
        // The row already speaks for the switch.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: AppSpacing.sm },
  groupTitle: { ...AppType.footnote, fontFamily: 'DMSans_700Bold', color: AppColors.textSecondary, paddingHorizontal: AppSpacing.sm },
  card: { borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.surface, overflow: 'hidden' },
  // Starts after the badge, as in the phone's settings.
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 58, backgroundColor: 'rgba(249,249,250,0.12)' },
  footer: { ...AppType.caption, color: AppColors.textSecondary, opacity: 0.8, paddingHorizontal: AppSpacing.sm },
  error: { ...AppType.footnote, fontFamily: 'DMSans_700Bold', color: AppColors.errorText, opacity: 1 },

  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, paddingHorizontal: 14, paddingVertical: 10 },
  badge: { width: 30, height: 30, borderRadius: 9, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.surfaceMuted },
  copy: { flex: 1, minWidth: 0 },
  label: { ...AppType.callout, fontSize: 15, color: AppColors.textPrimary },
  rowDetail: { ...AppType.caption, color: AppColors.textSecondary, opacity: 0.8 },
  detail: { ...AppType.footnote, color: AppColors.textSecondary, opacity: 0.8, maxWidth: '45%' },
  pressed: { backgroundColor: 'rgba(249,249,250,0.06)' },
  disabled: { opacity: 0.55 },
});
