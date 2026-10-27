import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { useSession } from '@/services/auth-service';
import { peekCached, useCached } from '@/services/cache';
import { isBreak, minutesOf, myWeek, nowAndNext } from '@/services/schedule-service';
import type { CourseSchedule } from '@/services/schedule-service';
import { CALENDAR_VIEWS, calendarBar, useCalendarBar, viewLabel } from '@/components/calendar/calendar-bar-store';
import type { CalendarView } from '@/components/calendar/calendar-bar-store';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING_SMOOTH } from '@/constants/motion';

type ViewIcon = React.ComponentProps<typeof CustomIcon>['name'];

const VIEW_ICONS: Record<CalendarView, ViewIcon> = {
  day: 'view-day',
  week: 'view-week',
  month: 'calendar',
  year: 'view-year',
  schedule: 'clock',
};

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// The bar's text stops growing with the system size at this point.
const MAX_SCALE = 1.3;

const tick = () => {
  if (Platform.OS === 'ios') void Haptics.selectionAsync();
};

/** The bar's center pill on the Calendar: the view on screen, and the way to change it. */
export function CalendarViewPill({ view, open, onPress }: { view: CalendarView; open: boolean; onPress: () => void }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(open ? 1 : 0);
  React.useEffect(() => {
    turn.value = reduceMotion ? withTiming(open ? 1 : 0, { duration: 100 }) : withSpring(open ? 1 : 0, SPRING_SMOOTH);
  }, [open, reduceMotion, turn]);
  // The chevron points up to where the menu opens, and down to close it.
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-90 + turn.value * 180}deg` }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Vista: ${viewLabel(view)}`}
      accessibilityHint={open ? 'Cierra el menú de vistas' : 'Cambia entre día, semana, mes, año y horario'}
      accessibilityState={{ expanded: open }}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Animated.View layout={reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING_SMOOTH.stiffness).damping(SPRING_SMOOTH.damping)} style={styles.pill}>
        <CustomIcon name={VIEW_ICONS[view]} size={18} color={AppColors.textOnLight} />
        <ThemedText maxFontSizeMultiplier={MAX_SCALE} style={styles.pillText}>{viewLabel(view)}</ThemedText>
        <Animated.View style={chevronStyle}>
          <CustomIcon name="chevron-right" size={14} color={AppColors.textOnLight} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** What grows out of the pill: where the day stands, the five views, and "Crear evento" for editors. */
export function CalendarViewMenu({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const { user } = useSession();
  const { view, menuOpen } = useCalendarBar();
  const key = user ? 'schedule:mine' : null;
  const kept = useCached<CourseSchedule>(key);
  const schedule = (key ? peekCached<CourseSchedule>(key) : undefined) ?? kept;

  // Read again each time the menu opens, so "Ahora" is about now.
  const now = React.useMemo(() => new Date(), [menuOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const { current, next } = nowAndNext(myWeek(schedule), now);
  const live = current && !isBreak(current) ? current : null;
  const minute = now.getHours() * 60 + now.getMinutes();
  const elapsed = live ? (minute - minutesOf(live.start)) / Math.max(1, minutesOf(live.end) - minutesOf(live.start)) : 0;

  const today = live
    ? { label: 'Ahora', title: live.subject, meta: `Hasta las ${live.end}${live.room ? ` · ${live.room}` : ''}` }
    : next
      ? { label: 'Después', title: next.subject, meta: `A las ${next.start}${next.room ? ` · ${next.room}` : ''}` }
      : { label: 'Hoy', title: `${WEEKDAYS[now.getDay()]} ${now.getDate()}`, meta: `de ${MONTHS[now.getMonth()]}` };

  return (
    <View style={styles.menu}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${today.label}: ${today.title}, ${today.meta}. Ir a hoy`}
        onPress={() => {
          tick();
          calendarBar.choose('day', true);
        }}
        style={({ pressed }) => [styles.todayCard, pressed && styles.pressed]}
      >
        <View style={styles.todayText}>
          <ThemedText maxFontSizeMultiplier={MAX_SCALE} style={styles.todayLabel}>{today.label}</ThemedText>
          <ThemedText maxFontSizeMultiplier={MAX_SCALE} numberOfLines={1} style={styles.todayTitle}>{today.title}</ThemedText>
          <ThemedText maxFontSizeMultiplier={MAX_SCALE} numberOfLines={1} style={styles.todayMeta}>{today.meta}</ThemedText>
          {!!live && (
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, elapsed)) * 100)}%` }]} />
            </View>
          )}
        </View>
        <View style={styles.todayButton}>
          <CustomIcon name="chevron-right" size={22} color={AppColors.textPrimary} />
        </View>
      </Pressable>

      <View accessibilityRole="menu" style={styles.rows}>
        {CALENDAR_VIEWS.map(item => {
          const selected = item.view === view;
          return (
            <Pressable
              key={item.view}
              accessibilityRole="menuitem"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              onPress={() => {
                tick();
                calendarBar.choose(item.view);
              }}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <CustomIcon name={VIEW_ICONS[item.view]} size={22} color={selected ? AppColors.textPrimary : AppColors.textSecondary} />
              <ThemedText maxFontSizeMultiplier={MAX_SCALE} style={[styles.rowText, selected && styles.rowTextSelected]}>{item.label}</ThemedText>
              {selected && <CustomIcon name="check-circle" size={20} color={AppColors.accent} />}
            </Pressable>
          );
        })}
        {canCreate && (
          <>
            <View style={styles.separator} />
            <Pressable
              accessibilityRole="menuitem"
              accessibilityLabel="Crear evento"
              onPress={() => {
                calendarBar.closeMenu();
                router.navigate('/create-event');
              }}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <CustomIcon name="plus" size={20} color={AppColors.textSecondary} />
              <ThemedText maxFontSizeMultiplier={MAX_SCALE} style={styles.rowText}>Crear evento</ThemedText>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  pill: {
    height: 45,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.controlActive,
  },
  pillText: {
    color: AppColors.textOnLight,
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
  },
  menu: {
    padding: AppSpacing.sm + 2,
    paddingBottom: AppSpacing.xs,
  },
  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: AppColors.controlActive,
  },
  todayText: {
    flex: 1,
    gap: 1,
  },
  todayLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: AppColors.textOnLight,
    opacity: 0.6,
  },
  todayTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textOnLight,
  },
  todayMeta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textOnLight,
    opacity: 0.7,
  },
  track: {
    height: 4,
    marginTop: AppSpacing.sm,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(40, 40, 41, 0.15)',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: AppColors.accent,
  },
  todayButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: AppColors.controlOnActive,
  },
  rows: {
    paddingTop: AppSpacing.xs,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md + 2,
    paddingHorizontal: AppSpacing.md + 2,
    borderRadius: AppRadii.md,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  rowText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 17,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  rowTextSelected: {
    fontFamily: 'DMSans_700Bold',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: AppSpacing.xs,
    marginHorizontal: AppSpacing.md + 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
});
