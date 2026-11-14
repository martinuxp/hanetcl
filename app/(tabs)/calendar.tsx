import { AppColors, AppSpacing, AppType } from '@/constants/design-tokens';
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Platform, RefreshControl, type ScrollViewInstance, type ViewInstance } from 'react-native';
import { FrostedScreen, useFrostedInset, withTopInset } from '@/components/ui/frosted-screen';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { CalendarDaysIcon } from '@/assets/animated-icons/calendar';
import { useFocusEffect, useRouter } from 'expo-router';
import PagerView from '@/components/PagerView';
import { CalendarDaySkeleton } from '@/components/skeletons';
import Animated, { Easing, FadeIn, FadeInLeft, FadeInRight, FadeOut, Keyframe, SlideInLeft, SlideInRight, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { SPRING_MOMENTUM, SPRING_SMOOTH, project, EASE_OUT_CUBIC } from '@/constants/motion';
import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { MONTH_NAMES, MonthView, WeekView, YearView } from '@/components/calendar/MonthYearViews';
import { calendarBar, useCalendarBar } from '@/components/calendar/calendar-bar-store';
import type { CalendarView } from '@/components/calendar/calendar-bar-store';
import { ScheduleView } from '@/components/schedule/schedule-view';
import type { ScreenPoint } from '@/components/calendar/MonthYearViews';
import {
  fetchCalendarEvents,
  keptCalendarCourse,
  restoreCalendarEvents,
  getEventsForDate,
  getWeekDays,
  getMonday,
  formatTime,
  CalendarEvent,
} from '@/services/ical-service';
import { EVENT_EDITOR_ROLES, ensureClaims, useRole, useSession } from '@/services/auth-service';
import { useContentWidth } from '@/hooks/use-desktop-layout';
import { sameSubject, subjectName } from '@/constants/subjects';
import { useCached } from '@/services/cache';
import { blockFate, blocksOn, changeOn, classesOn, dateKey, getCourseSchedule, isBreak, minutesOf, myWeek, scheduleDay } from '@/services/schedule-service';
import type { CourseSchedule, DayChange, ScheduleBlock } from '@/services/schedule-service';
import { DayChangeBanner, DismissalLine, changeDayLabel } from '@/components/calendar/day-change-banner';
import { db } from '@/services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { HanetButton } from '@/components/ui/hanet-button';
import { t } from '@/i18n';


type Frame = { x: number; width: number };

// Moving between levels reads as a camera move anchored on what was tapped:
// zooming out (day → week → month → year) everything shrinks a little, the
// old level away and the new one into place; zooming in everything grows.
// Horario is beside the levels, so going to or from it is a cross-fade.
function zoomFrames(enterFrom: number, exitTo: number) {
  return {
    enter: new Keyframe({
      0: { opacity: 0, transform: [{ scale: enterFrom }] },
      100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.cubic) },
    }).duration(220),
    exit: new Keyframe({
      0: { opacity: 1, transform: [{ scale: 1 }] },
      100: { opacity: 0, transform: [{ scale: exitTo }], easing: Easing.out(Easing.cubic) },
    }).duration(160),
  };
}
const ZOOM_OUT = zoomFrames(1.06, 0.94);
const ZOOM_IN = zoomFrames(0.94, 1.06);
// With reduced motion every change is a short cross-fade instead.
const CROSSFADE = { enter: FadeIn.duration(150), exit: FadeOut.duration(150) };
const LEVEL: Record<CalendarView, number> = { day: 0, week: 1, month: 2, year: 3, schedule: -1 };

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatShortDate = (date: Date) => `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3).toLowerCase()}`;

