import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { daysUntil } from '@/components/classhall/hall-ui';
import { AppColors, AppPressed, AppRadii, AppType } from '@/constants/design-tokens';
import { subjectIcon } from '@/constants/subject-icons';
import { monthsShort, t } from '@/i18n';
import { claimedCourse, useSession } from '@/services/auth-service';
import { hallThemeImage } from '@/services/classhall-service';
import type { Hall } from '@/services/classhall-service';
import { fetchCalendarEvents, restoreCalendarEvents } from '@/services/ical-service';
import type { CalendarEvent } from '@/services/ical-service';
import { blocksOn, minutesOf, scheduleDay } from '@/services/schedule-service';
import type { ScheduleBlock } from '@/services/schedule-service';

// Mis clases on a wide (web) window: a grid of Hall cards and, beside it,
// what the week holds across every Hall. Grey surfaces, with the pink only
// for a class going on now and an evaluation that is near.

type PressState = { pressed: boolean; hovered?: boolean };

const WEEK_DAYS = 7;
const WEEK_LIMIT = 6;

/** Whether one of the class's blocks is going on right now. */
export function isNow(blocks: Pick<ScheduleBlock, 'day' | 'start' | 'end'>[], now = new Date()) {
  const minute = now.getHours() * 60 + now.getMinutes();
  return blocksOn(blocks as ScheduleBlock[], scheduleDay(now)).some(block => minutesOf(block.start) <= minute && minute < minutesOf(block.end));
}

function whenLabel(days: number) {
  if (days <= 0) return t('common.hoy2');
  if (days === 1) return t('common.manana');
  return t('classhall.hall.enCountDias', { count: days });
}

