import { daysUntil, hallDay, hallLongDate } from '@/components/classhall/hall-ui';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { DOCUMENT_LABELS, taskStatus } from '@/services/classhall-service';
import type { HallTaskSummary, SubmissionItem } from '@/services/classhall-service';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

type Tone = ReturnType<typeof taskStatus>['tone'] | 'count';

/** Small rounded label with how a task or a submission stands. */
export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <View style={[styles.status, styles[`status_${tone}`]]}>
      <ThemedText numberOfLines={1} style={[styles.statusText, tone === 'pending' && styles.statusTextOnAccent]}>{label}</ThemedText>
    </View>
  );
}

/** "Vence hoy, 23:59", "Vence en 3 días", "Venció el 27 Abril". */
export function dueLabel(dueAt: number, now: number) {
  const time = hallLongDate(dueAt).split(', ')[1];
  if (dueAt < now) return `Venció el ${hallDay(dueAt)}`;
  const days = daysUntil(dueAt);
  if (days === 0) return `Vence hoy, ${time}`;
  if (days === 1) return `Vence mañana, ${time}`;
  return `Vence en ${days} días`;
}

/** A task in a list: its due day, name and how it stands. */
export function TaskRow({ task, now, isTeacher, expected, onPress }: { task: HallTaskSummary; now: number; isTeacher: boolean; expected?: number | null; onPress: () => void }) {
  const closed = task.dueAt < now;
  const status = isTeacher
    ? { label: expected ? `${task.submittedCount ?? 0}/${expected}` : `${task.submittedCount ?? 0} entregas`, tone: 'count' as const }
    : taskStatus(task, task.mySubmission, now);
  const highlight = !isTeacher && status.tone === 'pending';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${dueLabel(task.dueAt, now)}, ${isTeacher ? `${task.submittedCount ?? 0} entregas` : status.label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, closed && status.tone !== 'late' && styles.rowDim, pressed && AppPressed]}
    >
      <View style={[styles.badge, highlight && styles.badgeAccent]}>
        <ThemedText style={[styles.badgeDay, highlight && styles.onAccent]}>{new Date(task.dueAt).getDate()}</ThemedText>
        <ThemedText style={[styles.badgeMonth, highlight && styles.onAccent]}>{hallDay(task.dueAt).split(' ')[1].slice(0, 3)}</ThemedText>
      </View>
      <View style={styles.text}>
        <ThemedText numberOfLines={2} style={styles.title}>{task.title}</ThemedText>
        <ThemedText numberOfLines={1} style={styles.meta}>{dueLabel(task.dueAt, now)}</ThemedText>
      </View>
      <StatusPill label={status.label} tone={status.tone} />
    </Pressable>
  );
}

/** One file or link of a submission; tapping opens it. */
export function SubmissionItemRow({ item, onOpen, onRemove, disabled }: { item: Pick<SubmissionItem, 'kind' | 'name'> & { fileKind?: string; size?: number }; onOpen?: () => void; onRemove?: () => void; disabled?: boolean }) {
  const kind = item.kind === 'link' ? 'Vínculo' : DOCUMENT_LABELS[(item.fileKind ?? 'file') as keyof typeof DOCUMENT_LABELS] ?? 'Archivo';
  const icon = item.kind === 'link' ? 'link' : item.fileKind === 'image' ? 'image' : 'file-text';
  return (
    <View style={styles.item}>
      <Pressable
        accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityLabel={`${kind}, ${item.name}${onOpen ? '. Abrir' : ''}`}
        disabled={!onOpen}
        onPress={onOpen}
        style={({ pressed }) => [styles.itemMain, pressed && AppPressed]}
      >
        <View style={styles.itemIcon}>
          <CustomIcon name={icon} size={18} color={AppColors.textPrimary} />
        </View>
        <View style={styles.text}>
          <ThemedText numberOfLines={1} style={styles.itemName}>{item.name}</ThemedText>
          <ThemedText numberOfLines={1} style={styles.meta}>{kind}{item.size ? ` · ${formatSize(item.size)}` : ''}</ThemedText>
        </View>
      </Pressable>
      {!!onRemove && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${item.name}`} hitSlop={8} disabled={disabled} onPress={onRemove} style={({ pressed }) => [styles.remove, pressed && AppPressed]}>
          <ThemedText style={styles.removeText}>Quitar</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    padding: AppSpacing.md,
    paddingRight: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  rowDim: {
    opacity: 0.6,
  },
  badge: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.primary,
  },
  badgeAccent: {
    backgroundColor: AppColors.accent,
  },
  badgeDay: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 20,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  badgeMonth: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 14,
    color: AppColors.textPrimary,
  },
  onAccent: {
    color: AppColors.textOnLight,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  meta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  status: {
    maxWidth: 130,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: 5,
    borderRadius: AppRadii.pill,
  },
  status_pending: {
    backgroundColor: AppColors.accent,
  },
  status_done: {
    backgroundColor: AppColors.primary,
  },
  status_late: {
    backgroundColor: AppColors.errorText,
  },
  status_closed: {
    backgroundColor: AppColors.surfaceMuted,
  },
  status_count: {
    backgroundColor: AppColors.surfaceMuted,
  },
  statusText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  statusTextOnAccent: {
    color: AppColors.textOnLight,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    padding: AppSpacing.sm,
    paddingRight: AppSpacing.md,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  itemIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  itemName: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: AppColors.textPrimary,
  },
  remove: {
    paddingHorizontal: AppSpacing.md,
    paddingVertical: 6,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  removeText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textPrimary,
  },
});