export default function CalendarScreen() {
  // Mon=0, Tue=1, ... Sat=5, Sun=6  (getDay: Sun=0,Mon=1,...Sat=6)
  const todayIndex = (new Date().getDay() + 6) % 7;
  const [selectedPageIndex, setSelectedPageIndex] = useState(todayIndex);
  const pagerRef = useRef<PagerView>(null);
  // Web has no PagerView; the day pages live in a horizontal ScrollView.
  const webPagerRef = useRef<ScrollViewInstance>(null);
  const { user, initializing } = useSession();
  const router = useRouter();
  // The pages are as wide as the space beside the side navigation (wide web window).
  const width = useContentWidth();
  const reduceMotion = useReducedMotion();

  // The token's role is what the rules check, so it decides what is shown.
  const userRole = useRole();
  const canAddEvents = !!userRole && EVENT_EDITOR_ROLES.includes(userRole);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekDays = getWeekDays(weekStart);
  const weekKey = weekStart.toISOString();
  // A new week arrives from the side it lies on, so the change has a direction.
  // Swiping into it already brought the day on screen, so the pages stay put;
  // nothing slides when the screen first opens or a zoom brings the week in.
  const [weekChange, setWeekChange] = useState<{ direction: 1 | -1; row: boolean; pages: boolean }>({ direction: 1, row: false, pages: false });
  const weekSlide = reduceMotion ? CROSSFADE.enter : (weekChange.direction > 0 ? FadeInRight : FadeInLeft).duration(200);
  const weekEntering = weekChange.row ? weekSlide : undefined;
  const pagesEntering = weekChange.pages ? weekSlide : undefined;

  // Views: the day pages, the week, month, year and Horario. The view lives in
  // the bar's store, since the bar's center pill names it and changes it.
  const { view } = useCalendarBar();
  const setView = calendarBar.setView;
  // `origin` is the tapped point inside the body, where the zoom is anchored.
  const [zoom, setZoom] = useState<{ direction: 'in' | 'out' | 'fade'; origin: [number, number] } | null>(null);
  const zoomMotion = !zoom ? undefined : reduceMotion || zoom.direction === 'fade' ? CROSSFADE : zoom.direction === 'out' ? ZOOM_OUT : ZOOM_IN;
  const bodyRef = useRef<ViewInstance>(null);
  const bodyFrame = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  // Null right after a zoom (nothing slides). The arrows nudge the new month in
  // from their side; a swipe already carried the old one off screen, so the
  // new one slides in the rest of the way.
  const [monthSlide, setMonthSlide] = useState<{ direction: 1 | -1; bySwipe: boolean } | null>(null);
  const monthEntering = !monthSlide
    ? undefined
    : reduceMotion
      ? CROSSFADE.enter
      : monthSlide.bySwipe
        ? (monthSlide.direction > 0 ? SlideInRight : SlideInLeft).duration(240).easing(EASE_OUT_CUBIC)
        : (monthSlide.direction > 0 ? FadeInRight : FadeInLeft).duration(200);
  // The pager holds the week plus a neighbour day on each side (the previous
  // Sunday and the next Monday); landing on one of those moves to that week.
  const pageDates = [
    new Date(weekDays[0].dateObj.getFullYear(), weekDays[0].dateObj.getMonth(), weekDays[0].dateObj.getDate() - 1),
    ...weekDays.map(day => day.dateObj),
    new Date(weekDays[6].dateObj.getFullYear(), weekDays[6].dateObj.getMonth(), weekDays[6].dateObj.getDate() + 1),
  ];

  // Selection pill behind the day chips: it follows the finger while the
  // pages are dragged and glides to the chosen day otherwise.
  const [chipFrames, setChipFrames] = useState<Frame[]>([]);
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const indicatorPlaced = useRef(false);
  const draggingRef = useRef(false);
  const selectedRef = useRef(selectedPageIndex);
  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicatorWidth.get(),
    opacity: indicatorWidth.get() > 0 ? 1 : 0,
    transform: [{ translateX: indicatorX.get() }],
  }));

  const placeIndicator = useCallback((index: number, animated: boolean) => {
    const frame = chipFrames[index];
    if (!frame) return;
    if (animated && !reduceMotion) {
      indicatorX.set(withSpring(frame.x, SPRING_SMOOTH));
      indicatorWidth.set(withSpring(frame.width, SPRING_SMOOTH));
    } else {
      indicatorX.set(frame.x);
      indicatorWidth.set(frame.width);
    }
  }, [chipFrames, indicatorWidth, indicatorX, reduceMotion]);

  useEffect(() => {
    selectedRef.current = selectedPageIndex;
    if (draggingRef.current || !chipFrames[selectedPageIndex]) return;
    placeIndicator(selectedPageIndex, indicatorPlaced.current);
    indicatorPlaced.current = true;
  }, [chipFrames, placeIndicator, selectedPageIndex]);

  const recordChipFrame = (index: number, frame: Frame) => {
    setChipFrames(current => {
      const known = current[index];
      if (known && known.x === frame.x && known.width === frame.width) return current;
      const next = [...current];
      next[index] = frame;
      return next;
    });
  };

  // `page` counts the neighbour Sunday as 0; the pill stays within the week.
  const trackPages = (page: number, offset: number) => {
    const day = Math.max(0, Math.min(6, page - 1 + offset));
    const from = chipFrames[Math.floor(day)];
    const to = chipFrames[Math.ceil(day)];
    if (!from || !to) return;
    const frac = day - Math.floor(day);
    indicatorX.set(from.x + (to.x - from.x) * frac);
    indicatorWidth.set(from.width + (to.width - from.width) * frac);
  };

  const startDragging = () => {
    draggingRef.current = true;
  };

  const stopDragging = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    placeIndicator(selectedRef.current, true);
  };

  // iCal events
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasEventsRef = useRef(false);
  // The timetable goes under each day: classes with what is due in them.
  const keptSchedule = useCached<CourseSchedule>(user ? 'schedule:mine' : null);
  const [schedule, setSchedule] = useState<CourseSchedule | null>(null);
  const week = myWeek(schedule ?? keptSchedule);
  // Suspensions and early dismissals of the course, on top of the week.
  const changes = (schedule ?? keptSchedule)?.changes ?? [];
  const canChangeDays = !!(schedule ?? keptSchedule)?.canChangeDays;

  const loadEvents = useCallback(async (silent = false) => {
    if (initializing) return;
    if (!user) {
      setAllEvents([]);
      setLoadError(t('calendar.iniciaSesionParaVerEl'));
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      // The claims sync starts with the profile read instead of after it.
      const claims = ensureClaims(user);
      claims.catch(() => undefined);
      // What the phone kept from last time shows at once, before the profile
      // read that says the course: without internet that read never answers.
      if (!hasEventsRef.current) {
        const keptCourse = await keptCalendarCourse();
        const kept = keptCourse ? await restoreCalendarEvents(keptCourse) : undefined;
        if (kept && !hasEventsRef.current) {
          setAllEvents(kept);
          hasEventsRef.current = true;
          setLoading(false);
        }
      }
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const courseId = userDoc.data()?.courseId;
      if (courseId) {
        // What the phone kept from last time shows while the course loads.
        if (!hasEventsRef.current) {
          const kept = await restoreCalendarEvents(courseId);
          if (kept && !hasEventsRef.current) {
            setAllEvents(kept);
            hasEventsRef.current = true;
            setLoading(false);
          }
        }
        await claims;
        getCourseSchedule().then(setSchedule).catch(() => undefined);
        const events = await fetchCalendarEvents(courseId);
        setAllEvents(events);
        setLastUpdated(new Date());
        hasEventsRef.current = true;
      } else {
        setAllEvents([]);
        setLoadError(t('common.tuHanetIdTodaviaNo'));
      }
    } catch (e) {
      console.error(e);
      // A failed background refresh keeps what is already on screen.
      if (!silent || !hasEventsRef.current) {
        setLoadError((e as { code?: string }).code === 'permission-denied'
          ? t('calendar.tuCuentaNoTienePermiso')
          : t('calendar.noPudimosCargarElCalendario'));
      }
    } finally {
      setLoading(false);
    }
  }, [initializing, user]);

  useFocusEffect(
    useCallback(() => {
      if (!initializing) void loadEvents(true);
    }, [initializing, loadEvents])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents(true);
    setRefreshing(false);
  };

  const handleDaySelect = (index: number) => {
    setSelectedPageIndex(index);
    pagerRef.current?.setPage(index + 1);
    webPagerRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  };

  // Changing week keeps the weekday that was selected.
  const shiftWeek = (delta: number, bySwipe = false) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + delta * 7);
    setWeekChange({ direction: delta > 0 ? 1 : -1, row: true, pages: !bySwipe });
    setWeekStart(next);
  };

  const handlePageSelected = (page: number) => {
    if (page <= 0) {
      draggingRef.current = false;
      setSelectedPageIndex(6);
      shiftWeek(-1, true);
    } else if (page >= 8) {
      draggingRef.current = false;
      setSelectedPageIndex(0);
      shiftWeek(1, true);
    } else {
      setSelectedPageIndex(page - 1);
    }
  };

  const goToPrevWeek = () => shiftWeek(-1);
  const goToNextWeek = () => shiftWeek(1);

  const goToToday = () => {
    const thisWeek = getMonday(new Date());
    setWeekChange({ direction: thisWeek > weekStart ? 1 : -1, row: true, pages: true });
    setWeekStart(thisWeek);
    setSelectedPageIndex(todayIndex);
    // Within the same week the pager is not remounted, so move it by hand.
    pagerRef.current?.setPage(todayIndex + 1);
    webPagerRef.current?.scrollTo({ x: (todayIndex + 1) * width, animated: false });
  };

  const measureBody = () => {
    bodyRef.current?.measureInWindow((x, y, w, h) => { bodyFrame.current = { x, y, width: w, height: h }; });
  };

  // The old level first takes the new anchor, then leaves: one frame later the
  // new level comes in from the same point.
  const zoomTo = (next: CalendarView, direction: 'in' | 'out' | 'fade', from?: ScreenPoint) => {
    const frame = bodyFrame.current;
    const origin: [number, number] = from
      ? [from.x - frame.x, from.y - frame.y]
      : [frame.width / 2, frame.height / 2];
    setMonthSlide(null);
    setZoom({ direction, origin });
    requestAnimationFrame(() => setView(next));
  };

  const pointOf = (event: { nativeEvent: { pageX: number; pageY: number } }): ScreenPoint => ({
    x: event.nativeEvent.pageX,
    y: event.nativeEvent.pageY,
  });

  const openMonth = (from: ScreenPoint) => {
    const day = weekDays[selectedPageIndex].dateObj;
    setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    zoomTo('month', 'out', from);
  };

  const pickMonth = (month: Date, from: ScreenPoint) => {
    setVisibleMonth(month);
    zoomTo('month', 'in', from);
  };

  const showDay = (date: Date) => {
    const monday = getMonday(date);
    setWeekChange({ direction: monday > weekStart ? 1 : -1, row: false, pages: false });
    setWeekStart(monday);
    setSelectedPageIndex((date.getDay() + 6) % 7);
  };

  // A day picked in the week or the month opens its page.
  const pickDay = (date: Date, from: ScreenPoint) => {
    showDay(date);
    zoomTo('day', 'in', from);
  };

  // A view asked from the bar's menu. Coming down from the month or the year,
  // the day and the week land in the month that was on screen.
  const choose = (next: CalendarView, toToday: boolean) => {
    if (toToday) {
      if (view === 'day') {
        goToToday();
        return;
      }
      showDay(new Date());
    } else if (next === view) {
      return;
    } else if ((next === 'day' || next === 'week') && (view === 'month' || view === 'year')) {
      const now = new Date();
      const inMonth = visibleMonth.getFullYear() === now.getFullYear() && visibleMonth.getMonth() === now.getMonth();
      const target = inMonth ? now : visibleMonth;
      if (getMonday(target).getTime() !== weekStart.getTime()) showDay(target);
    } else if ((next === 'month' || next === 'year') && view !== 'month' && view !== 'year') {
      const day = weekDays[selectedPageIndex].dateObj;
      setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
    const direction = view === 'schedule' || next === 'schedule' ? 'fade' : LEVEL[next] > LEVEL[view] ? 'out' : 'in';
    zoomTo(next, direction);
  };
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });
  useEffect(() => calendarBar.handleChoose((next, toToday) => chooseRef.current(next, toToday)), []);

  // In the month a step is a month; in the year, a whole year.
  const shiftMonth = (delta: 1 | -1, bySwipe = false) => {
    const step = view === 'year' ? 12 : 1;
    setMonthSlide({ direction: delta, bySwipe });
    setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + delta * step, 1));
  };

  const goToThisMonth = () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    setMonthSlide({ direction: thisMonth > visibleMonth ? 1 : -1, bySwipe: false });
    setVisibleMonth(thisMonth);
  };

  // Month and year follow the finger sideways like the week pages. A release
  // that would carry past a third of the screen moves on at the finger's
  // speed; anything shorter settles back.
  const swipeX = useSharedValue(0);
  const swipeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: swipeX.get() }] }));
  // In the week a swipe moves a week; in the month and the year, as above.
  const finishSwipe = (delta: 1 | -1) => (view === 'week' ? shiftWeek(delta) : shiftMonth(delta, true));
  // The carrier returns to rest only once the new month is mounted, so the
  // old one never flashes back for a frame.
  useLayoutEffect(() => {
    swipeX.set(0);
  }, [swipeX, visibleMonth, weekStart]);
  // Grabbed while settling back, the page carries on from where it is on
  // screen; once a change of month is under way it finishes first.
  const swipeFrom = useSharedValue(0);
  const swipeCommitted = useSharedValue(false);
  useLayoutEffect(() => {
    swipeCommitted.set(false);
  }, [swipeCommitted, visibleMonth, weekStart]);
  const levelSwipe = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onStart(() => {
      swipeFrom.set(swipeX.get());
    })
    .onUpdate(event => {
      if (swipeCommitted.get()) return;
      swipeX.set(swipeFrom.get() + event.translationX);
    })
    .onEnd(event => {
      if (swipeCommitted.get()) return;
      const resting = swipeX.get() + project(event.velocityX);
      if (Math.abs(resting) > width / 3) {
        const delta: 1 | -1 = resting < 0 ? 1 : -1;
        swipeCommitted.set(true);
        swipeX.set(withSpring(-delta * width, { ...SPRING_MOMENTUM, velocity: event.velocityX, overshootClamping: true }, finished => {
          if (finished) scheduleOnRN(finishSwipe, delta);
        }));
      } else {
        swipeX.set(withSpring(0, { ...SPRING_SMOOTH, velocity: event.velocityX }));
      }
    });

  const openEvent = (event: CalendarEvent) => {
    router.push({ pathname: '/event-info', params: { id: event.id, canEdit: canAddEvents ? '1' : '0' } });
  };

  const currentDayInfo = weekDays[selectedPageIndex];
  const today = new Date();
  const isTodaySelected = isSameDay(currentDayInfo.dateObj, today);
  // Creating an event from the menu starts on the day on screen.
  const selectedKey = dateKey(currentDayInfo.dateObj);
  useEffect(() => { calendarBar.setDay(selectedKey); }, [selectedKey]);
  useEffect(() => () => calendarBar.setDay(null), []);

  // The header (and the day strip under it) float over the content as
  // frosted glass: what scrolls under them shows through, blurred.
  const header = (
    <>
      {/* Header */}
      {view === 'schedule' ? (
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <ThemedText accessibilityRole="header" style={styles.headerTitle}>{t('common.horario')}</ThemedText>
          </View>
        </View>
      ) : view === 'week' ? (
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.semanaAnterior')} style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]} onPress={goToPrevWeek}>
            <CustomIcon name="chevron-left" size={20} color={AppColors.textSecondary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('calendar.semanaDelShortdateAlShortdate2', { shortDate: formatShortDate(weekDays[0].dateObj), shortDate2: formatShortDate(weekDays[6].dateObj) })}
              hitSlop={6}
              onPress={event => openMonth(pointOf(event))}
              style={({ pressed }) => [styles.headerTitleButton, pressed && styles.pressed]}
            >
              <ThemedText accessibilityRole="header" style={styles.headerTitle}>
                {formatShortDate(weekDays[0].dateObj)} – {formatShortDate(weekDays[6].dateObj)}
              </ThemedText>
              <CustomIcon name="calendar" size={16} color={AppColors.textSecondary} />
            </Pressable>
            {weekStart.getTime() !== getMonday(today).getTime() && (
              <View style={styles.headerLinks}>
                <Pressable accessibilityRole="button" hitSlop={10} onPress={goToToday} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText style={styles.todayLink}>{t('calendar.estaSemana')}</ThemedText>
                </Pressable>
              </View>
            )}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.semanaSiguiente')} style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]} onPress={goToNextWeek}>
            <CustomIcon name="chevron-right" size={20} color={AppColors.textSecondary} />
          </Pressable>
        </View>
      ) : view === 'day' ? (
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.semanaAnterior')} style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]} onPress={goToPrevWeek}>
            <CustomIcon name="chevron-left" size={20} color={AppColors.textSecondary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('calendar.fulldateVerElMes', { fullDate: currentDayInfo.fullDate })}
              hitSlop={6}
              onPress={event => openMonth(pointOf(event))}
              style={({ pressed }) => [styles.headerTitleButton, pressed && styles.pressed]}
            >
              <ThemedText accessibilityRole="header" style={styles.headerTitle}>{currentDayInfo.fullDate}</ThemedText>
              <CustomIcon name="calendar" size={16} color={AppColors.textSecondary} />
            </Pressable>
            <View style={styles.headerLinks}>
              {!isTodaySelected && (
                <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.volverAHoy')} hitSlop={10} onPress={goToToday} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText style={styles.todayLink}>{t('calendar.volverAHoy')}</ThemedText>
                </Pressable>
              )}
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.semanaSiguiente')} style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]} onPress={goToNextWeek}>
            <CustomIcon name="chevron-right" size={20} color={AppColors.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={view === 'year' ? t('calendar.anoAnterior') : t('calendar.mesAnterior')}
            style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}
            onPress={() => shiftMonth(-1)}
          >
            <CustomIcon name="chevron-left" size={20} color={AppColors.textSecondary} />
          </Pressable>
          <View style={styles.headerCenter}>
            {view === 'month' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('calendar.monthnamesFullyearVerElAno', { monthNames: MONTH_NAMES[visibleMonth.getMonth()], fullYear: visibleMonth.getFullYear() })}
                hitSlop={6}
                onPress={event => zoomTo('year', 'out', pointOf(event))}
                style={({ pressed }) => [styles.headerTitleButton, pressed && styles.pressed]}
              >
                <ThemedText accessibilityRole="header" style={styles.headerTitle}>
                  {MONTH_NAMES[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
                </ThemedText>
                <CustomIcon name="calendar" size={16} color={AppColors.textSecondary} />
              </Pressable>
            ) : (
              <ThemedText accessibilityRole="header" style={styles.headerTitle}>{visibleMonth.getFullYear()}</ThemedText>
            )}
            <View style={styles.headerLinks}>
              {(visibleMonth.getFullYear() !== today.getFullYear() || (view === 'month' && visibleMonth.getMonth() !== today.getMonth())) && (
                <Pressable accessibilityRole="button" hitSlop={10} onPress={goToThisMonth} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText style={styles.todayLink}>{view === 'year' ? t('calendar.esteAno') : t('calendar.esteMes')}</ThemedText>
                </Pressable>
              )}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={view === 'year' ? t('calendar.anoSiguiente') : t('calendar.mesSiguiente')}
            style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}
            onPress={() => shiftMonth(1)}
          >
            <CustomIcon name="chevron-right" size={20} color={AppColors.textSecondary} />
          </Pressable>
        </View>
      )}
      {/* Day Selector */}
      {view === 'day' && (
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(180)} exiting={reduceMotion ? undefined : FadeOut.duration(120)} style={styles.daySelectorWrap}>
      <Animated.View pointerEvents="none" style={[styles.dayIndicator, indicatorStyle]} />
      <Animated.View key={weekKey} entering={weekEntering} style={styles.daySelector}>
        {weekDays.map((day, index) => {
          const isSelected = selectedPageIndex === index;
          const dayEvents = getEventsForDate(allEvents, day.dateObj);
          const hasEvents = dayEvents.length > 0;
          const dayChange = changeOn(changes, day.dateObj);
          const isToday = isSameDay(day.dateObj, today);
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`${day.dayName} ${day.date}${isToday ? t('common.hoy') : ''}${hasEvents ? t('calendar.conEventos') : ''}${dayChange ? (dayChange.kind === 'suspended' ? t('calendar.sinClases') : t('calendar.salidaALasEndsat', { endsAt: dayChange.endsAt })) : ''}`}
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => [styles.dayChip, isToday && styles.dayChipToday, isSelected && styles.dayChipSelected, pressed && styles.pressed]}
              onLayout={event => recordChipFrame(index, { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width })}
              onPress={() => handleDaySelect(index)}
            >
              <ThemedText style={[styles.dayName, isSelected && styles.dayNameSelected]}>{day.dayName}</ThemedText>
              <ThemedText style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{day.date}</ThemedText>
              {dayChange ? <View style={[styles.eventDot, styles.changeDot]} /> : hasEvents && <View style={styles.eventDot} />}
            </Pressable>
          );
        })}
      </Animated.View>
      </Animated.View>
      )}
    </>
  );

  return (
    <FrostedScreen style={styles.container} header={header}>
      {top => (
        <View ref={bodyRef} onLayout={measureBody} style={styles.body}>
        <Animated.View
          key={view}
          entering={zoomMotion?.enter}
          exiting={zoomMotion?.exit}
          style={[styles.body, zoom && { transformOrigin: [zoom.origin[0], zoom.origin[1], 0] }]}
        >
        {/* Loading */}
        {view === 'schedule' ? (
          <ScheduleView embedded />
        ) : loading || initializing ? (
          <View style={withTopInset(styles.loadingContainer, top)}>
            <CalendarDaySkeleton />
          </View>
        ) : loadError ? (
          <View accessibilityLiveRegion="polite" style={withTopInset(styles.statusContainer, top)}>
            <CalendarDaysIcon size={64} color={AppColors.surfaceSoft} />
            <ThemedText style={styles.emptyTitle}>{t('calendar.calendarioNoDisponible')}</ThemedText>
            <ThemedText style={styles.statusText}>{loadError}</ThemedText>
            <HanetButton
              label={user ? t('calendar.intentarDeNuevo') : t('common.iniciarSesion')}
              onPress={() => user ? void loadEvents() : router.push('/auth')}
              style={styles.statusButton}
            />
          </View>
        ) : view === 'week' ? (
          <GestureDetector gesture={levelSwipe}>
          <Animated.View style={[styles.pagerView, swipeStyle]}>
          <Animated.View key={`week-${weekKey}`} entering={weekEntering} style={styles.pagerView}>
            <WeekView
              days={weekDays.map(day => day.dateObj)}
              events={allEvents}
              blocksOn={date => classesOn(week, changes, date)}
              selectedDate={currentDayInfo.dateObj}
              bottomInset={TAB_BAR_CLEARANCE}
              onPickDay={pickDay}
              onOpenEvent={openEvent}
            />
          </Animated.View>
          </Animated.View>
          </GestureDetector>
        ) : view === 'month' ? (
          <GestureDetector gesture={levelSwipe}>
          <Animated.View style={[styles.pagerView, swipeStyle]}>
          <Animated.View key={`month-${visibleMonth.toISOString()}`} entering={monthEntering} style={styles.pagerView}>
            <MonthView
              month={visibleMonth}
              events={allEvents}
              selectedDate={currentDayInfo.dateObj}
              bottomInset={TAB_BAR_CLEARANCE}
              onPickDay={pickDay}
              onOpenEvent={openEvent}
            />
          </Animated.View>
          </Animated.View>
          </GestureDetector>
        ) : view === 'year' ? (
          <GestureDetector gesture={levelSwipe}>
          <Animated.View style={[styles.pagerView, swipeStyle]}>
          <Animated.View key={`year-${visibleMonth.getFullYear()}`} entering={monthEntering} style={styles.pagerView}>
            <YearView
              year={visibleMonth.getFullYear()}
              events={allEvents}
              selectedMonth={visibleMonth}
              bottomInset={TAB_BAR_CLEARANCE}
              onPickMonth={pickMonth}
            />
          </Animated.View>
          </Animated.View>
          </GestureDetector>
        ) : (
          /* Pages Swipe View */
          <Animated.View key={weekKey} entering={pagesEntering} style={styles.pagerView}>
            {Platform.OS === 'web' ? (
              <ScrollView
                ref={webPagerRef}
                horizontal
                pagingEnabled
                onLayout={() => webPagerRef.current?.scrollTo({ x: (selectedPageIndex + 1) * width, animated: false })}
                showsHorizontalScrollIndicator={false}
                style={styles.pagerView}
                scrollEventThrottle={16}
                onScrollBeginDrag={startDragging}
                onScroll={(e) => {
                  if (!draggingRef.current) return;
                  const page = e.nativeEvent.contentOffset.x / width;
                  trackPages(Math.floor(page), page - Math.floor(page));
                }}
                onMomentumScrollEnd={(e) => {
                  handlePageSelected(Math.round(e.nativeEvent.contentOffset.x / width));
                  stopDragging();
                }}
              >
                {pageDates.map((date, page) => (
                  <View key={`${weekKey}-${page}`} style={[styles.page, { width }]}>
                    <DailyTimeline
                      isAdmin={canAddEvents}
                      events={getEventsForDate(allEvents, date)}
                      blocks={blocksOn(week, scheduleDay(date))}
                      change={changeOn(changes, date)}
                      canManageChanges={canChangeDays}
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      lastUpdated={lastUpdated}
                    />
                  </View>
                ))}
              </ScrollView>
            ) : (
              <PagerView
                key={weekKey}
                style={styles.pagerView}
                initialPage={selectedPageIndex + 1}
                ref={pagerRef}
                onPageSelected={(e: { nativeEvent: { position: number } }) => handlePageSelected(e.nativeEvent.position)}
                onPageScroll={(e: { nativeEvent: { position: number; offset: number } }) => {
                  if (draggingRef.current) trackPages(e.nativeEvent.position, e.nativeEvent.offset);
                }}
                onPageScrollStateChanged={(e: { nativeEvent: { pageScrollState: string } }) => {
                  // While settling the pill keeps following the pages; it hands
                  // over to the spring only once they rest.
                  if (e.nativeEvent.pageScrollState === 'dragging') startDragging();
                  else if (e.nativeEvent.pageScrollState === 'idle') stopDragging();
                }}
              >
                {pageDates.map((date, page) => (
                  <View key={`${weekKey}-${page}`} style={styles.page}>
                    <DailyTimeline
                      isAdmin={canAddEvents}
                      events={getEventsForDate(allEvents, date)}
                      blocks={blocksOn(week, scheduleDay(date))}
                      change={changeOn(changes, date)}
                      canManageChanges={canChangeDays}
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      lastUpdated={lastUpdated}
                    />
                  </View>
                ))}
              </PagerView>
            )}
          </Animated.View>
        )}
        </Animated.View>
        </View>
      )}
    </FrostedScreen>
  );
}

