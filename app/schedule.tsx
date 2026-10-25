import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { HanetSelect } from '@/components/ui/hanet-select';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError, useSession } from '@/services/auth-service';
import { useCached } from '@/services/cache';
import { SCHEDULE_DAYS, blocksOn, getCourseSchedule, minutesOf, nowAndNext, saveCourseSchedule, scheduleDay } from '@/services/schedule-service';
import type { CourseSchedule, ScheduleBlock } from '@/services/schedule-service';
import { syncHomeWidget } from '@/services/widget-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Horario: the course's week, block by block, with what is on now. The
// course's Directiva, the administration and HNT edit it.

const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

type Draft = { index: number | null; day: number; start: string; end: string; subject: string; room: string };

function pad(time: string) {
  const [hours, minutes] = time.trim().split(':');
  return `${hours.padStart(2, '0')}:${minutes}`;
}

export default function ScheduleScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<CourseSchedule | null>(null);
  const kept = useCached<CourseSchedule>(user ? `schedule:${courseId ?? 'mine'}` : null);
  const schedule = loaded && (courseId === null || loaded.courseId === courseId) ? loaded : kept ?? null;
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now] = useState(() => new Date());
  // Today, or Monday on Sundays.
  const [day, setDay] = useState(() => (scheduleDay(new Date()) === 7 ? 1 : scheduleDay(new Date())));

  // Editing: a copy of the blocks until "Guardar".
  const [edited, setEdited] = useState<ScheduleBlock[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getCourseSchedule(courseId);
      setLoaded(result);
      setError(null);
      if (!courseId) void syncHomeWidget(result.blocks);
    } catch (loadError) {
      setError(describeAuthError(loadError, 'No pudimos cargar el horario.'));
    }
  }, [courseId]);

  useFocusEffect(useCallback(() => {
    if (user) void load();
  }, [load, user]));

  const blocks = edited ?? schedule?.blocks ?? [];
  const dayBlocks = blocksOn(blocks, day);
  const isToday = day === scheduleDay(now);
  const { current, next } = nowAndNext(schedule?.blocks ?? [], now);
  const days = SCHEDULE_DAYS.filter(item => item.day < 6 || edited || blocks.some(block => block.day === 6));

  const save = async () => {
    if (!edited || !schedule?.courseId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveCourseSchedule(schedule.courseId, edited);
      setLoaded({ ...schedule, blocks: saved });
      setEdited(null);
      allowLeave();
      if (!courseId) void syncHomeWidget(saved);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos guardar el horario.'));
    } finally {
      setSaving(false);
    }
  };

  const { allowLeave, dialog: guardDialog } = useUnsavedChangesGuard({
    dirty: !!edited && !saving,
    onSave: save,
    saveLabel: 'Guardar',
    canSave: !!edited,
    title: '¿Descartar los cambios del horario?',
    message: 'El horario quedará como estaba.',
  });

  const openDraft = (block: ScheduleBlock | null, index: number | null) => {
    setDraftError(null);
    const previous = dayBlocks[dayBlocks.length - 1];
    setDraft(block
      ? { index, day: block.day, start: block.start, end: block.end, subject: block.subject, room: block.room }
      : { index: null, day, start: previous?.end ?? '08:00', end: '', subject: '', room: previous?.room ?? '' });
  };

  const commitDraft = () => {
    if (!draft) return;
    const start = draft.start.trim();
    const end = draft.end.trim();
    if (!TIME.test(start) || !TIME.test(end)) return setDraftError('Escribe las horas como 08:00.');
    if (minutesOf(pad(end)) <= minutesOf(pad(start))) return setDraftError('El bloque tiene que terminar después de empezar.');
    if (!draft.subject.trim()) return setDraftError('Escribe la asignatura.');
    const block: ScheduleBlock = {
      id: draft.index !== null ? blocks[draft.index].id : `b${Date.now().toString(36)}`,
      day: draft.day,
      start: pad(start),
      end: pad(end),
      subject: draft.subject.trim(),
      room: draft.room.trim(),
    };
    const nextBlocks = draft.index !== null ? blocks.map((item, position) => (position === draft.index ? block : item)) : [...blocks, block];
    setEdited(nextBlocks);
    setDraft(null);
  };

  const removeDraft = () => {
    if (!draft || draft.index === null) return;
    setEdited(blocks.filter((_, position) => position !== draft.index));
    setDraft(null);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/calendar'));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={AppColors.accent} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={back} style={({ pressed }) => [styles.roundButton, pressed && AppPressed]}>
            <Image source={require('@/assets/icons/event/arrow-left-long.svg')} style={styles.icon} contentFit="contain" tintColor={AppColors.textPrimary} />
          </Pressable>
          <View style={styles.titleWrap}>
            <ThemedText accessibilityRole="header" style={styles.title}>Horario</ThemedText>
            {!!schedule?.courseId && <ThemedText style={styles.subtitle}>{schedule.courseId}</ThemedText>}
          </View>
        </View>

        {!!schedule && schedule.courses.length > 0 && (
          <HanetSelect
            label="Curso"
            options={schedule.courses.map(course => ({ value: course, label: course }))}
            value={schedule.courseId}
            onChange={value => { setEdited(null); setCourseId(value); }}
            disabled={!!edited}
          />
        )}

        {!schedule && !error && <ActivityIndicator style={styles.loader} color={AppColors.textSecondary} />}
        {!!error && <ThemedText accessibilityLiveRegion="polite" style={styles.error}>{error}</ThemedText>}

        {!!schedule && !schedule.courseId && (
          <ThemedText style={styles.empty}>Tu cuenta no tiene curso todavía. El horario aparece cuando tu liceo te asigna uno.</ThemedText>
        )}

        {!!schedule?.courseId && (
          <>
            {!edited && (current || next) && (
              <View style={styles.nowCard} accessible accessibilityLabel={[current ? `Ahora: ${current.subject} hasta las ${current.end}` : null, next ? `Después: ${next.subject} a las ${next.start}` : null].filter(Boolean).join('. ')}>
                {!!current && (
                  <View style={styles.nowRow}>
                    <ThemedText style={styles.nowLabel}>Ahora</ThemedText>
                    <ThemedText style={styles.nowSubject}>{current.subject}</ThemedText>
                    <ThemedText style={styles.nowMeta}>Hasta las {current.end}{current.room ? ` · ${current.room}` : ''}</ThemedText>
                  </View>
                )}
                {!!next && (
                  <View style={styles.nowRow}>
                    <ThemedText style={[styles.nowLabel, styles.nextLabel]}>Después</ThemedText>
                    <ThemedText style={styles.nextSubject}>{next.subject}</ThemedText>
                    <ThemedText style={styles.nowMeta}>{next.start}{next.room ? ` · ${next.room}` : ''}</ThemedText>
                  </View>
                )}
              </View>
            )}

            <View style={styles.days} accessibilityRole="tablist">
              {days.map(item => (
                <Pressable
                  key={item.day}
                  accessibilityRole="tab"
                  accessibilityLabel={item.name}
                  accessibilityState={{ selected: item.day === day }}
                  onPress={() => { if (Platform.OS === 'ios') void Haptics.selectionAsync(); setDay(item.day); }}
                  style={({ pressed }) => [styles.day, item.day === day && styles.daySelected, pressed && AppPressed]}
                >
                  <ThemedText style={[styles.dayText, item.day === day && styles.dayTextSelected]}>{item.short}</ThemedText>
                  {item.day === scheduleDay(now) && <View style={[styles.todayDot, item.day === day && styles.todayDotSelected]} />}
                </Pressable>
              ))}
            </View>

            <ThemedText style={styles.dayName}>{SCHEDULE_DAYS.find(item => item.day === day)?.name}{isToday ? ' · hoy' : ''}</ThemedText>

            {dayBlocks.length === 0 ? (
              <ThemedText style={styles.empty}>
                {blocks.length === 0
                  ? schedule.canEdit ? 'Este curso todavía no tiene horario. Toca “Editar horario” para armarlo.' : 'Tu curso todavía no tiene horario cargado.'
                  : 'No hay clases este día.'}
              </ThemedText>
            ) : (
              <View style={styles.blocks}>
                {dayBlocks.map(block => {
                  const index = blocks.indexOf(block);
                  const live = !edited && isToday && current?.id === block.id;
                  return (
                    <Pressable
                      key={`${block.id}-${index}`}
                      accessibilityRole={edited ? 'button' : undefined}
                      accessibilityLabel={`${block.start} a ${block.end}, ${block.subject}${block.room ? `, ${block.room}` : ''}${live ? ', ahora' : ''}`}
                      accessibilityHint={edited ? 'Editar el bloque' : undefined}
                      disabled={!edited}
                      onPress={() => openDraft(block, index)}
                      style={({ pressed }) => [styles.block, live && styles.blockLive, pressed && AppPressed]}
                    >
                      <View style={styles.blockTime}>
                        <ThemedText style={styles.blockStart}>{block.start}</ThemedText>
                        <ThemedText style={styles.blockEnd}>{block.end}</ThemedText>
                      </View>
                      <View style={[styles.blockBar, live && styles.blockBarLive]} />
                      <View style={styles.blockText}>
                        <ThemedText style={styles.blockSubject}>{block.subject}</ThemedText>
                        {!!block.room && <ThemedText style={styles.blockRoom}>{block.room}</ThemedText>}
                      </View>
                      {edited && <CustomIcon name="chevron-right" size={18} color={AppColors.textSecondary} />}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {schedule.canEdit && (
              edited ? (
                <View style={styles.editActions}>
                  <HanetButton label="Agregar bloque" variant="surface" disabled={saving} onPress={() => openDraft(null, null)} />
                  <HanetDialogActions>
                    <HanetButton label="Descartar" variant="surface" disabled={saving} onPress={() => setEdited(null)} style={dialogStyles.action} />
                    <HanetButton label={saving ? 'Guardando…' : 'Guardar'} variant="accent" disabled={saving} onPress={() => void save()} style={dialogStyles.action} />
                  </HanetDialogActions>
                </View>
              ) : (
                <HanetButton label="Editar horario" variant="surface" onPress={() => setEdited(schedule.blocks)} style={styles.editButton} />
              )
            )}
            <ThemedText style={styles.note}>Por ahora es el horario del plan común. Los electivos y dominios llegan después.</ThemedText>
          </>
        )}
      </ScrollView>

      <HanetDialog visible={!!draft} onRequestClose={() => setDraft(null)} title={draft?.index !== null ? 'Editar bloque' : 'Nuevo bloque'}>
        {!!draft && (
          <View style={styles.form}>
            <View style={styles.formDays}>
              {SCHEDULE_DAYS.map(item => (
                <Pressable
                  key={item.day}
                  accessibilityRole="radio"
                  accessibilityLabel={item.name}
                  accessibilityState={{ checked: draft.day === item.day }}
                  onPress={() => setDraft({ ...draft, day: item.day })}
                  style={({ pressed }) => [styles.formDay, draft.day === item.day && styles.daySelected, pressed && AppPressed]}
                >
                  <ThemedText style={[styles.dayText, draft.day === item.day && styles.dayTextSelected]}>{item.short}</ThemedText>
                </Pressable>
              ))}
            </View>
            <TextInput accessibilityLabel="Asignatura" value={draft.subject} onChangeText={subject => setDraft({ ...draft, subject })} placeholder="Asignatura" placeholderTextColor="rgba(221, 221, 226, 0.4)" maxLength={40} style={styles.input} selectionColor={AppColors.accent} />
            <View style={styles.formRow}>
              <TextInput accessibilityLabel="Empieza" value={draft.start} onChangeText={start => setDraft({ ...draft, start })} placeholder="08:00" placeholderTextColor="rgba(221, 221, 226, 0.4)" keyboardType="numbers-and-punctuation" maxLength={5} style={[styles.input, styles.inputHalf]} selectionColor={AppColors.accent} />
              <TextInput accessibilityLabel="Termina" value={draft.end} onChangeText={end => setDraft({ ...draft, end })} placeholder="09:30" placeholderTextColor="rgba(221, 221, 226, 0.4)" keyboardType="numbers-and-punctuation" maxLength={5} style={[styles.input, styles.inputHalf]} selectionColor={AppColors.accent} />
            </View>
            <TextInput accessibilityLabel="Sala (opcional)" value={draft.room} onChangeText={room => setDraft({ ...draft, room })} placeholder="Sala (opcional)" placeholderTextColor="rgba(221, 221, 226, 0.4)" maxLength={20} style={styles.input} selectionColor={AppColors.accent} />
            {!!draftError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{draftError}</ThemedText>}
            <HanetDialogActions>
              <HanetButton label="Cancelar" variant="surface" onPress={() => setDraft(null)} style={dialogStyles.action} />
              <HanetButton label="Listo" onPress={commitDraft} style={dialogStyles.action} />
            </HanetDialogActions>
            {draft.index !== null && <HanetButton label="Quitar bloque" variant="surface" onPress={removeDraft} />}
          </View>
        )}
      </HanetDialog>
      {guardDialog}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    paddingBottom: TAB_BAR_CLEARANCE + AppSpacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingTop: AppSpacing.sm,
    paddingBottom: AppSpacing.sm,
  },
  roundButton: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  icon: {
    width: 24,
    height: 24,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  subtitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  loader: {
    marginTop: AppSpacing.xxl,
  },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  empty: {
    paddingVertical: AppSpacing.lg,
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.textSecondary,
  },
  nowCard: {
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  nowRow: {
    gap: 2,
  },
  nowLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: AppColors.accent,
  },
  nextLabel: {
    color: AppColors.textSecondary,
  },
  nowSubject: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  nextSubject: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 18,
    lineHeight: 24,
    color: AppColors.textPrimary,
  },
  nowMeta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  days: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.sm,
  },
  day: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  daySelected: {
    backgroundColor: AppColors.controlActive,
  },
  dayText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  dayTextSelected: {
    color: AppColors.controlOnActive,
  },
  todayDot: {
    position: 'absolute',
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.accent,
  },
  todayDotSelected: {
    backgroundColor: AppColors.accent,
  },
  dayName: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textSecondary,
  },
  blocks: {
    gap: AppSpacing.sm,
  },
  block: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.md,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  blockLive: {
    backgroundColor: 'rgba(239, 34, 116, 0.18)',
  },
  blockTime: {
    width: 48,
  },
  blockStart: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  blockEnd: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  blockBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  blockBarLive: {
    backgroundColor: AppColors.accent,
  },
  blockText: {
    flex: 1,
  },
  blockSubject: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  blockRoom: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  editActions: {
    gap: AppSpacing.sm,
    marginTop: AppSpacing.sm,
  },
  editButton: {
    marginTop: AppSpacing.sm,
  },
  note: {
    marginTop: AppSpacing.sm,
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
  form: {
    gap: AppSpacing.sm,
  },
  formDays: {
    flexDirection: 'row',
    gap: 6,
  },
  formDay: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  formRow: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  input: {
    height: 48,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.canvas,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    color: AppColors.textPrimary,
    outlineStyle: 'none' as never,
  },
  inputHalf: {
    flex: 1,
  },
});
