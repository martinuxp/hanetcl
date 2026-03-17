import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Platform, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import PagerView from '@/components/PagerView';
import {
  fetchCalendarEvents,
  getEventsForDate,
  getWeekDays,
  getMonday,
  formatTime,
  CalendarEvent,
} from '@/services/ical-service';

const { width } = Dimensions.get('window');

export default function CalendarScreen() {
  // Mon=0, Tue=1, ... Sat=5, Sun=6  (getDay: Sun=0,Mon=1,...Sat=6)
  const todayIndex = (new Date().getDay() + 6) % 7;
  const [selectedPageIndex, setSelectedPageIndex] = useState(todayIndex);
  const pagerRef = useRef<PagerView>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekDays = getWeekDays(weekStart);

  // iCal events
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  // Scroll pager to today on first render
  useEffect(() => {
    const timer = setTimeout(() => {
      pagerRef.current?.setPage(todayIndex);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    const events = await fetchCalendarEvents();
    setAllEvents(events);
    setLoading(false);
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
    <View style={styles.container}>
      {/* Dev Toggle */}
      <TouchableOpacity
        style={styles.devToggle}
        onPress={() => setIsAdmin(!isAdmin)}
      >
        <ThemedText style={{ color: 'white', fontSize: 10 }}>Toggle Rol: {isAdmin ? 'Admin' : 'Normal'}</ThemedText>
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.arrowButton} onPress={goToPrevWeek}>
          <CustomIcon name="chevron-left" size={20} color="#E2E1DA" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{currentDayInfo.fullDate}</ThemedText>
        <TouchableOpacity style={styles.arrowButton} onPress={goToNextWeek}>
          <CustomIcon name="chevron-right" size={20} color="#E2E1DA" />
        </TouchableOpacity>
      </View>

      {/* Day Selector */}
      <View style={styles.daySelector}>
        {weekDays.map((day, index) => {
          const isSelected = selectedPageIndex === index;
          const dayEvents = getEventsForDate(allEvents, day.dateObj);
          const hasEvents = dayEvents.length > 0;
          return (
            <TouchableOpacity
              key={index}
              style={[styles.dayChip, isSelected && styles.dayChipSelected]}
              onPress={() => handleDaySelect(index)}
              activeOpacity={0.7}
            >
              <ThemedText style={[styles.dayName, isSelected && styles.dayNameSelected]}>{day.dayName}</ThemedText>
              <ThemedText style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{day.date}</ThemedText>
              {hasEvents && <View style={styles.eventDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Loading */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#93B9A9" />
          <ThemedText style={styles.loadingText}>Cargando eventos...</ThemedText>
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
                  isAdmin={isAdmin}
                  events={getEventsForDate(allEvents, day.dateObj)}
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
                  isAdmin={isAdmin}
                  events={getEventsForDate(allEvents, day.dateObj)}
                />
              </View>
            ))}
          </PagerView>
        )
      )}
    </View>
  );
}

function DailyTimeline({ isAdmin, events }: { isAdmin: boolean; events: CalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={[styles.timelineScroll, styles.emptyContainer]}
        showsVerticalScrollIndicator={false}
      >
        <CustomIcon name="calendar" size={48} color="#CECDC1" />
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
    >
      {events.map((event, index) => (
        <View key={event.id} style={styles.timelineRow}>
          <View style={styles.timeColumn}>
            <View style={[styles.timeBadge, index === 0 && styles.timeBadgeSolid]}>
              <ThemedText style={[styles.timeText, index === 0 && { color: '#E2E1DA' }]}>
                {formatTime(new Date(event.startDate))}
              </ThemedText>
            </View>
          </View>
          <View style={styles.eventColumn}>
            <ClassCard
              title={event.title}
              time={`${formatTime(new Date(event.startDate))} - ${formatTime(new Date(event.endDate))}`}
              desc={event.description}
              isAdmin={isAdmin}
              writer={event.writer}
              verified={event.verified}
              verifier={event.verifier}
              subject={event.subject}
              eventType={event.eventType}
              outstanding={event.outstanding}
              cancelled={event.cancelled}
            />
          </View>
        </View>
      ))}

      <View style={styles.footerUpdateRow}>
        <CustomIcon name="check-circle" size={16} color="#93B9A9" />
        <View style={styles.footerUpdateTextContainer}>
          <ThemedText style={styles.footerUpdateSub}>Sincronizado desde Google Calendar</ThemedText>
          <ThemedText style={styles.footerUpdateName}>Feed iCal - "Info | LCH | 2°k"</ThemedText>
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

function ClassCard({ title, time, desc, isAdmin, writer, verified, verifier, subject, eventType, outstanding, cancelled }: any) {
  const cardColor = cancelled ? '#4A3535' : outstanding ? '#42564F' : '#3E3E3A';

  // Format event type for display
  const formatType = (type?: string) => {
    if (!type) return null;
    return type.replace(/\./g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  };

  return (
    <View style={[styles.classCard, { backgroundColor: cardColor, opacity: cancelled ? 0.7 : 1 }]}>
      <View style={styles.classCardContent}>
        <View style={styles.classHeaderRow}>
          <ThemedText style={[styles.classTitle, cancelled && { textDecorationLine: 'line-through' }]} numberOfLines={2}>
            {cancelled ? `⊘ ${title}` : title}
          </ThemedText>
          <CustomIcon name="book" size={20} color="#E2E1DA" />
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
            <CustomIcon name="check-circle" size={18} color="#34C759" />
            <View style={styles.verifyTextContainer}>
              <ThemedText style={styles.verifyLabel}>Info. escrita por un miembro de la directiva:</ThemedText>
              <ThemedText style={styles.verifyName}>{writer}</ThemedText>
            </View>
          </View>
        )}

        {verified && verifier && (
          <View style={styles.verifyRow}>
            <CustomIcon name="check-circle" size={18} color="#007AFF" />
            <View style={styles.verifyTextContainer}>
              <ThemedText style={styles.verifyLabel}>Info. verificada por un docente:</ThemedText>
              <ThemedText style={styles.verifyName}>{verifier}</ThemedText>
            </View>
          </View>
        )}
      </View>
      {isAdmin && (
        <View style={styles.bottomStrip}>
          <ThemedText style={styles.bottomStripText}>Editar información</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#292927',
  },
  devToggle: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'red',
    padding: 4,
    borderRadius: 4,
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  arrowButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3E3E3A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'DMSans_500Medium',
    color: '#E2E1DA',
  },
  daySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  dayChip: {
    width: 42,
    height: 62,
    borderRadius: 12,
    backgroundColor: '#3E3E3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipSelected: {
    backgroundColor: '#42564F',
  },
  dayName: {
    fontSize: 12,
    color: '#E2E1DA',
    fontFamily: 'DMSans_700Bold',
    marginBottom: 2,
  },
  dayNameSelected: {
    color: '#93B9A9',
  },
  dayNumber: {
    fontSize: 16,
    color: '#E2E1DA',
    fontFamily: 'DMSans_700Bold',
  },
  dayNumberSelected: {
    color: '#E2E1DA',
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FF6A5F',
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
    color: '#E2E1DA',
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: '#E2E1DA',
    fontSize: 20,
    fontFamily: 'DMSans_700Bold',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#E2E1DA',
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    opacity: 0.6,
  },
  timelineScroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
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
    backgroundColor: '#3E3E3A',
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
    borderColor: '#3E3E3A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeText: {
    color: '#E2E1DA',
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
    color: '#292927',
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
  },
  classCard: {
    backgroundColor: '#42564F',
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
    color: '#E2E1DA',
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
    flex: 1,
    marginRight: 10,
  },
  classTime: {
    color: '#E2E1DA',
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
    color: '#E2E1DA',
    fontSize: 11,
    fontFamily: 'DMSans_500Medium',
    opacity: 0.9,
  },
  classDesc: {
    color: '#E2E1DA',
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
    color: '#E2E1DA',
    fontSize: 11,
    lineHeight: 13,
    opacity: 0.8,
    fontFamily: 'DMSans_400Regular',
  },
  verifyName: {
    color: '#E2E1DA',
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
    color: '#E2E1DA',
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
    color: '#E2E1DA',
    opacity: 0.7,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'DMSans_400Regular',
  },
  footerUpdateName: {
    color: '#E2E1DA',
    fontSize: 13,
    lineHeight: 15,
    fontFamily: 'DMSans_700Bold',
  },
  footerDisclaimer: {
    textAlign: 'center',
    color: '#E2E1DA',
    opacity: 0.6,
    fontSize: 10,
    fontFamily: 'DMSans_400Regular',
    paddingHorizontal: 16,
    lineHeight: 14,
  }
});
