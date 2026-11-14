import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { FeaturedEventCard } from '@/components/events/event-ui';
import { OfficialSeal, SpaceAvatar } from '@/components/feed/feed-ui';
import { subjectIcon } from '@/constants/subject-icons';
import { AppColors, AppFlexFonts, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { capitalize, dateLocale, monthsShort, t } from '@/i18n';
import { claimedCourse, getGreetingProfile, useSession } from '@/services/auth-service';
import { anniversaryDay, daysTo, phaseOf } from '@/services/anniversary-service';
import type { AnniversaryState } from '@/services/anniversary-service';
import { restoreCached } from '@/services/cache';
import { eventDay, listEvents } from '@/services/events-service';
import type { EventList, HnEvent } from '@/services/events-service';
import { feedWhen, listFeed } from '@/services/feed-service';
import type { Feed, FeedPost } from '@/services/feed-service';
import { fetchCalendarEvents, restoreCalendarEvents } from '@/services/ical-service';
import type { CalendarEvent } from '@/services/ical-service';
import { classesOn, getCourseSchedule, isBreak, minutesOf, myWeek, nowAndNext, restoreCourseSchedule } from '@/services/schedule-service';
import type { CourseSchedule, ScheduleBlock } from '@/services/schedule-service';

// Home on a wide web window (the side navigation opens every section, so the
// phone's grid is not needed). The institution's photo runs across the top
// with the greeting on it; under it, a row of what needs attention and the
// board: today, what comes, events, the Feed and the tools. Grey surfaces,
// with the pink only where something is now or soon. Everything is real
// data; an empty section says so.

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const DAY = 86_400_000;
const HERO_HEIGHT = 340;
const UPCOMING_LIMIT = 4;
const EVENTS_LIMIT = 3;
const POSTS_LIMIT = 3;

export type HomeInstitution = { name: string; logoUrl: string | null; bannerUrl: string | null };

/** What the phone kept, then the fresh answer, reloaded on every visit. */
function useLive<T>(load: (() => { kept: Promise<T | undefined>; fresh: Promise<T> }) | null) {
  const [value, setValue] = useState<T | null>(null);
  const [loaded, setLoaded] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!load) return;
      let active = true;
      let fresh = false;
      const { kept, fresh: request } = load();
      void kept.then(previous => { if (active && !fresh && previous !== undefined) setValue(previous); }).catch(() => undefined);
      request
        .then(next => { fresh = true; if (active) setValue(next); })
        .catch(() => undefined)
        .finally(() => { if (active) setLoaded(true); });
      return () => { active = false; };
    }, [load])
  );
  return { value, loaded };
}

function daysUntil(date: Date | number, now: Date) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(date).setHours(0, 0, 0, 0) - today.getTime()) / DAY);
}

// The Calendar's event types are stored data, compared as they are saved.
const isEvaluation = (event: CalendarEvent) => !!event.eventType?.toLocaleLowerCase('es').startsWith('evaluaci'); // i18n-ignore
const isTask = (event: CalendarEvent) => event.eventType === 'Tarea'; // i18n-ignore

/** "Hoy", "Mañana" or "5 días", for the numbers of the row on top. */
function countdown(days: number) {
  if (days <= 0) return t('common.hoy2');
  if (days === 1) return t('common.manana');
  return t('components.gridMenu.countDias', { count: days });
}

function whenLabel(days: number) {
  if (days <= 0) return t('common.hoy2');
  if (days === 1) return t('common.manana');
  return t('components.home.desktopHome.enDaysDias', { days });
}

function calendarIcon(event: CalendarEvent): IconName {
  if (isEvaluation(event)) return 'document-text-outline';
  if (isTask(event)) return 'checkbox-outline';
  return 'calendar-outline';
}

/** Hover for the rows and tiles of the board (web). */
type PressState = { pressed: boolean; hovered?: boolean };

