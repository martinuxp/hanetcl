import { AppColors } from '@/constants/design-tokens';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Platform, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { CalendarDaysIcon } from '@/assets/animated-icons/calendar';
import { useFocusEffect, useRouter } from 'expo-router';
import PagerView from '@/components/PagerView';
import {
  fetchCalendarEvents,
  getEventsForDate,
  getWeekDays,
  getMonday,
  formatTime,
  CalendarEvent,
} from '@/services/ical-service';
import { useSession } from '@/services/auth-service';
import { db } from '@/services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { HanetButton } from '@/components/ui/hanet-button';

export default function CalendarScreen() {
  // Mon=0, Tue=1, ... Sat=5, Sun=6  (getDay: Sun=0,Mon=1,...Sat=6)
  const todayIndex = (new Date().getDay() + 6) % 7;
  const [selectedPageIndex, setSelectedPageIndex] = useState(todayIndex);
  const pagerRef = useRef<PagerView>(null);
  const { user, initializing } = useSession();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const allowedRoles = ['HNT', 'Admin', 'CEE', 'Directiva'];
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const role = userDoc.data()?.role || 'Estudiante';
          setUserRole(role);
        } catch (e) {
          console.error("Error fetching role:", e);
        }
      }
    };
    fetchRole();
  }, [user]);

  const canAddEvents = userRole ? allowedRoles.includes(userRole) : false;

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekDays = getWeekDays(weekStart);

  // iCal events
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const courseId = userDoc.data()?.courseId;
      if (courseId) {
        const events = await fetchCalendarEvents(courseId);
        setAllEvents(events);
      } else {
        setAllEvents([]);
        setLoadError('Tu HaNet ID todavía no está vinculado a un curso.');
      }
    } catch (e) {
      console.error(e);
      setLoadError('No pudimos actualizar el calendario. Revisa tu conexión e inténtalo de nuevo.');
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
    pagerRef.current?.setPage(index);
  };

  const handlePageSelected = (e: any) => {
    setSelectedPageIndex(e.nativeEvent.position);
  };

  const goToPrevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(prev);
    setSelectedPageIndex(0);
  };

  const goToNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
    setSelectedPageIndex(0);
  };

  const currentDayInfo = weekDays[selectedPageIndex];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Semana anterior" style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]} onPress={goToPrevWeek}>
          <CustomIcon name="chevron-left" size={20} color={AppColors.textSecondary} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{currentDayInfo.fullDate}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Semana siguiente" style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]} onPress={goToNextWeek}>
          <CustomIcon name="chevron-right" size={20} color={AppColors.textSecondary} />
        </Pressable>
      </View>

      {/* Day Selector */}
      <View style={styles.daySelector}>
        {weekDays.map((day, index) => {
          const isSelected = selectedPageIndex === index;
          const dayEvents = getEventsForDate(allEvents, day.dateObj);
          const hasEvents = dayEvents.length > 0;
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`${day.dayName} ${day.date}${hasEvents ? ', con eventos' : ''}`}
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => [styles.dayChip, isSelected && styles.dayChipSelected, pressed && styles.pressed]}
              onPress={() => handleDaySelect(index)}
            >
              <ThemedText style={[styles.dayName, isSelected && styles.dayNameSelected]}>{day.dayName}</ThemedText>
              <ThemedText style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{day.date}</ThemedText>
              {hasEvents && <View style={styles.eventDot} />}
            </Pressable>
          );
        })}
      </View>

      {/* Loading */}
      {loading || initializing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={AppColors.success} />
          <ThemedText accessibilityLiveRegion="polite" style={styles.loadingText}>Cargando eventos…</ThemedText>
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
      ) : (
        /* Pages Swipe View */
        Platform.OS === 'web' ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.pagerView}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / width);
              setSelectedPageIndex(index);
            }}
          >
            {weekDays.map((day, index) => (
              <View key={`${weekStart.toISOString()}-${index}`} style={[styles.page, { width }]}>
                <DailyTimeline
                  isAdmin={canAddEvents}
                  events={getEventsForDate(allEvents, day.dateObj)}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                />
              </View>
            ))}
          </ScrollView>
        ) : (
          <PagerView
            style={styles.pagerView}
            initialPage={todayIndex}
            ref={pagerRef}
            onPageSelected={handlePageSelected}
          >
            {weekDays.map((day, index) => (
              <View key={`${weekStart.toISOString()}-${index}`} style={styles.page}>
                <DailyTimeline
                isAdmin={canAddEvents}
                  events={getEventsForDate(allEvents, day.dateObj)}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                />
              </View>
            ))}
          </PagerView>
        )
      )}

    </SafeAreaView>
  );
}

function DailyTimeline({ isAdmin, events, refreshing, onRefresh }: { isAdmin: boolean; events: CalendarEvent[], refreshing: boolean, onRefresh: () => void }) {
  if (events.length === 0) {
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
      {events.map((event, index) => (
        <View key={event.id} style={styles.timelineRow}>
          <View style={styles.timeColumn}>
            <View style={[styles.timeBadge, index === 0 && styles.timeBadgeSolid]}>
              <ThemedText style={[styles.timeText, index === 0 && { color: AppColors.textSecondary }]}>
                {formatTime(new Date(event.startDate))}
              </ThemedText>
            </View>
          </View>
          <View style={styles.eventColumn}>
            <ClassCard
              id={event.id}
              title={event.title}
              time={`${formatTime(new Date(event.startDate))} - ${formatTime(new Date(event.endDate))}`}
              desc={event.description}
              isAdmin={isAdmin} // Now correctly receiving isAdmin which includes canAddEvents
              writer={event.writer}
              verified={event.verified}
              verifier={event.verifier}
              subject={event.subject}
              eventType={event.eventType}
              outstanding={event.outstanding}
              cancelled={event.cancelled}
              fullEvent={event}
            />
          </View>
        </View>
      ))}

      <View style={styles.footerUpdateRow}>
        <CustomIcon name="check-circle" size={16} color={AppColors.success} />
        <View style={styles.footerUpdateTextContainer}>
          <ThemedText style={styles.footerUpdateSub}>Sincronizado desde la fuente nativa</ThemedText>
          <ThemedText style={styles.footerUpdateName}>HaNet Calendar v1.0.0</ThemedText>
        </View>
      </View>
      <ThemedText style={styles.footerDisclaimer}>
        Los eventos se sincronizan automáticamente desde el calendario compartido del curso.
      </ThemedText>

      {/* Extra bottom padding for BottomBar */}
      <View style={{ height: 120 }} />
    </ScrollView>
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
        location: fullEvent.location || 'Sala 304-B (P3)',
      }
    });
  };

  return (
    <View style={[styles.classCard, { backgroundColor: cardColor, opacity: cancelled ? 0.7 : 1 }]}>
      <View style={styles.classCardContent}>
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
                <ThemedText style={styles.metaChipText}>{subject}</ThemedText>
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
      </View>
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textSecondary,
  },
  daySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 20,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  dayChip: {
    minWidth: 44,
    flex: 1,
    maxWidth: 54,
    height: 62,
    borderRadius: 12,
    backgroundColor: AppColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipSelected: {
    backgroundColor: AppColors.controlActive,
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
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: AppColors.textSecondary,
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
    opacity: 0.7,
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
    fontSize: 20,
    fontFamily: 'DMSans_700Bold',
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
    fontSize: 11,
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
    fontSize: 11,
    lineHeight: 13,
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
    opacity: 0.6,
    fontSize: 10,
    fontFamily: 'DMSans_400Regular',
    paddingHorizontal: 16,
    lineHeight: 14,
  }
});
