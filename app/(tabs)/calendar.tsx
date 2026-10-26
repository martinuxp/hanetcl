import { AppColors, AppSpacing, AppType } from '@/constants/design-tokens';
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Platform, RefreshControl, useWindowDimensions, type ScrollViewInstance, type ViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { CalendarDaysIcon } from '@/assets/animated-icons/calendar';
import { useFocusEffect, useRouter } from 'expo-router';
import PagerView from '@/components/PagerView';
import { CalendarDaySkeleton } from '@/components/skeletons';
import Animated, { Easing, FadeIn, FadeInLeft, FadeInRight, FadeOut, Keyframe, SlideInLeft, SlideInRight, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { SPRING_MOMENTUM, SPRING_SMOOTH, project } from '@/constants/motion';
import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { MONTH_NAMES, MonthView, YearView } from '@/components/calendar/MonthYearViews';
import type { ScreenPoint } from '@/components/calendar/MonthYearViews';
import {
  fetchCalendarEvents,
  restoreCalendarEvents,
  getEventsForDate,
  getWeekDays,
  getMonday,
  formatTime,
  CalendarEvent,
} from '@/services/ical-service';
import { EVENT_EDITOR_ROLES, ensureClaims, useRole, useSession } from '@/services/auth-service';
import { sameSubject, subjectName } from '@/constants/subjects';
import { useCached } from '@/services/cache';
import { blocksOn, getCourseSchedule, isBreak, minutesOf, myWeek, scheduleDay } from '@/services/schedule-service';
import type { CourseSchedule, ScheduleBlock } from '@/services/schedule-service';
import { db } from '@/services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { HanetButton } from '@/components/ui/hanet-button';


type Frame = { x: number; width: number };

type CalendarView = 'week' | 'month' | 'year';

// Moving between levels reads as a camera move anchored on what was tapped:
// zooming out (week → month → year) everything shrinks a little, the old
// level away and the new one into place; zooming in everything grows.
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

export default function CalendarScreen() {
  // Mon=0, Tue=1, ... Sat=5, Sun=6  (getDay: Sun=0,Mon=1,...Sat=6)
  const todayIndex = (new Date().getDay() + 6) % 7;
  const [selectedPageIndex, setSelectedPageIndex] = useState(todayIndex);
  const pagerRef = useRef<PagerView>(null);
  // Web has no PagerView; the day pages live in a horizontal ScrollView.
  const webPagerRef = useRef<ScrollViewInstance>(null);
  const { user, initializing } = useSession();
  const router = useRouter();
  const { width } = useWindowDimensions();
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

  // Zoom levels: week (the day pages), month and year.
  const [view, setView] = useState<CalendarView>('week');
  // `origin` is the tapped point inside the body, where the zoom is anchored.
  const [zoom, setZoom] = useState<{ direction: 'in' | 'out'; origin: [number, number] } | null>(null);
  const zoomMotion = !zoom ? undefined : reduceMotion ? CROSSFADE : zoom.direction === 'out' ? ZOOM_OUT : ZOOM_IN;
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
        ? (monthSlide.direction > 0 ? SlideInRight : SlideInLeft).duration(240).easing(Easing.out(Easing.cubic))
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
    const t = day - Math.floor(day);
    indicatorX.set(from.x + (to.x - from.x) * t);
    indicatorWidth.set(from.width + (to.width - from.width) * t);
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

  const loadEvents = useCallback(async (silent = false) => {
    if (initializing) return;
    if (!user) {
      setAllEvents([]);
      setLoadError('Inicia sesión para ver el calendario de tu curso.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      // The claims sync starts with the profile read instead of after it.
      const claims = ensureClaims(user);
      claims.catch(() => undefined);
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
        setLoadError('Tu HaNet ID todavía no está vinculado a un curso.');
      }
    } catch (e) {
      console.error(e);
      // A failed background refresh keeps what is already on screen.
      if (!silent || !hasEventsRef.current) {
        setLoadError((e as { code?: string }).code === 'permission-denied'
          ? 'Tu cuenta no tiene permiso para ver el calendario de este curso.'
          : 'No pudimos cargar el calendario. Revisa tu conexión e inténtalo de nuevo.');
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
  const zoomTo = (next: CalendarView, direction: 'in' | 'out', from?: ScreenPoint) => {
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

  // A day picked in the month opens its week with that day selected.
  const pickDay = (date: Date, from: ScreenPoint) => {
    const monday = getMonday(date);
    setWeekChange({ direction: monday > weekStart ? 1 : -1, row: false, pages: false });
    setWeekStart(monday);
    setSelectedPageIndex((date.getDay() + 6) % 7);
    zoomTo('week', 'in', from);
  };

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
  const finishSwipe = (delta: 1 | -1) => shiftMonth(delta, true);
  // The carrier returns to rest only once the new month is mounted, so the
  // old one never flashes back for a frame.
  useLayoutEffect(() => {
    swipeX.set(0);
  }, [swipeX, visibleMonth]);
  // Grabbed while settling back, the page carries on from where it is on
  // screen; once a change of month is under way it finishes first.
  const swipeFrom = useSharedValue(0);
  const swipeCommitted = useSharedValue(false);
  useLayoutEffect(() => {
    swipeCommitted.set(false);
  }, [swipeCommitted, visibleMonth]);
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
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isTodaySelected = isSameDay(currentDayInfo.dateObj, today);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      {view === 'week' ? (
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Semana anterior" style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]} onPress={goToPrevWeek}>
            <CustomIcon name="chevron-left" size={20} color={AppColors.textSecondary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${currentDayInfo.fullDate}. Ver el mes`}
              hitSlop={6}
              onPress={event => openMonth(pointOf(event))}
              style={({ pressed }) => [styles.headerTitleButton, pressed && styles.pressed]}
            >
              <ThemedText accessibilityRole="header" style={styles.headerTitle}>{currentDayInfo.fullDate}</ThemedText>
              <CustomIcon name="calendar" size={16} color={AppColors.textSecondary} />
            </Pressable>
            <View style={styles.headerLinks}>
              {!isTodaySelected && (
                <Pressable accessibilityRole="button" accessibilityLabel="Volver a hoy" hitSlop={10} onPress={goToToday} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText style={styles.todayLink}>Volver a hoy</ThemedText>
                </Pressable>
              )}
              {!!user && (
                <Pressable accessibilityRole="button" accessibilityLabel="Ver el horario del curso" hitSlop={10} onPress={() => router.push('/schedule')} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText style={styles.todayLink}>Horario</ThemedText>
                </Pressable>
              )}
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Semana siguiente" style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]} onPress={goToNextWeek}>
            <CustomIcon name="chevron-right" size={20} color={AppColors.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={view === 'year' ? 'Año anterior' : 'Mes anterior'}
            style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}
            onPress={() => shiftMonth(-1)}
          >
            <CustomIcon name="chevron-left" size={20} color={AppColors.textSecondary} />
          </Pressable>
          <View style={styles.headerCenter}>
            {view === 'month' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${MONTH_NAMES[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}. Ver el año`}
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
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={event => zoomTo(view === 'year' ? 'month' : 'week', 'in', pointOf(event))}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <ThemedText style={styles.todayLink}>{view === 'year' ? 'Ver mes' : 'Ver semana'}</ThemedText>
              </Pressable>
              {(visibleMonth.getFullYear() !== today.getFullYear() || (view === 'month' && visibleMonth.getMonth() !== today.getMonth())) && (
                <Pressable accessibilityRole="button" hitSlop={10} onPress={goToThisMonth} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText style={styles.todayLink}>{view === 'year' ? 'Este año' : 'Este mes'}</ThemedText>
                </Pressable>
              )}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={view === 'year' ? 'Año siguiente' : 'Mes siguiente'}
            style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}
            onPress={() => shiftMonth(1)}
          >
            <CustomIcon name="chevron-right" size={20} color={AppColors.textSecondary} />
          </Pressable>
        </View>
      )}

      <View ref={bodyRef} onLayout={measureBody} style={styles.body}>
      <Animated.View
        key={view}
        entering={zoomMotion?.enter}
        exiting={zoomMotion?.exit}
        style={[styles.body, zoom && { transformOrigin: [zoom.origin[0], zoom.origin[1], 0] }]}
      >
      {/* Day Selector */}
      {view === 'week' && (
      <View style={styles.daySelectorWrap}>
      <Animated.View pointerEvents="none" style={[styles.dayIndicator, indicatorStyle]} />
      <Animated.View key={weekKey} entering={weekEntering} style={styles.daySelector}>
        {weekDays.map((day, index) => {
          const isSelected = selectedPageIndex === index;
          const dayEvents = getEventsForDate(allEvents, day.dateObj);
          const hasEvents = dayEvents.length > 0;
          const isToday = isSameDay(day.dateObj, today);
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`${day.dayName} ${day.date}${isToday ? ', hoy' : ''}${hasEvents ? ', con eventos' : ''}`}
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => [styles.dayChip, isToday && styles.dayChipToday, isSelected && styles.dayChipSelected, pressed && styles.pressed]}
              onLayout={event => recordChipFrame(index, { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width })}
              onPress={() => handleDaySelect(index)}
            >
              <ThemedText style={[styles.dayName, isSelected && styles.dayNameSelected]}>{day.dayName}</ThemedText>
              <ThemedText style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{day.date}</ThemedText>
              {hasEvents && <View style={styles.eventDot} />}
            </Pressable>
          );
        })}
      </Animated.View>
      </View>
      )}

      {/* Loading */}
      {loading || initializing ? (
        <View style={styles.loadingContainer}>
          <CalendarDaySkeleton />
        </View>
      ) : loadError ? (
        <View accessibilityLiveRegion="polite" style={styles.statusContainer}>
          <CalendarDaysIcon size={64} color={AppColors.surfaceSoft} />
          <ThemedText style={styles.emptyTitle}>Calendario no disponible</ThemedText>
          <ThemedText style={styles.statusText}>{loadError}</ThemedText>
          <HanetButton
            label={user ? 'Intentar de nuevo' : 'Iniciar sesión'}
            onPress={() => user ? void loadEvents() : router.push('/auth')}
            style={styles.statusButton}
          />
        </View>
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

    </SafeAreaView>
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

function DailyTimeline({ isAdmin, events, blocks, refreshing, onRefresh, lastUpdated }: { isAdmin: boolean; events: CalendarEvent[]; blocks: ScheduleBlock[]; refreshing: boolean; onRefresh: () => void; lastUpdated: Date | null }) {
  if (events.length === 0 && blocks.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={[styles.timelineScroll, styles.emptyContainer]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.success} colors={[AppColors.success]} />}
      >
        <CalendarDaysIcon size={72} color={AppColors.surfaceSoft} style={{ marginBottom: 12 }} />
        <ThemedText style={styles.emptyTitle}>Sin eventos</ThemedText>
        <ThemedText style={styles.emptySubtitle}>No hay eventos programados para este día.</ThemedText>
        <View style={{ height: 120 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.timelineScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.success} colors={[AppColors.success]} />}
    >
      {dayItems(events, blocks).map((item, index) => (
        <View key={item.kind === 'event' ? item.event.id : `block-${item.block.id}`} style={[styles.timelineRow, item.kind === 'block' && isBreak(item.block) && styles.timelineRowBreak]}>
          <View style={styles.timeColumn}>
            <View style={[styles.timeBadge, index === 0 && styles.timeBadgeSolid, item.kind === 'block' && isBreak(item.block) && styles.timeBadgeGhost]}>
              <ThemedText style={[styles.timeText, index === 0 && { color: AppColors.textSecondary }]}>
                {item.kind === 'event' ? formatTime(new Date(item.event.startDate)) : item.block.start}
              </ThemedText>
            </View>
          </View>
          <View style={styles.eventColumn}>
            {item.kind === 'block' ? (
              <BlockCard block={item.block} events={item.events} isAdmin={isAdmin} />
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
      ))}

      <ThemedText style={styles.footerDisclaimer}>
        {lastUpdated ? `Actualizado a las ${formatTime(lastUpdated)}. ` : ''}Desliza hacia abajo para actualizar.
      </ThemedText>

      {/* Extra bottom padding for BottomBar */}
      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

/** A class of the timetable, with the evaluations and tasks it has that day. */
function BlockCard({ block, events, isAdmin }: { block: ScheduleBlock; events: CalendarEvent[]; isAdmin: boolean }) {
  const router = useRouter();
  if (isBreak(block)) {
    return <ThemedText style={styles.breakText}>{block.subject} · hasta las {block.end}</ThemedText>;
  }
  const meta = [`${block.start} – ${block.end}`, block.kind === 'hall' ? (block.plan === 'dominio' ? 'Dominio' : 'Electivo') : null, block.room || null].filter(Boolean).join(' · ');
  const hallId = block.hallId;
  return (
    <View style={styles.blockCard}>
      <Pressable
        accessibilityRole={hallId ? 'button' : undefined}
        accessibilityLabel={`${block.subject}, ${meta}`}
        accessibilityHint={hallId ? 'Abre la clase en ClassHall' : undefined}
        disabled={!hallId}
        onPress={() => router.push({ pathname: '/classhall/hall', params: { id: hallId } })}
        style={({ pressed }) => [styles.blockHeader, pressed && { opacity: 0.75 }]}
      >
        <View style={styles.blockHeaderText}>
          <ThemedText style={styles.blockSubject} numberOfLines={2}>{block.subject}</ThemedText>
          <ThemedText style={styles.blockMeta}>{meta}</ThemedText>
        </View>
        {!!hallId && <CustomIcon name="chevron-right" size={18} color={AppColors.textSecondary} />}
      </Pressable>
      {events.map(event => (
        <Pressable
          key={event.id}
          accessibilityRole="button"
          accessibilityLabel={`${event.eventType ?? 'Evento'}: ${event.title}${event.cancelled ? ', cancelado' : ''}`}
          accessibilityHint="Abre el detalle"
          onPress={() => router.push({ pathname: '/event-info', params: { id: event.id, canEdit: isAdmin ? '1' : '0' } })}
          style={({ pressed }) => [styles.blockEvent, event.outstanding && styles.blockEventOutstanding, pressed && { opacity: 0.75 }]}
        >
          <ThemedText style={styles.blockEventType}>{(event.eventType || 'Evento').split(/[.\s]/)[0]}</ThemedText>
          <ThemedText style={[styles.blockEventTitle, event.cancelled && { textDecorationLine: 'line-through' }]} numberOfLines={2}>{event.title}</ThemedText>
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
        accessibilityHint="Abre el detalle del evento"
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
              <ThemedText style={styles.verifyLabel}>Info. escrita por un miembro de la directiva:</ThemedText>
              <ThemedText style={styles.verifyName}>{writer}</ThemedText>
            </View>
          </View>
        )}

        {verified && verifier && (
          <View style={styles.verifyRow}>
            <CustomIcon name="check-circle" size={18} color={AppColors.info} />
            <View style={styles.verifyTextContainer}>
              <ThemedText style={styles.verifyLabel}>Info. verificada por un docente:</ThemedText>
              <ThemedText style={styles.verifyName}>{verifier}</ThemedText>
            </View>
          </View>
        )}
      </Pressable>
      {isAdmin && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${title}`} style={({ pressed }) => [styles.bottomStrip, pressed && styles.pressed]} onPress={handleEdit}>
          <ThemedText style={styles.bottomStripText}>Editar información</ThemedText>
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