/** A card of the board: an icon, a title, a link to its section and what it holds. */
function Panel({ icon, title, action, href, children }: { icon: IconName; title: string; action: string; href: Href; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <View style={styles.panelIcon}><Ionicons name={icon} size={18} color={AppColors.textSecondary} /></View>
        <ThemedText accessibilityRole="header" style={styles.panelTitle}>{title}</ThemedText>
        <Pressable accessibilityRole="link" onPress={() => router.push(href)} style={({ pressed, hovered }: PressState) => [styles.linkPill, hovered && styles.linkPillHovered, pressed && AppPressed]}>
          <ThemedText style={styles.linkText}>{action}</ThemedText>
          <Ionicons name="chevron-forward" size={14} color={AppColors.textSecondary} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <ThemedText style={styles.empty}>{text}</ThemedText>;
}

/** The institution's photo across the top, fading into the page. */
function HeroBackdrop({ bannerUrl, width }: { bannerUrl: string | null; width: number }) {
  return (
    <View pointerEvents="none" style={styles.hero}>
      {bannerUrl && <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />}
      <Svg width={width} height={HERO_HEIGHT} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="home-hero-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={AppColors.canvas} stopOpacity={bannerUrl ? 0.1 : 0} />
            <Stop offset="0.45" stopColor={AppColors.canvas} stopOpacity={bannerUrl ? 0.5 : 0.2} />
            <Stop offset="0.8" stopColor={AppColors.canvas} stopOpacity={0.9} />
            <Stop offset="1" stopColor={AppColors.canvas} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={HERO_HEIGHT} fill="url(#home-hero-fade)" />
      </Svg>
    </View>
  );
}

/** The school's crest, its name with today's date, and the greeting. */
function Greeting({ institution, now }: { institution: HomeInstitution | null; now: Date }) {
  const { user } = useSession();
  const [name, setName] = useState('');
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      getGreetingProfile(user).then(profile => { if (active) setName(profile.firstName); }).catch(() => undefined);
      return () => { active = false; };
    }, [user])
  );
  const hour = now.getHours();
  const hello = hour < 12 ? t('components.home.desktopHome.buenosDias') : hour < 20 ? t('components.home.desktopHome.buenasTardes') : t('components.home.desktopHome.buenasNoches');
  const date = capitalize(now.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' }));
  return (
    <View style={styles.greetingRow}>
      {!!institution?.logoUrl && (
        <View style={styles.crest}><Image source={{ uri: institution.logoUrl }} style={styles.crestImage} contentFit="contain" /></View>
      )}
      <View style={styles.greetingText}>
        <ThemedText style={styles.kicker}>
          {institution ? <ThemedText style={styles.kickerName}>{institution.name}</ThemedText> : null}
          {institution ? ' · ' : ''}{date}
        </ThemedText>
        <ThemedText accessibilityRole="header" numberOfLines={1} style={styles.greeting}>{name ? `${hello}, ${name}` : hello}</ThemedText>
      </View>
    </View>
  );
}

/** Search does not exist yet: the pill says so instead of taking input. */
function SearchSoon() {
  return (
    <View style={styles.search} accessible accessibilityLabel={t('components.topHeader.buscarEnHanetProximamente')} accessibilityState={{ disabled: true }}>
      <Ionicons name="search" size={18} color={AppColors.textSecondary} />
      <ThemedText style={styles.searchText}>{t('components.topHeader.buscarProximamente')}</ThemedText>
    </View>
  );
}

type Stat = { key: string; icon: IconName; value: string; label: string; href: Href; hot?: boolean };

