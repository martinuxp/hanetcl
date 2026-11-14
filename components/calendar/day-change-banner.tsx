import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import type { DayChange } from '@/services/schedule-service';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { capitalize, months, t, weekdays } from '@/i18n';

// How a suspension of classes or an early dismissal shows in the Calendar:
// a solid pink card on top of the day, and a pink line where classes end.

const WEEKDAYS = weekdays();
const MONTHS = months();

function parts(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "lunes 16 de noviembre". */
export function changeDayLabel(key: string) {
  const date = parts(key);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

/** "Lunes 16" or "Del lunes 16 al miércoles 18". */
export function changeDates(change: Pick<DayChange, 'from' | 'to'>) {
  const short = (key: string) => {
    const date = parts(key);
    return `${WEEKDAYS[date.getDay()]} ${date.getDate()}`;
  };
  return change.from === change.to
    ? capitalize(short(change.from))
    : t('components.calendar.dayChangeBanner.delShortAlShort2', { short: short(change.from), short2: short(change.to) });
}

/** "Clases suspendidas" or "Salida anticipada · 12:30". */
export function changeTitle(change: Pick<DayChange, 'kind' | 'endsAt'>) {
  return change.kind === 'suspended'
    ? t('components.calendar.dayChangeBanner.clasesSuspendidas')
    : t('components.calendar.dayChangeBanner.salidaALasEndsat', { endsAt: change.endsAt ?? '' });
}

/** "Todo el liceo" or the courses. */
export function changeScope(change: Pick<DayChange, 'scope' | 'courses'>) {
  return change.scope === 'school' ? t('services.feedService.todoElLiceo') : change.courses.join(', ');
}

/** The card on top of a day that changed. Admin and HNT can manage it from there. */
export function DayChangeBanner({ change, canManage }: { change: DayChange; canManage: boolean }) {
  const router = useRouter();
  const meta = `${changeDates(change)} · ${changeScope(change)}`;
  return (
    <View accessibilityRole="summary" style={styles.banner}>
      <ThemedText style={styles.meta} numberOfLines={2}>{meta}</ThemedText>
      <ThemedText style={styles.title}>{changeTitle(change)}</ThemedText>
      {!!change.reason && <ThemedText style={styles.reason}>{change.reason}</ThemedText>}
      <ThemedText style={styles.note}>
        {change.kind === 'suspended'
          ? t('components.calendar.dayChangeBanner.lasPruebasDeEstosDias')
          : t('components.calendar.dayChangeBanner.lasPruebasDespuesDeLa')}
      </ThemedText>
      {canManage && (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('components.calendar.dayChangeBanner.abreLosCambiosDeDias')}
          onPress={() => router.push({ pathname: '/day-change', params: { date: change.from } })}
          style={({ pressed }) => [styles.manage, pressed && AppPressed]}
        >
          <ThemedText style={styles.manageText}>{t('components.calendar.dayChangeBanner.administrar')}</ThemedText>
          <CustomIcon name="chevron-right" size={14} color={AppColors.textPrimary} />
        </Pressable>
      )}
    </View>
  );
}

/** The coming suspensions and early dismissals, for the Horario: the week stays as it is. */
export function DayChangeList({ changes }: { changes: DayChange[] }) {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const coming = changes.filter(change => change.to >= key).sort((a, b) => a.from.localeCompare(b.from));
  if (!coming.length) return null;
  return (
    <View style={styles.list}>
      {coming.map(change => (
        <View key={change.id} style={styles.row}>
          <View style={styles.rowDot} />
          <View style={styles.rowText}>
            <ThemedText style={styles.rowTitle}>{changeDates(change)}: {changeTitle(change).toLocaleLowerCase('es')}</ThemedText>
            {!!change.reason && <ThemedText style={styles.rowReason}>{change.reason}</ThemedText>}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Where an early dismissal cuts the day. */
export function DismissalLine({ endsAt }: { endsAt: string }) {
  return (
    <View style={styles.cut} accessibilityLabel={t('components.calendar.dayChangeBanner.salidaALasEndsat', { endsAt })}>
      <View style={styles.cutLine} />
      <View style={styles.cutPill}>
        <ThemedText style={styles.cutText}>{t('components.calendar.dayChangeBanner.salidaALasEndsat', { endsAt })}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: 4,
    padding: AppSpacing.lg,
    marginBottom: AppSpacing.md,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.accent,
  },
  meta: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: AppColors.textPrimary,
    opacity: 0.85,
  },
  title: {
    ...AppType.title3,
    color: AppColors.textPrimary,
  },
  reason: {
    ...AppType.callout,
    color: AppColors.textPrimary,
  },
  note: {
    ...AppType.footnote,
    color: AppColors.textPrimary,
    opacity: 0.85,
  },
  manage: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: AppSpacing.sm,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: 6,
    borderRadius: AppRadii.pill,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  manageText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  list: {
    gap: AppSpacing.sm,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.accent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing.sm,
  },
  rowDot: {
    width: 8,
    height: 8,
    marginTop: 6,
    borderRadius: 4,
    backgroundColor: AppColors.accent,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  rowReason: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
  cut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    marginVertical: AppSpacing.sm,
  },
  cutLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: AppColors.accent,
  },
  cutPill: {
    paddingHorizontal: AppSpacing.md,
    paddingVertical: 4,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.accent,
  },
  cutText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
});