type TimelineItem =
  | { kind: 'event'; minute: number; event: CalendarEvent }
  | { kind: 'block'; minute: number; block: ScheduleBlock; events: CalendarEvent[] };

// Kept events come back from storage with their dates as text.
function minuteOf(event: CalendarEvent) {
  const start = new Date(event.startDate);
  return start.getHours() * 60 + start.getMinutes();
}

/** A day's classes and events in one run: what is due in a class goes inside its block. */
function dayItems(events: CalendarEvent[], blocks: ScheduleBlock[]): TimelineItem[] {
  const classes = blocks.filter(block => !isBreak(block));
  const inside = new Map<string, CalendarEvent[]>();
  const loose: CalendarEvent[] = [];
  for (const event of events) {
    const minute = minuteOf(event);
    const same = event.subject ? classes.filter(block => sameSubject(block.subject, event.subject)) : [];
    // The block it falls in, or else the first class of that subject that day.
    const block = same.find(item => minutesOf(item.start) <= minute && minute < minutesOf(item.end)) ?? same[0];
    if (block) inside.set(block.id, [...(inside.get(block.id) ?? []), event]);
    else loose.push(event);
  }
  return [
    ...blocks.map(block => ({ kind: 'block' as const, minute: minutesOf(block.start), block, events: inside.get(block.id) ?? [] })),
    ...loose.map(event => ({ kind: 'event' as const, minute: minuteOf(event), event })),
  ].sort((a, b) => a.minute - b.minute || (a.kind === 'event' ? -1 : 1));
}