/** A Hall in the grid: its theme on top with the subject's icon, then who teaches it and when it meets. */
export function WideHallCard({ hall, next, now, onOpen }: { hall: Hall; next: string | null; now: boolean; onOpen: () => void }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const evaluationSoon = !hall.isTeacher && !!hall.nextEvaluation && daysUntil(hall.nextEvaluation.date) <= 7 ? hall.nextEvaluation : null;
  const evaluationDays = evaluationSoon ? daysUntil(evaluationSoon.date) : 0;

  // The card and the code's copy button are siblings: a button can't hold another one.
  return (
    <View style={[styles.card, hovered && styles.cardHovered]}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${hall.subject}, ${hall.courseId}, ${hall.teacherName}`}
      accessibilityHint={t('classhall.abreElHall')}
      onPress={onOpen}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => pressed && AppPressed}
    >
      <View style={styles.banner}>
        <Image source={hallThemeImage(hall.theme)} style={StyleSheet.absoluteFill} contentFit="cover" />
        {now && (
          <View style={styles.nowChip}>
            <View style={styles.liveDot} />
            <ThemedText style={styles.nowText}>{t('common.ahora')}</ThemedText>
          </View>
        )}
        <View style={styles.icon}><Ionicons name={subjectIcon(hall.subject)} size={22} color={AppColors.textOnLight} /></View>
      </View>
      <View style={styles.body}>
        <ThemedText numberOfLines={1} style={styles.subject}>{hall.subject}</ThemedText>
        <ThemedText numberOfLines={1} style={styles.teacher}>{hall.teacherName}</ThemedText>
        <View style={styles.chips}>
          {!!next && (
            <View style={styles.chip}>
              <Ionicons name="time-outline" size={13} color={AppColors.textSecondary} />
              <ThemedText numberOfLines={1} style={styles.chipText}>{next}</ThemedText>
            </View>
          )}
          {hall.isTeacher && hall.memberCount !== null && (
            <View style={styles.chip}>
              <Ionicons name="people-outline" size={13} color={AppColors.textSecondary} />
              <ThemedText style={styles.chipText}>{t('classhall.hall.countEstudiantes', { count: hall.memberCount })}</ThemedText>
            </View>
          )}
        </View>
      </View>
      {evaluationSoon && (
        <View style={styles.alert}>
          <Ionicons name="document-text-outline" size={15} color={AppColors.errorText} />
          <ThemedText numberOfLines={1} style={styles.alertText}>{`${evaluationSoon.title} · ${whenLabel(evaluationDays)}`}</ThemedText>
        </View>
      )}
    </Pressable>
      {hall.isTeacher && hall.plan !== 'comun' && !!hall.code && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('classhall.copiarElCodigoDelHall', { join: hall.code.split('').join(' ') })}
          onPress={async () => { await Clipboard.setStringAsync(hall.code ?? ''); setCopied(true); }}
          style={({ pressed, hovered }: PressState) => [styles.code, hovered && styles.codeHovered, pressed && AppPressed]}
        >
          <ThemedText style={styles.codeLabel}>{t('classhall.codigo')}</ThemedText>
          <ThemedText style={styles.codeValue}>{hall.code}</ThemedText>
          <ThemedText style={styles.codeAction}>{copied ? t('common.copiado') : t('classhall.copiar')}</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

type WeekItem = { key: string; title: string; meta: string; date: number; open: () => void };

/**
 * The week across every Hall: the course's evaluations and tasks from its
 * Calendar, or, without a course (a teacher), each Hall's next evaluation.
 */
export function WeekPanel({ halls }: { halls: Hall[] }) {
  const router = useRouter();
  const { user } = useSession();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const months = monthsShort();

  useFocusEffect(useCallback(() => {
    if (!user) return;
    let active = true;
    claimedCourse(user)
      .then(async courseId => {
        if (!courseId) return [];
        const kept = await restoreCalendarEvents(courseId);
        if (active && kept) setEvents(current => current ?? kept);
        return fetchCalendarEvents(courseId);
      })
      .then(fresh => { if (active) setEvents(fresh); })
      .catch(() => { if (active) setEvents(current => current ?? []); });
    return () => { active = false; };
  }, [user]));

  const fromCalendar: WeekItem[] = (events ?? [])
    .filter(event => !event.cancelled && (event.hallId || event.eventType === 'Tarea' || event.eventType?.toLocaleLowerCase('es').startsWith('evaluaci'))) // i18n-ignore
    .filter(event => { const days = daysUntil(event.startDate.getTime()); return days >= 0 && days <= WEEK_DAYS; })
    .map(event => ({
      key: event.id,
      title: event.title,
      meta: [event.subject, event.eventType].filter(Boolean).join(' · '),
      date: event.startDate.getTime(),
      open: () => router.push({ pathname: '/event-info', params: { id: event.id, canEdit: '0' } }),
    }));
  const fromHalls: WeekItem[] = halls
    .filter(hall => hall.nextEvaluation && daysUntil(hall.nextEvaluation.date) <= WEEK_DAYS)
    .map(hall => ({
      key: hall.id,
      title: hall.nextEvaluation?.title ?? '',
      meta: hall.subject,
      date: hall.nextEvaluation?.date ?? 0,
      open: () => router.push({ pathname: '/classhall/hall', params: { id: hall.id } }),
    }));
  const items = (fromCalendar.length ? fromCalendar : fromHalls).sort((a, b) => a.date - b.date).slice(0, WEEK_LIMIT);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <View style={styles.panelIcon}><Ionicons name="calendar-outline" size={18} color={AppColors.textSecondary} /></View>
        <ThemedText accessibilityRole="header" style={styles.panelTitle}>{t('calendar.estaSemana')}</ThemedText>
      </View>
      {items.length === 0 ? (
        events === null && !fromHalls.length ? null : <ThemedText style={styles.empty}>{t('components.classhall.hallGrid.nadaAgendadoParaLosProximos')}</ThemedText>
      ) : items.map(item => {
        const days = daysUntil(item.date);
        const soon = days <= 1;
        const date = new Date(item.date);
        return (
          <Pressable key={item.key} accessibilityRole="button" onPress={item.open} style={({ pressed, hovered }: PressState) => [styles.row, hovered && styles.rowHovered, pressed && AppPressed]}>
            <View style={[styles.date, soon && styles.dateHot]}>
              <ThemedText style={styles.dateDay}>{date.getDate()}</ThemedText>
              <ThemedText style={styles.dateMonth}>{months[date.getMonth()]}</ThemedText>
            </View>
            <View style={styles.rowText}>
              <ThemedText numberOfLines={1} style={styles.rowTitle}>{item.title}</ThemedText>
              {!!item.meta && <ThemedText numberOfLines={1} style={styles.rowMeta}>{item.meta}</ThemedText>}
            </View>
            <View style={[styles.when, soon && styles.whenHot]}>
              <ThemedText style={[styles.whenText, soon && styles.whenTextHot]}>{whenLabel(days)}</ThemedText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  cardHovered: {
    backgroundColor: AppColors.surfaceMuted,
  },
  banner: {
    height: 92,
    backgroundColor: AppColors.surfaceMuted,
  },
  nowChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.accent,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.textPrimary,
  },
  nowText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  icon: {
    position: 'absolute',
    left: 14,
    bottom: -20,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 3,
    borderColor: AppColors.surface,
    backgroundColor: AppColors.controlActive,
  },
  body: {
    gap: 2,
    paddingTop: 28,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  subject: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  teacher: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  chip: {
    height: 26,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  chipText: {
    flexShrink: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 34, 116, 0.16)',
  },
  alertText: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.errorText,
  },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: AppColors.surfaceMuted,
  },
  codeHovered: {
    backgroundColor: AppColors.surfaceRaised,
  },
  codeLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  codeValue: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 2,
    color: AppColors.textPrimary,
  },
  codeAction: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  panel: {
    gap: 4,
    padding: 20,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
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
  empty: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
  row: {
    minHeight: 56,
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
  date: {
    width: 46,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  dateHot: {
    backgroundColor: AppColors.accent,
  },
  dateDay: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  dateMonth: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 10,
    lineHeight: 12,
    textTransform: 'uppercase',
    color: AppColors.textPrimary,
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
  rowMeta: {
    ...AppType.caption,
    color: AppColors.textSecondary,
    opacity: 0.85,
  },
  when: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  whenHot: {
    backgroundColor: AppColors.accent,
  },
  whenText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
    lineHeight: 14,
    color: AppColors.textSecondary,
  },
  whenTextHot: {
    color: AppColors.textPrimary,
  },
});
