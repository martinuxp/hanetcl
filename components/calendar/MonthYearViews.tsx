import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { formatTime } from '@/services/ical-service';
import type { CalendarEvent } from '@/services/ical-service';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MAX_DOTS = 3;

export type ScreenPoint = { x: number; y: number };

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Weeks start on Monday. Always six rows, so the grid keeps its height from
// month to month and the agenda below does not jump.
function monthCells(month: Date): (Date | null)[] {
  const year = month.getFullYear();
  const index = month.getMonth();
  const firstWeekday = (new Date(year, index, 1).getDay() + 6) % 7;
  const days = new Date(year, index + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= days; day++) cells.push(new Date(year, index, day));
  while (cells.length < 42) cells.push(null);
  return cells;
}

type MonthViewProps = {
  month: Date;
  events: CalendarEvent[];
  selectedDate: Date;
  bottomInset: number;
  /** `from` is the tap point on screen, where the zoom grows from. */
  onPickDay: (date: Date, from: ScreenPoint) => void;
  onOpenEvent: (event: CalendarEvent) => void;
};

/** The month as a grid: a dot per event (up to three), today ringed, and the month's agenda below. */
export function MonthView({ month, events, selectedDate, bottomInset, onPickDay, onOpenEvent }: MonthViewProps) {
  const today = new Date();
  const cells = useMemo(() => monthCells(month), [month]);

  const monthEvents = useMemo(
    () => events.filter(event => event.startDate.getFullYear() === month.getFullYear() && event.startDate.getMonth() === month.getMonth()),
    [events, month],
  );
  const countByDay = useMemo(() => {
    const counts = new Map<string, number>();
    monthEvents.forEach(event => counts.set(dayKey(event.startDate), (counts.get(dayKey(event.startDate)) ?? 0) + 1));
    return counts;
  }, [monthEvents]);

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset }]} showsVerticalScrollIndicator={false}>
      <View style={styles.grid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((weekday, index) => (
          <View key={`${weekday}-${index}`} style={styles.cell}>
            <ThemedText style={styles.weekday}>{weekday}</ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (!day) return <View key={`blank-${index}`} style={styles.cell} />;
          const count = countByDay.get(dayKey(day)) ?? 0;
          const isToday = isSameDay(day, today);
          const selected = isSameDay(day, selectedDate);
          return (
            <View key={dayKey(day)} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${WEEKDAY_NAMES[index % 7]} ${day.getDate()} de ${MONTH_NAMES[day.getMonth()]}${isToday ? ', hoy' : ''}${count ? `, ${count === 1 ? '1 evento' : `${count} eventos`}` : ''}`}
                accessibilityHint="Abre ese día en la semana"
                accessibilityState={{ selected }}
                onPress={event => onPickDay(day, { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })}
                style={({ pressed }) => [styles.day, isToday && styles.dayToday, selected && styles.daySelected, pressed && styles.pressed]}
              >
                <ThemedText style={[styles.dayNumber, selected && styles.dayNumberSelected]}>{day.getDate()}</ThemedText>
                <View style={styles.dots}>
                  {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, dot) => (
                    <View key={dot} style={[styles.dot, selected && styles.dotSelected]} />
                  ))}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.agenda}>
        <ThemedText accessibilityRole="header" style={styles.agendaTitle}>
          {monthEvents.length === 0 ? `Sin eventos en ${MONTH_NAMES[month.getMonth()]}` : `${monthEvents.length === 1 ? '1 evento' : `${monthEvents.length} eventos`} en ${MONTH_NAMES[month.getMonth()]}`}
        </ThemedText>
        {monthEvents.map(event => {
          const weekday = (event.startDate.getDay() + 6) % 7;
          return (
            <Pressable
              key={event.id}
              accessibilityRole="button"
              accessibilityLabel={`${event.title}, ${WEEKDAY_NAMES[weekday]} ${event.startDate.getDate()}, ${formatTime(event.startDate)}${event.cancelled ? ', cancelado' : ''}`}
              accessibilityHint="Abre el detalle del evento"
              onPress={() => onOpenEvent(event)}
              style={({ pressed }) => [styles.agendaRow, event.cancelled && styles.agendaRowCancelled, pressed && styles.pressed]}
            >
              <View style={styles.agendaDate}>
                <ThemedText style={styles.agendaDay}>{event.startDate.getDate()}</ThemedText>
                <ThemedText style={styles.agendaWeekday}>{WEEKDAY_SHORT[weekday]}</ThemedText>
              </View>
              <View style={styles.agendaCopy}>
                <ThemedText numberOfLines={2} style={[styles.agendaEvent, event.cancelled && styles.cancelledText]}>{event.title}</ThemedText>
                <ThemedText style={styles.agendaMeta}>
                  {formatTime(event.startDate)} - {formatTime(event.endDate)}{event.subject ? ` · ${event.subject}` : ''}{event.cancelled ? ' · Cancelado' : ''}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

type YearViewProps = {
  year: number;
  events: CalendarEvent[];
  selectedMonth: Date;
  bottomInset: number;
  onPickMonth: (month: Date, from: ScreenPoint) => void;
};

/** Twelve months with how many events each holds; the current month is ringed. */
export function YearView({ year, events, selectedMonth, bottomInset, onPickMonth }: YearViewProps) {
  const today = new Date();
  const counts = useMemo(() => {
    const perMonth = Array.from({ length: 12 }, () => 0);
    events.forEach(event => {
      if (event.startDate.getFullYear() === year) perMonth[event.startDate.getMonth()] += 1;
    });
    return perMonth;
  }, [events, year]);

  return (
    <ScrollView contentContainerStyle={[styles.scroll, styles.yearGrid, { paddingBottom: bottomInset }]} showsVerticalScrollIndicator={false}>
      {MONTH_NAMES.map((name, index) => {
        const isCurrent = today.getFullYear() === year && today.getMonth() === index;
        const selected = selectedMonth.getFullYear() === year && selectedMonth.getMonth() === index;
        const count = counts[index];
        return (
          <View key={name} style={styles.monthCell}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name} ${year}${isCurrent ? ', mes actual' : ''}, ${count === 0 ? 'sin eventos' : count === 1 ? '1 evento' : `${count} eventos`}`}
              accessibilityHint="Abre el mes"
              accessibilityState={{ selected }}
              onPress={event => onPickMonth(new Date(year, index, 1), { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })}
              style={({ pressed }) => [styles.monthTile, isCurrent && styles.monthTileCurrent, selected && styles.monthTileSelected, pressed && styles.pressed]}
            >
              <ThemedText style={[styles.monthName, selected && styles.onActive]}>{name}</ThemedText>
              <ThemedText style={[styles.monthCount, selected && styles.onActive]}>
                {count === 0 ? 'Sin eventos' : count === 1 ? '1 evento' : `${count} eventos`}
              </ThemedText>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    padding: 2,
  },
  weekday: {
    ...AppType.caption,
    textAlign: 'center',
    color: AppColors.textSecondary,
    opacity: 0.72,
    marginBottom: AppSpacing.xs,
  },
  day: {
    minHeight: 52,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 3,
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: AppColors.accent,
  },
  daySelected: {
    backgroundColor: AppColors.controlActive,
  },
  dayNumber: {
    ...AppType.headline,
    color: AppColors.textSecondary,
  },
  dayNumberSelected: {
    color: AppColors.controlOnActive,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: AppColors.accent,
  },
  dotSelected: {
    backgroundColor: AppColors.controlOnActive,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  agenda: {
    marginTop: AppSpacing.xl,
    gap: AppSpacing.sm,
  },
  agendaTitle: {
    ...AppType.title3,
    color: AppColors.textSecondary,
    marginBottom: AppSpacing.xs,
  },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    padding: AppSpacing.md,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  agendaRowCancelled: {
    opacity: 0.7,
  },
  agendaDate: {
    width: 44,
    alignItems: 'center',
  },
  agendaDay: {
    ...AppType.title3,
    color: AppColors.textPrimary,
  },
  agendaWeekday: {
    ...AppType.caption,
    color: AppColors.textSecondary,
  },
  agendaCopy: {
    flex: 1,
    gap: 2,
  },
  agendaEvent: {
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  cancelledText: {
    textDecorationLine: 'line-through',
  },
  agendaMeta: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    width: '33.333%',
    padding: AppSpacing.xs,
  },
  monthTile: {
    minHeight: 84,
    padding: AppSpacing.md,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    justifyContent: 'space-between',
  },
  monthTileCurrent: {
    borderWidth: 1.5,
    borderColor: AppColors.accent,
  },
  monthTileSelected: {
    backgroundColor: AppColors.controlActive,
  },
  monthName: {
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  monthCount: {
    ...AppType.caption,
    color: AppColors.textSecondary,
  },
  onActive: {
    color: AppColors.controlOnActive,
  },
});