/** The row of what needs attention, each opening its section. */
function StatRow({ stats }: { stats: Stat[] }) {
  const router = useRouter();
  if (!stats.length) return null;
  return (
    <View style={styles.stats}>
      {stats.map(stat => (
        <Pressable key={stat.key} accessibilityRole="link" accessibilityLabel={`${stat.value} ${stat.label}`} onPress={() => router.push(stat.href)} style={({ pressed, hovered }: PressState) => [styles.stat, hovered && styles.statHovered, pressed && AppPressed]}>
          <View style={[styles.statIcon, stat.hot && styles.statIconHot]}>
            <Ionicons name={stat.icon} size={22} color={stat.hot ? AppColors.accent : AppColors.textSecondary} />
          </View>
          <View style={styles.statText}>
            <ThemedText numberOfLines={1} style={[styles.statValue, stat.hot && styles.statValueHot]}>{stat.value}</ThemedText>
            <ThemedText numberOfLines={1} style={styles.statLabel}>{stat.label}</ThemedText>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** Today's timetable: the class going on now in pink, then the rest of the day. */
function TodayPanel({ schedule, loaded, evaluationsToday, now }: { schedule: CourseSchedule | null; loaded: boolean; evaluationsToday: CalendarEvent[]; now: Date }) {
  const router = useRouter();
  const blocks = myWeek(schedule);
  const today = classesOn(blocks, schedule?.changes, now).filter(block => !isBreak(block));
  const { current, next } = nowAndNext(blocks, now, schedule?.changes);
  const minute = now.getHours() * 60 + now.getMinutes();
  const inClass = current && !isBreak(current) ? current : null;
  const shown = inClass ?? next;
  const progress = inClass ? Math.min(1, Math.max(0, (minute - minutesOf(inClass.start)) / Math.max(1, minutesOf(inClass.end) - minutesOf(inClass.start)))) : 0;
  const testToday = (block: ScheduleBlock) => evaluationsToday.some(event => !!event.subject && block.subject.toLocaleLowerCase('es').includes(event.subject.toLocaleLowerCase('es')));

  const open = (block: ScheduleBlock) => {
    if (block.hallId) router.push({ pathname: '/classhall/hall', params: { id: block.hallId } });
    else router.push('/schedule');
  };

  return (
    <Panel icon="time-outline" title={t('common.hoy2')} action={t('common.horario')} href="/schedule">
      {shown && (
        <View style={styles.nowCard}>
          <View style={styles.nowGlow} />
          <View style={styles.nowLabelRow}>
            {inClass && <View style={styles.liveDot} />}
            <ThemedText style={styles.nowLabel}>{inClass ? t('common.ahora') : current ? t('components.home.desktopHome.enRecreoDespues') : t('components.home.desktopHome.loQueSigue')}</ThemedText>
          </View>
          <ThemedText numberOfLines={1} style={styles.nowSubject}>{shown.subject}</ThemedText>
          <View style={styles.nowMetaRow}>
            <View style={styles.nowMeta}>
              <Ionicons name="time-outline" size={15} color={AppColors.textPrimary} />
              <ThemedText style={styles.nowMetaText}>{inClass ? t('components.home.desktopHome.hastaLasEnd', { end: inClass.end }) : t('components.home.desktopHome.aLasStart', { start: shown.start })}</ThemedText>
            </View>
            {!!shown.room && (
              <View style={styles.nowMeta}>
                <Ionicons name="location-outline" size={15} color={AppColors.textPrimary} />
                <ThemedText style={styles.nowMetaText}>{shown.room}</ThemedText>
              </View>
            )}
          </View>
          {inClass && (
            <>
              <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
              {next && (
                <View style={styles.nextRow}>
                  <ThemedText style={styles.nextLabel}>{t('common.despues')}</ThemedText>
                  <View style={styles.nextChip}><ThemedText style={styles.nextChipText}>{`${next.subject} · ${next.start}`}</ThemedText></View>
                </View>
              )}
            </>
          )}
        </View>
      )}
      {today.length > 0 ? (
        <View style={styles.list}>
          {today.filter(block => block !== shown).map(block => {
            const done = minutesOf(block.end) <= minute;
            return (
              <Pressable key={block.id} accessibilityRole="button" onPress={() => open(block)} style={({ pressed, hovered }: PressState) => [styles.row, hovered && styles.rowHovered, pressed && AppPressed, done && styles.rowDone]}>
                <ThemedText style={styles.rowTime}>{block.start}</ThemedText>
                <View style={styles.square}><Ionicons name={subjectIcon(block.subject)} size={18} color={AppColors.textSecondary} /></View>
                <View style={styles.rowText}>
                  <ThemedText numberOfLines={1} style={styles.rowTitle}>{block.subject}</ThemedText>
                  {!!block.room && <ThemedText numberOfLines={1} style={styles.rowMeta}>{block.room}</ThemedText>}
                </View>
                {!done && testToday(block) && <View style={styles.hotTag}><ThemedText style={styles.hotTagText}>{t('services.calendarWidget.prueba')}</ThemedText></View>}
              </Pressable>
            );
          })}
        </View>
      ) : loaded ? (
        <Empty text={schedule?.blocks.length ? t('components.home.desktopHome.hoyNoHayClases') : t('components.home.desktopHome.tuCursoTodaviaNoTiene')} />
      ) : null}
    </Panel>
  );
}

/** The course's next evaluations, tasks and activities, each on its date. */
function UpcomingPanel({ upcoming, loaded, now }: { upcoming: CalendarEvent[]; loaded: boolean; now: Date }) {
  const router = useRouter();
  const months = monthsShort();
  return (
    <Panel icon="calendar-outline" title={t('anniversary.loQueViene')} action="Calendar" href="/calendar">
      {upcoming.length > 0 ? (
        <View style={styles.list}>
          {upcoming.slice(0, UPCOMING_LIMIT).map(event => {
            const days = Math.max(0, daysUntil(event.startDate, now));
            const soon = days <= 1;
            return (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/event-info', params: { id: event.id, canEdit: '0' } })}
                style={({ pressed, hovered }: PressState) => [styles.row, hovered && styles.rowHovered, pressed && AppPressed]}
              >
                <View style={[styles.dateBlock, soon && styles.dateBlockHot]}>
                  <ThemedText style={styles.dateDay}>{event.startDate.getDate()}</ThemedText>
                  <ThemedText style={styles.dateMonth}>{months[event.startDate.getMonth()]}</ThemedText>
                </View>
                <View style={styles.rowText}>
                  <ThemedText numberOfLines={1} style={styles.rowTitle}>{event.title}</ThemedText>
                  <View style={styles.rowMetaLine}>
                    <Ionicons name={calendarIcon(event)} size={13} color={AppColors.textSecondary} />
                    <ThemedText numberOfLines={1} style={styles.rowMeta}>{[event.eventType, event.subject].filter(Boolean).join(' · ')}</ThemedText>
                  </View>
                </View>
                <View style={[styles.whenChip, soon && styles.whenChipHot]}>
                  <ThemedText style={[styles.whenText, soon && styles.whenTextHot]}>{whenLabel(days)}</ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : loaded ? (
        <Empty text={t('components.home.desktopHome.noHayNadaAgendadoPara')} />
      ) : null}
    </Panel>
  );
}

/** The featured event of the city and what comes at the institution. */
function EventsPanel({ promoted, institution, loaded, now }: { promoted: HnEvent | null; institution: HnEvent[]; loaded: boolean; now: number }) {
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const open = (event: HnEvent) => router.push({ pathname: '/event-detail', params: { id: event.id } });
  return (
    <Panel icon="sparkles-outline" title={t('layout.eventos')} action={t('components.anniversary.noticesPreview.verTodos')} href="/events">
      <View onLayout={(event: LayoutChangeEvent) => setWidth(Math.floor(event.nativeEvent.layout.width))}>
        {promoted && width > 0 && <FeaturedEventCard event={promoted} now={now} width={width} onPress={() => open(promoted)} />}
      </View>
      {institution.length > 0 && (
        <View style={styles.list}>
          <ThemedText style={styles.subhead}>{t('components.home.desktopHome.enTuInstitucion')}</ThemedText>
          {institution.slice(0, EVENTS_LIMIT).map(event => (
            <Pressable key={event.id} accessibilityRole="button" onPress={() => open(event)} style={({ pressed, hovered }: PressState) => [styles.row, hovered && styles.rowHovered, pressed && AppPressed]}>
              {event.imageUrl
                ? <Image source={{ uri: event.imageUrl }} style={styles.thumb} contentFit="cover" />
                : <View style={[styles.thumb, styles.thumbEmpty]}><Ionicons name="calendar-outline" size={20} color={AppColors.textSecondary} /></View>}
              <View style={styles.rowText}>
                <ThemedText numberOfLines={1} style={styles.rowTitle}>{event.title}</ThemedText>
                <ThemedText numberOfLines={1} style={styles.rowMeta}>{[eventDay(event.startsAt, now), event.venueName].filter(Boolean).join(' · ')}</ThemedText>
              </View>
              {!!event.signupCount && (
                <View style={styles.whenChip}><ThemedText style={styles.whenText}>{t('components.home.desktopHome.signupcountVan', { signupCount: event.signupCount })}</ThemedText></View>
              )}
            </Pressable>
          ))}
        </View>
      )}
      {!promoted && institution.length === 0 && loaded && <Empty text={t('components.home.desktopHome.noHayEventosProximos')} />}
    </Panel>
  );
}

function PostRow({ post, now }: { post: FeedPost; now: number }) {
  const router = useRouter();
  const poll = post.poll;
  const total = poll?.total ?? 0;
  const reactions = post.reactions.filter(reaction => reaction.count > 0).slice(0, 3);
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/feed')} style={({ pressed, hovered }: PressState) => [styles.post, hovered && styles.rowHovered, pressed && AppPressed]}>
      <View style={styles.postHead}>
        <SpaceAvatar space={post.space} size={34} />
        <View style={styles.rowText}>
          <View style={styles.postName}>
            <ThemedText numberOfLines={1} style={styles.rowTitle}>{post.space.name}</ThemedText>
            {post.space.official && <OfficialSeal size={15} />}
          </View>
          <ThemedText numberOfLines={1} style={styles.rowMeta}>{[feedWhen(post.createdAt, now), post.pinned ? t('components.feed.feedUi.fijado') : null].filter(Boolean).join(' · ')}</ThemedText>
        </View>
      </View>
      {!!post.body && <ThemedText numberOfLines={3} style={styles.postBody}>{post.body}</ThemedText>}
      {poll && (
        <View style={styles.poll}>
          {poll.options.slice(0, 3).map((option, index) => {
            const share = option.count !== null && total > 0 ? option.count / total : null;
            return (
              <View key={option.id} style={styles.pollOption}>
                {share !== null && <View style={[styles.pollFill, index > 0 && styles.pollFillMuted, { width: `${Math.round(share * 100)}%` }]} />}
                <ThemedText numberOfLines={1} style={[styles.pollText, styles.pollLabel]}>{option.text}</ThemedText>
                {share !== null && <ThemedText style={styles.pollText}>{`${Math.round(share * 100)} %`}</ThemedText>}
              </View>
            );
          })}
        </View>
      )}
      {post.images.length > 0 && <Image source={{ uri: post.images[0] }} style={styles.postImage} contentFit="cover" />}
      {reactions.length > 0 && (
        <View style={styles.reactions}>
          {reactions.map(reaction => (
            <View key={reaction.emoji} style={styles.reaction}><ThemedText style={styles.reactionText}>{`${reaction.emoji} ${reaction.count}`}</ThemedText></View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

function FeedPanel({ feed, loaded, now }: { feed: Feed | null; loaded: boolean; now: number }) {
  const posts = (feed?.posts ?? []).slice(0, POSTS_LIMIT);
  return (
    <Panel icon="chatbubble-outline" title={t('layout.feed')} action={t('components.home.desktopHome.verFeed')} href="/feed">
      {posts.length > 0
        ? <View style={styles.posts}>{posts.map((post, index) => (
          <View key={post.id} style={index > 0 && styles.postDivider}><PostRow post={post} now={now} /></View>
        ))}</View>
        : loaded ? <Empty text={t('components.home.desktopHome.todaviaNoHayPublicaciones')} /> : null}
    </Panel>
  );
}

/** Shortcuts to the tools, which work only on this device. */
function ToolsPanel() {
  const router = useRouter();
  const tools: { key: string; icon: IconName; label: string; href: Href }[] = [
    { key: 'scale', icon: 'grid-outline', label: t('tools.scale.escalaDeNotas'), href: '/tools/scale' },
    { key: 'grades', icon: 'calculator-outline', label: t('tools.grades.calculadoraDeNotas'), href: '/tools/grades' },
    { key: 'electividad', icon: 'compass-outline', label: t('tools.electividad.hanetElectividad'), href: '/tools/electividad' },
  ];
  return (
    <Panel icon="hammer-outline" title={t('common.herramientas')} action={t('anniversary.activities.todas')} href="/tools">
      <View style={styles.tools}>
        {tools.map(tool => (
          <Pressable key={tool.key} accessibilityRole="link" onPress={() => router.push(tool.href)} style={({ pressed, hovered }: PressState) => [styles.tool, hovered && styles.toolHovered, pressed && AppPressed]}>
            <View style={styles.toolIcon}><Ionicons name={tool.icon} size={20} color={AppColors.textPrimary} /></View>
            <ThemedText numberOfLines={1} style={styles.toolLabel}>{tool.label}</ThemedText>
            <Ionicons name="chevron-forward" size={16} color={AppColors.textSecondary} />
          </Pressable>
        ))}
      </View>
    </Panel>
  );
}

type Props = {
  institution: HomeInstitution | null;
  /** The city's featured event, which Home already loads for its splash. */
  promoted: HnEvent | null;
  anniversary: AnniversaryState | null | undefined;
};

/** The Home of a wide window: the institution across the top, then the board. */
export function DesktopHome({ institution, promoted, anniversary }: Props) {
  const { user } = useSession();
  const [now] = useState(() => new Date());
  const [width, setWidth] = useState(0);

  const loadSchedule = useCallback(() => ({ kept: restoreCourseSchedule(), fresh: getCourseSchedule() }), []);
  const loadCalendar = useCallback(() => {
    const course = user ? claimedCourse(user) : Promise.resolve(null);
    return {
      kept: course.then(courseId => (courseId ? restoreCalendarEvents(courseId) : undefined)),
      fresh: course.then(courseId => (courseId ? fetchCalendarEvents(courseId) : [])),
    };
  }, [user]);
  const loadInstitutionEvents = useCallback(() => ({ kept: restoreCached<EventList>('events:institution'), fresh: listEvents('institution') }), []);
  const loadCityEvents = useCallback(() => ({ kept: restoreCached<EventList>('events:regional'), fresh: listEvents('regional') }), []);
  const loadFeed = useCallback(() => ({ kept: restoreCached<Feed>('feed'), fresh: listFeed() }), []);

  const schedule = useLive<CourseSchedule>(user ? loadSchedule : null);
  const calendar = useLive<CalendarEvent[]>(user ? loadCalendar : null);
  const institutionEvents = useLive<EventList>(user ? loadInstitutionEvents : null);
  const cityEvents = useLive<EventList>(user ? loadCityEvents : null);
  const feed = useLive<Feed>(user ? loadFeed : null);

  const nowMs = now.getTime();
  const upcoming = (calendar.value ?? []).filter(event => !event.cancelled && event.endDate.getTime() >= nowMs);
  const evaluationsToday = upcoming.filter(event => isEvaluation(event) && daysUntil(event.startDate, now) === 0);
  const nextTest = upcoming.find(isEvaluation);
  const weekTasks = upcoming.filter(event => isTask(event) && daysUntil(event.startDate, now) <= 7);
  const institutionUpcoming = (institutionEvents.value?.events ?? []).filter(event => (event.endsAt ?? event.startsAt) >= nowMs);
  const eventsToday = [...institutionUpcoming, ...(cityEvents.value?.events ?? [])]
    .filter(event => daysUntil(event.startsAt, now) === 0 && (event.endsAt ?? event.startsAt) >= nowMs);
  const classesToday = classesOn(myWeek(schedule.value), schedule.value?.changes, now).filter(block => !isBreak(block));

  // The row on top: only what is known, with the pink for what is near.
  const stats: Stat[] = [];
  if (calendar.loaded || nextTest) {
    const days = nextTest ? Math.max(0, daysUntil(nextTest.startDate, now)) : null;
    stats.push(days === null
      ? { key: 'test', icon: 'document-text-outline', value: t('components.home.desktopHome.sinPruebas'), label: t('components.home.desktopHome.agendadasEnTuCurso'), href: '/calendar' }
      : { key: 'test', icon: 'document-text-outline', value: countdown(days), label: days <= 1 ? t('components.home.desktopHome.esLaProximaPrueba') : t('components.home.desktopHome.paraLaProximaPrueba'), href: '/calendar', hot: days <= 7 });
    stats.push({ key: 'tasks', icon: 'checkbox-outline', value: String(weekTasks.length), label: t('components.home.desktopHome.tareasEstaSemana', { count: weekTasks.length }), href: '/calendar' });
  }
  if (institutionEvents.loaded || cityEvents.loaded) {
    stats.push({ key: 'events', icon: 'ticket-outline', value: String(eventsToday.length), label: t('components.home.desktopHome.eventosHoy', { count: eventsToday.length }), href: '/events' });
  }
  const running = anniversary?.anniversary;
  const phase = running ? phaseOf(running, nowMs) : null;
  if (running && phase === 'before') {
    const days = daysTo(running.startsAt, nowMs);
    stats.push({ key: 'anniversary', icon: 'trophy-outline', value: countdown(days), label: t('components.home.desktopHome.paraElAniversario'), href: '/anniversary' });
  } else if (running && phase === 'during') {
    const { day, total } = anniversaryDay(running, nowMs);
    stats.push({ key: 'anniversary', icon: 'trophy-outline', value: t('components.gridMenu.diaDayDeTotal', { day, total }), label: t('components.home.desktopHome.delAniversario'), href: '/anniversary', hot: true });
  } else if (schedule.loaded) {
    stats.push({ key: 'classes', icon: 'school-outline', value: String(classesToday.length), label: t('components.home.desktopHome.clasesHoy', { count: classesToday.length }), href: '/schedule' });
  }

  // Three columns when there is room, two below that.
  const columns = width >= 1040 ? 3 : 2;
  const today = <TodayPanel schedule={schedule.value} loaded={schedule.loaded} evaluationsToday={evaluationsToday} now={now} />;
  const upcomingPanel = <UpcomingPanel upcoming={upcoming} loaded={calendar.loaded} now={now} />;
  const eventsPanel = <EventsPanel promoted={promoted} institution={institutionUpcoming} loaded={institutionEvents.loaded} now={nowMs} />;
  const feedPanel = <FeedPanel feed={feed.value} loaded={feed.loaded} now={nowMs} />;
  const tools = <ToolsPanel />;

  return (
    <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && <HeroBackdrop bannerUrl={institution?.bannerUrl ?? null} width={width} />}
      <View style={styles.content}>
        <View style={styles.searchRow}><SearchSoon /></View>
        <Greeting institution={institution} now={now} />
        <StatRow stats={stats} />
        {width > 0 && (columns === 3 ? (
          <View style={styles.columns}>
            <View style={[styles.column, styles.columnWide]}>{today}{upcomingPanel}</View>
            <View style={styles.column}>{eventsPanel}{tools}</View>
            <View style={styles.column}>{feedPanel}</View>
          </View>
        ) : (
          <View style={styles.columns}>
            <View style={styles.column}>{today}{upcomingPanel}{tools}</View>
            <View style={styles.column}>{eventsPanel}{feedPanel}</View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT,
    overflow: 'hidden',
  },
  content: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingTop: 24,
    gap: 18,
  },
  searchRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  search: {
    width: 260,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: AppRadii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: 'rgba(40, 40, 41, 0.6)',
  },
  searchText: {
    ...AppType.callout,
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 18,
    marginTop: 64,
    marginBottom: 8,
  },
  crest: {
    width: 76,
    height: 76,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    backgroundColor: AppColors.textPrimary,
    boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.35)',
  },
  crestImage: {
    width: '100%',
    height: '100%',
  },
  greetingText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  kicker: {
    ...AppType.callout,
    color: AppColors.textSecondary,
  },
  kickerName: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  greeting: {
    fontFamily: AppFlexFonts.name,
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: -1.6,
    color: AppColors.textPrimary,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowRadius: 20,
  },
  stats: {
    flexDirection: 'row',
    gap: 14,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  statHovered: {
    backgroundColor: AppColors.surfaceMuted,
  },
  statIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  statIconHot: {
    backgroundColor: 'rgba(239, 34, 116, 0.18)',
  },
  statText: {
    flex: 1,
    minWidth: 0,
  },
  statValue: {
    fontFamily: AppFlexFonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -1,
    color: AppColors.textPrimary,
  },
  statValueHot: {
    color: AppColors.accent,
  },
  statLabel: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 18,
  },
  columnWide: {
    flex: 1.15,
  },
  panel: {
    gap: 14,
    padding: 20,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panelIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  panelTitle: {
    ...AppType.title3,
    flex: 1,
    color: AppColors.textPrimary,
  },
  linkPill: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 13,
    paddingRight: 9,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  linkPillHovered: {
    backgroundColor: AppColors.surfaceRaised,
  },
  linkText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
  },
  nowCard: {
    gap: 2,
    padding: 18,
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: AppColors.accent,
  },
  nowGlow: {
    position: 'absolute',
    right: -30,
    top: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  nowLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.textPrimary,
    boxShadow: '0px 0px 0px 4px rgba(255, 255, 255, 0.3)',
  },
  nowLabel: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: AppColors.textPrimary,
  },
  nowSubject: {
    fontFamily: AppFlexFonts.bold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -1.2,
    marginTop: 4,
    color: AppColors.textPrimary,
  },
  nowMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  nowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  nowMetaText: {
    ...AppType.footnote,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textPrimary,
    opacity: 0.92,
  },
  progress: {
    height: 6,
    marginTop: 14,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: AppColors.textPrimary,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  nextLabel: {
    ...AppType.footnote,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  nextChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: AppRadii.pill,
    backgroundColor: 'rgba(40, 40, 41, 0.2)',
  },
  nextChipText: {
    ...AppType.footnote,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  list: {
    gap: 2,
  },
  subhead: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
    opacity: 0.8,
    marginTop: AppSpacing.xs,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: -10,
    borderRadius: AppRadii.md,
  },
  rowHovered: {
    backgroundColor: AppColors.surfaceMuted,
  },
  rowDone: {
    opacity: 0.4,
  },
  rowTime: {
    width: 44,
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    fontVariant: ['tabular-nums'],
    color: AppColors.textPrimary,
  },
  square: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: AppColors.surfaceMuted,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rowMeta: {
    ...AppType.caption,
    flexShrink: 1,
    color: AppColors.textSecondary,
    opacity: 0.85,
  },
  hotTag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.accent,
  },
  hotTagText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  dateBlock: {
    width: 50,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  dateBlockHot: {
    backgroundColor: AppColors.accent,
  },
  dateDay: {
    fontFamily: AppFlexFonts.bold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -1,
    color: AppColors.textPrimary,
  },
  dateMonth: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'DMSans_700Bold',
    textTransform: 'uppercase',
    color: AppColors.textPrimary,
  },
  whenChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  whenChipHot: {
    backgroundColor: AppColors.accent,
  },
  whenText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
  },
  whenTextHot: {
    color: AppColors.textPrimary,
  },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: AppColors.surfaceMuted,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posts: {
    gap: 4,
  },
  postDivider: {
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  post: {
    gap: 8,
    padding: 10,
    marginHorizontal: -10,
    borderRadius: AppRadii.md,
  },
  postHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  postName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postBody: {
    ...AppType.footnote,
    lineHeight: 19,
    color: AppColors.textSecondary,
  },
  postImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: AppRadii.md,
    backgroundColor: AppColors.surfaceMuted,
  },
  poll: {
    gap: 6,
  },
  pollOption: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: AppRadii.pill,
    overflow: 'hidden',
    backgroundColor: AppColors.surfaceMuted,
  },
  pollFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(239, 34, 116, 0.55)',
  },
  pollFillMuted: {
    backgroundColor: 'rgba(199, 198, 207, 0.25)',
  },
  pollText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  pollLabel: {
    flex: 1,
  },
  reactions: {
    flexDirection: 'row',
    gap: 6,
  },
  reaction: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  reactionText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  tools: {
    gap: 8,
  },
  tool: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  toolIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  toolHovered: {
    backgroundColor: AppColors.surfaceRaised,
  },
  toolLabel: {
    ...AppType.callout,
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  empty: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
});