function DailyTimeline({ isAdmin, events, blocks, change, canManageChanges, refreshing, onRefresh, lastUpdated }: { isAdmin: boolean; events: CalendarEvent[]; blocks: ScheduleBlock[]; change: DayChange | null; canManageChanges: boolean; refreshing: boolean; onRefresh: () => void; lastUpdated: Date | null }) {
  const top = useFrostedInset();
  if (events.length === 0 && blocks.length === 0 && !change) {
    return (
      <ScrollView
        contentContainerStyle={withTopInset([styles.timelineScroll, styles.emptyContainer], top)}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.success} colors={[AppColors.success]} progressViewOffset={top} />}
      >
        <CalendarDaysIcon size={72} color={AppColors.surfaceSoft} style={{ marginBottom: 12 }} />
        <ThemedText style={styles.emptyTitle}>{t('calendar.sinEventos')}</ThemedText>
        <ThemedText style={styles.emptySubtitle}>{t('calendar.noHayEventosProgramadosPara')}</ThemedText>
        <View style={{ height: 120 }} />
      </ScrollView>
    );
  }

  // Recreos of the hours that are lost go away; the lost classes stay, crossed out.
  const items = dayItems(events, blocks.filter(block => !(isBreak(block) && blockFate(block, change) === 'lost')));
  // An early dismissal draws its line before the first thing that starts at that time or later.
  const cut = change?.kind === 'early' && change.endsAt ? minutesOf(change.endsAt) : null;
  const cutIndex = cut === null ? -1 : items.findIndex(item => item.minute >= cut);

  return (
    <ScrollView
      contentContainerStyle={withTopInset(styles.timelineScroll, top)}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.success} colors={[AppColors.success]} progressViewOffset={top} />}
    >
      {!!change && <DayChangeBanner change={change} canManage={canManageChanges} />}
      {items.map((item, index) => (
        <React.Fragment key={item.kind === 'event' ? item.event.id : `block-${item.block.id}`}>
        {index === cutIndex && !!change?.endsAt && <DismissalLine endsAt={change.endsAt} />}
        <View style={[styles.timelineRow, item.kind === 'block' && isBreak(item.block) && styles.timelineRowBreak, item.kind === 'block' && blockFate(item.block, change) === 'lost' && styles.timelineRowLost]}>
          <View style={styles.timeColumn}>
            <View style={[styles.timeBadge, index === 0 && styles.timeBadgeSolid, item.kind === 'block' && (isBreak(item.block) || blockFate(item.block, change) === 'lost') && styles.timeBadgeGhost]}>
              <ThemedText style={[styles.timeText, index === 0 && { color: AppColors.textSecondary }]}>
                {item.kind === 'event' ? formatTime(new Date(item.event.startDate)) : item.block.start}
              </ThemedText>
            </View>
          </View>
          <View style={styles.eventColumn}>
            {item.kind === 'block' ? (
              <BlockCard block={item.block} events={item.events} isAdmin={isAdmin} fate={blockFate(item.block, change)} endsAt={change?.endsAt ?? null} />
            ) : (
              <ClassCard
                id={item.event.id}
                title={item.event.title}
                time={`${formatTime(new Date(item.event.startDate))} - ${formatTime(new Date(item.event.endDate))}`}
                desc={item.event.description}
                isAdmin={isAdmin}
                writer={item.event.writer}
                verified={item.event.verified}
                verifier={item.event.verifier}
                subject={item.event.subject}
                eventType={item.event.eventType}
                outstanding={item.event.outstanding}
                cancelled={item.event.cancelled}
                fullEvent={item.event}
              />
            )}
          </View>
        </View>
        </React.Fragment>
      ))}
      {cutIndex === -1 && !!change?.endsAt && blocks.some(block => blockFate(block, change) === 'cut') && <DismissalLine endsAt={change.endsAt} />}

      <ThemedText style={styles.footerDisclaimer}>
        {t('calendar.valueDeslizaHaciaAbajoPara', { value: lastUpdated ? t('calendar.actualizadoALasTime', { time: formatTime(lastUpdated) }) : '' })}
      </ThemedText>

      {/* Extra bottom padding for BottomBar */}
      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

function dateKeyOf(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** A class of the timetable, with the evaluations and tasks it has that day. */
function BlockCard({ block, events, isAdmin, fate = 'normal', endsAt = null }: { block: ScheduleBlock; events: CalendarEvent[]; isAdmin: boolean; fate?: 'normal' | 'cut' | 'lost'; endsAt?: string | null }) {
  const router = useRouter();
  if (isBreak(block)) {
    if (fate === 'lost') return null;
    return <ThemedText style={styles.breakText}>{t('calendar.subjectHastaLasEnd', { subject: block.subject, end: fate === 'cut' && endsAt ? endsAt : block.end })}</ThemedText>;
  }
  const meta = [
    `${block.start} – ${fate === 'cut' && endsAt ? endsAt : block.end}`,
    fate === 'cut' ? t('calendar.terminaAntes') : fate === 'lost' ? t('calendar.sinClase') : null,
    block.kind === 'hall' ? (block.plan === 'dominio' ? t('common.dominio') : t('common.electivo')) : null,
    block.room || null,
  ].filter(Boolean).join(' · ');
  const hallId = block.hallId;
  return (
    <View style={[styles.blockCard, fate === 'lost' && styles.blockCardLost]}>
      <Pressable
        accessibilityRole={hallId ? 'button' : undefined}
        accessibilityLabel={`${block.subject}, ${meta}`}
        accessibilityHint={hallId ? t('calendar.abreLaClaseEnClasshall') : undefined}
        disabled={!hallId}
        onPress={() => router.push({ pathname: '/classhall/hall', params: { id: hallId } })}
        style={({ pressed }) => [styles.blockHeader, pressed && { opacity: 0.75 }]}
      >
        <View style={styles.blockHeaderText}>
          <ThemedText style={[styles.blockSubject, fate === 'lost' && styles.blockSubjectLost]} numberOfLines={2}>{block.subject}</ThemedText>
          <ThemedText style={styles.blockMeta}>{meta}</ThemedText>
        </View>
        {!!hallId && <CustomIcon name="chevron-right" size={18} color={AppColors.textSecondary} />}
      </Pressable>
      {events.map(event => (
        <Pressable
          key={event.id}
          accessibilityRole="button"
          accessibilityLabel={`${event.eventType ?? 'Evento'}: ${event.title}${event.cancelled ? t('calendar.cancelado') : ''}`}
          accessibilityHint={t('calendar.abreElDetalle')}
          onPress={() => router.push({ pathname: '/event-info', params: { id: event.id, canEdit: isAdmin ? '1' : '0' } })}
          style={({ pressed }) => [styles.blockEvent, event.outstanding && styles.blockEventOutstanding, pressed && { opacity: 0.75 }]}
        >
          <ThemedText style={styles.blockEventType}>{(event.eventType || 'Evento').split(/[.\s]/)[0]}</ThemedText>
          <View style={styles.blockEventText}>
            <ThemedText style={[styles.blockEventTitle, event.cancelled && { textDecorationLine: 'line-through' }]} numberOfLines={2}>{event.title}</ThemedText>
            {!!event.moved && (
              <ThemedText style={styles.blockEventMoved} numberOfLines={1}>
                {event.moved.kind === 'suspended' ? t('calendar.seMovioDesdeElChangedaylabel', { changeDayLabel: changeDayLabel(dateKeyOf(event.moved.from)) }) : t('calendar.seMovioDesdeElChangedaylabel2', { changeDayLabel: changeDayLabel(dateKeyOf(event.moved.from)) })}
              </ThemedText>
            )}
          </View>
          <CustomIcon name="chevron-right" size={16} color={AppColors.textSecondary} />
        </Pressable>
      ))}
    </View>
  );
}

function ClassCard({ id, title, time, desc, isAdmin, writer, verified, verifier, subject, eventType, outstanding, cancelled, fullEvent }: any) {
  const cardColor = cancelled ? '#4A3535' : outstanding ? AppColors.primary : AppColors.surface;
  const router = useRouter();

  // Format event type for display
  const formatType = (type?: string) => {
    if (!type) return null;
    return type.replace(/\./g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  };

  const openDetail = () => {
    router.push({
      pathname: '/event-info',
      params: { id, canEdit: isAdmin ? '1' : '0' },
    });
  };

  const handleEdit = () => {
    router.push({
      pathname: '/create-event',
      params: {
        id: id,
        title: title,
        description: desc,
        startDate: fullEvent.startDate,
        subject: subject,
        type: eventType,
        location: fullEvent.location,
      }
    });
  };

  return (
    <View style={[styles.classCard, { backgroundColor: cardColor, opacity: cancelled ? 0.7 : 1 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${time}`}
        accessibilityHint={t('calendar.abreElDetalleDelEvento')}
        onPress={openDetail}
        style={({ pressed }) => [styles.classCardContent, pressed && { opacity: 0.75 }]}
      >
        <View style={styles.classHeaderRow}>
          <ThemedText style={[styles.classTitle, cancelled && { textDecorationLine: 'line-through' }]} numberOfLines={2}>
            {cancelled ? `⊘ ${title}` : title}
          </ThemedText>
          <CustomIcon name="book" size={20} color={AppColors.textSecondary} />
        </View>
        <ThemedText style={styles.classTime}>{time}</ThemedText>

        {/* Subject & Type chips */}
        {(subject || eventType) && (
          <View style={styles.metaChipsRow}>
            {subject && (
              <View style={styles.metaChip}>
                <ThemedText style={styles.metaChipText}>{subjectName(subject)}</ThemedText>
              </View>
            )}
            {eventType && (
              <View style={[styles.metaChip, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                <ThemedText style={styles.metaChipText}>{formatType(eventType)}</ThemedText>
              </View>
            )}
          </View>
        )}

        <ThemedText style={styles.classDesc}>{desc}</ThemedText>

        {writer && (
          <View style={styles.verifyRow}>
            <CustomIcon name="check-circle" size={18} color={AppColors.success} />
            <View style={styles.verifyTextContainer}>
              <ThemedText style={styles.verifyLabel}>{t('calendar.publicadoPorLaDirectiva')}</ThemedText>
              <ThemedText style={styles.verifyName}>{writer}</ThemedText>
            </View>
          </View>
        )}

        {verified && verifier && (
          <View style={styles.verifyRow}>
            <CustomIcon name="check-circle" size={18} color={AppColors.info} />
            <View style={styles.verifyTextContainer}>
              <ThemedText style={styles.verifyLabel}>{t('common.verificadoPorUnDocente')}</ThemedText>
              <ThemedText style={styles.verifyName}>{verifier}</ThemedText>
            </View>
          </View>
        )}
      </Pressable>
      {isAdmin && (
        <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.editarTitle', { title })} style={({ pressed }) => [styles.bottomStrip, pressed && styles.pressed]} onPress={handleEdit}>
          <ThemedText style={styles.bottomStripText}>{t('calendar.editarInformacion')}</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.textOnLight,
  },
  addButton: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: AppColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 16,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  arrowButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppColors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  headerTitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
  },
  headerLinks: {
    flexDirection: 'row',
    gap: AppSpacing.lg,
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textSecondary,
  },
  todayLink: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.accent,
  },
  daySelectorWrap: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    marginBottom: 20,
  },
  daySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 16,
  },
  dayIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: AppColors.controlActive,
  },
  dayChip: {
    flex: 1,
    maxWidth: 72,
    minHeight: 62,
    paddingVertical: 6,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipToday: {
    borderWidth: 1.5,
    borderColor: AppColors.accent,
  },
  // The sliding indicator draws the selected fill.
  dayChipSelected: {
    backgroundColor: 'transparent',
  },
  dayName: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontFamily: 'DMSans_700Bold',
    marginBottom: 2,
  },
  dayNameSelected: {
    color: AppColors.controlOnActive,
  },
  dayNumber: {
    fontSize: 16,
    color: AppColors.textSecondary,
    fontFamily: 'DMSans_700Bold',
  },
  dayNumberSelected: {
    color: AppColors.controlOnActive,
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: AppColors.accent,
    marginTop: 3,
  },
  pagerView: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  statusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 100,
  },
  statusText: {
    maxWidth: 360,
    marginTop: 8,
    color: AppColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'DMSans_400Regular',
    opacity: 0.72,
    textAlign: 'center',
  },
  statusButton: {
    minWidth: 190,
    marginTop: 20,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: AppColors.textSecondary,
    ...AppType.title3,
    marginTop: 12,
  },
  emptySubtitle: {
    color: AppColors.textSecondary,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    opacity: 0.6,
  },
  timelineScroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineRowBreak: {
    alignItems: 'center',
    opacity: 0.7,
  },
  breakText: {
    color: AppColors.textSecondary,
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
    marginBottom: 6,
  },
  blockCard: {
    gap: 8,
    padding: 16,
    borderRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.surface,
  },
  // A class lost to a suspension or an early dismissal.
  blockCardLost: {
    borderStyle: 'dashed',
    borderColor: AppColors.surfaceMuted,
  },
  blockSubjectLost: {
    color: AppColors.textSecondary,
    fontFamily: 'DMSans_500Medium',
    textDecorationLine: 'line-through',
  },
  timelineRowLost: {
    opacity: 0.7,
  },
  changeDot: {
    width: 6,
    height: 6,
  },
  blockEventText: {
    flex: 1,
    gap: 1,
  },
  blockEventMoved: {
    color: AppColors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'DMSans_500Medium',
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  blockHeaderText: {
    flex: 1,
    gap: 2,
  },
  blockSubject: {
    color: AppColors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'DMSans_700Bold',
  },
  blockMeta: {
    color: AppColors.textSecondary,
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
    fontVariant: ['tabular-nums'],
  },
  blockEvent: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: AppColors.surface,
  },
  blockEventOutstanding: {
    backgroundColor: AppColors.primary,
  },
  blockEventType: {
    color: AppColors.accent,
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
    textTransform: 'uppercase',
  },
  blockEventTitle: {
    flex: 1,
    color: AppColors.textPrimary,
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
  },
  timeColumn: {
    width: 60,
    alignItems: 'center',
    marginRight: 10,
  },
  eventColumn: {
    flex: 1,
  },
  timeBadge: {
    backgroundColor: AppColors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 6,
  },
  timeBadgeSolid: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  timeBadgeGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: AppColors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeText: {
    color: AppColors.textSecondary,
    fontSize: 12,
    opacity: 0.8,
    fontFamily: 'DMSans_700Bold',
  },
  pillCard: {
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderCurve: 'continuous',
  },
  pillText: {
    color: AppColors.textOnLight,
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
  },
  classCard: {
    backgroundColor: AppColors.primary,
    borderRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  classCardContent: {
    padding: 20,
  },
  classHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  classTitle: {
    color: AppColors.textSecondary,
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
    flex: 1,
    marginRight: 10,
  },
  classTime: {
    color: AppColors.textSecondary,
    opacity: 0.7,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginBottom: 8,
  },
  metaChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  metaChip: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  metaChipText: {
    color: AppColors.textSecondary,
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
    opacity: 0.9,
  },
  classDesc: {
    color: AppColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'DMSans_400Regular',
    marginBottom: 12,
    opacity: 0.9,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  verifyTextContainer: {
    flex: 1,
  },
  verifyLabel: {
    color: AppColors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.8,
    fontFamily: 'DMSans_400Regular',
  },
  verifyName: {
    color: AppColors.textSecondary,
    fontSize: 14,
    lineHeight: 16,
    fontFamily: 'DMSans_700Bold',
    marginTop: 1,
  },
  bottomStrip: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomStripText: {
    color: AppColors.textSecondary,
    fontSize: 13,
    fontFamily: 'DMSans_700Bold',
  },
  footerUpdateRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  footerUpdateTextContainer: {
    marginLeft: 8,
  },
  footerUpdateSub: {
    color: AppColors.textSecondary,
    opacity: 0.7,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'DMSans_400Regular',
  },
  footerUpdateName: {
    color: AppColors.textSecondary,
    fontSize: 13,
    lineHeight: 15,
    fontFamily: 'DMSans_700Bold',
  },
  footerDisclaimer: {
    textAlign: 'center',
    color: AppColors.textSecondary,
    opacity: 0.72,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    paddingHorizontal: 16,
    lineHeight: 16,
  }
});
