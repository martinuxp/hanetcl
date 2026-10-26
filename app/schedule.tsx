import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { NowNextCard } from '@/components/schedule/now-next-card';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetTimeWheels } from '@/components/ui/hanet-date-time-picker';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { HanetChoice, HanetSelect } from '@/components/ui/hanet-select';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { SUBJECTS, findSubject } from '@/constants/subjects';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError, useSession } from '@/services/auth-service';
import { useCached } from '@/services/cache';
import { SCHEDULE_DAYS, blocksOn, getCourseSchedule, isBreak, minutesOf, nowAndNext, saveCourseSchedule, scheduleDay, timeOf } from '@/services/schedule-service';
import type { CourseSchedule, ScheduleBlock } from '@/services/schedule-service';
import { syncHomeWidget } from '@/services/widget-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Horario: the course's week, block by block, with what is on now. The
// course's Directiva, the administration and HNT edit it.

type Kind = 'class' | 'break';

// Block lengths as chips; "Otra" opens the wheels for the end.
const DURATIONS: Record<Kind, number[]> = { class: [45, 90, 120, 180], break: [15, 30, 45, 60] };
const BREAK_NAMES = ['Recreo', 'Almuerzo'];
// The Horario is the plan común, so its catalog subjects.
const SCHEDULE_SUBJECTS = SUBJECTS.filter(subject => subject.plans.includes('comun'));

type Draft = {
  index: number | null;
  day: number;
  kind: Kind;
  /** Minutes since midnight. */
  start: number;
  /** One of DURATIONS, or null for an end picked on the wheels. */
  duration: number | null;
  end: number;
  /** A catalog subject's name, or null for one written by hand. */
  subject: string | null;
  customSubject: string;
  breakName: string;
  room: string;
};

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
  // The subject list, shown in place of the block's form.
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const { height } = useWindowDimensions();
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

  const openDraft = (block: ScheduleBlock | null, index: number | null, kind: Kind = 'class') => {
    setDraftError(null);
    setPicking(false);
    if (block) {
      const start = minutesOf(block.start);
      const end = minutesOf(block.end);
      const blockKind: Kind = isBreak(block) ? 'break' : 'class';
      const known = findSubject(block.subject);
      setDraft({
        index,
        day: block.day,
        kind: blockKind,
        start,
        duration: DURATIONS[blockKind].includes(end - start) ? end - start : null,
        end,
        subject: blockKind === 'class' && known ? known.name : null,
        customSubject: blockKind === 'class' && !known ? block.subject : '',
        breakName: blockKind === 'break' ? block.subject : BREAK_NAMES[0],
        room: block.room,
      });
      return;
    }
    // A new block starts when the day's last one ends.
    const previous = dayBlocks[dayBlocks.length - 1];
    const start = previous ? minutesOf(previous.end) : 8 * 60;
    const duration = DURATIONS[kind][0];
    const lastClass = [...dayBlocks].reverse().find(item => !isBreak(item));
    setDraft({ index: null, day, kind, start, duration, end: start + duration, subject: null, customSubject: '', breakName: BREAK_NAMES[0], room: lastClass?.room ?? '' });
  };

  const draftEnd = draft ? (draft.duration !== null ? draft.start + draft.duration : draft.end) : 0;

  const setKind = (kind: Kind) => {
    if (!draft || draft.kind === kind) return;
    const duration = DURATIONS[kind][0];
    setDraft({ ...draft, kind, duration, end: draft.start + duration });
  };

  const commitDraft = () => {
    if (!draft) return;
    const end = draftEnd;
    if (end <= draft.start) return setDraftError('El bloque tiene que terminar después de empezar.');
    if (end > 24 * 60) return setDraftError('El bloque tiene que terminar antes de medianoche.');
    const subject = draft.kind === 'break' ? draft.breakName : (draft.subject ?? draft.customSubject.trim());
    if (!subject) return setDraftError('Elige la asignatura.');
    const clash = blocksOn(blocks, draft.day).find(item => (
      blocks.indexOf(item) !== draft.index && minutesOf(item.start) < end && draft.start < minutesOf(item.end)
    ));
    if (clash) return setDraftError(`Choca con ${clash.subject} (${clash.start} – ${clash.end}).`);
    const block: ScheduleBlock = {
      id: draft.index !== null ? blocks[draft.index].id : `b${Date.now().toString(36)}`,
      day: draft.day,
      start: timeOf(draft.start),
      end: timeOf(end),
      subject,
      room: draft.kind === 'break' ? '' : draft.room.trim(),
      ...(draft.kind === 'break' ? { kind: 'break' as const } : {}),
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
            {!edited && <NowNextCard current={current} next={next} />}

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
                  const pause = isBreak(block);
                  return (
                    <Pressable
                      key={`${block.id}-${index}`}
                      accessibilityRole={edited ? 'button' : undefined}
                      accessibilityLabel={`${block.start} a ${block.end}, ${block.subject}${block.room ? `, ${block.room}` : ''}${live ? ', ahora' : ''}`}
                      accessibilityHint={edited ? 'Editar el bloque' : undefined}
                      disabled={!edited}
                      onPress={() => openDraft(block, index)}
                      style={({ pressed }) => [styles.block, pause && styles.blockBreak, live && styles.blockLive, pressed && AppPressed]}
                    >
                      <View style={styles.blockTime}>
                        <ThemedText style={styles.blockStart}>{block.start}</ThemedText>
                        <ThemedText style={styles.blockEnd}>{block.end}</ThemedText>
                      </View>
                      <View style={[styles.blockBar, pause && styles.blockBarBreak, live && styles.blockBarLive]} />
                      <View style={styles.blockText}>
                        <ThemedText style={[styles.blockSubject, pause && styles.blockSubjectBreak]}>{block.subject}</ThemedText>
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
                  <HanetDialogActions>
                    <HanetButton label="Agregar clase" variant="surface" disabled={saving} onPress={() => openDraft(null, null, 'class')} style={dialogStyles.action} />
                    <HanetButton label="Agregar recreo" variant="surface" disabled={saving} onPress={() => openDraft(null, null, 'break')} style={dialogStyles.action} />
                  </HanetDialogActions>
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

      <HanetDialog
        visible={!!draft}
        onRequestClose={() => (picking ? setPicking(false) : setDraft(null))}
        title={picking ? 'Asignatura' : draft?.index !== null ? (draft?.kind === 'break' ? 'Editar recreo' : 'Editar clase') : (draft?.kind === 'break' ? 'Nuevo recreo' : 'Nueva clase')}
      >
        {!!draft && picking && (
          <View style={styles.form}>
            <TextInput
              accessibilityLabel="Buscar asignatura"
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar"
              placeholderTextColor="rgba(221, 221, 226, 0.4)"
              autoCorrect={false}
              style={styles.input}
              selectionColor={AppColors.accent}
            />
            <ScrollView style={{ maxHeight: height * 0.45 }} contentContainerStyle={styles.subjectList} keyboardShouldPersistTaps="handled">
              {SCHEDULE_SUBJECTS
                .filter(subject => !query.trim() || [subject.name, ...subject.aliases].some(name => normalize(name).includes(normalize(query.trim()))))
                .map(subject => {
                  const selected = draft.subject === subject.name;
                  return (
                    <Pressable
                      key={subject.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        if (Platform.OS !== 'web') void Haptics.selectionAsync();
                        setDraft({ ...draft, subject: subject.name, customSubject: '' });
                        setPicking(false);
                      }}
                      style={({ pressed }) => [styles.subjectOption, selected && styles.daySelected, pressed && AppPressed]}
                    >
                      <ThemedText style={[styles.subjectText, selected && styles.dayTextSelected]}>{subject.name}</ThemedText>
                      {selected && <CustomIcon name="check-circle" size={20} color={AppColors.controlOnActive} />}
                    </Pressable>
                  );
                })}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: draft.subject === null && !!draft.customSubject }}
                onPress={() => { setDraft({ ...draft, subject: null, customSubject: draft.customSubject || query.trim() }); setPicking(false); }}
                style={({ pressed }) => [styles.subjectOption, pressed && AppPressed]}
              >
                <ThemedText style={[styles.subjectText, styles.subjectOther]}>Otra asignatura…</ThemedText>
              </Pressable>
            </ScrollView>
            <HanetButton label="Volver" variant="surface" onPress={() => setPicking(false)} />
          </View>
        )}
        {!!draft && !picking && (
          <ScrollView style={{ maxHeight: height * 0.7 }} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
            <HanetChoice
              label="Tipo de bloque"
              options={[{ value: 'class', label: 'Clase' }, { value: 'break', label: 'Recreo' }]}
              value={draft.kind}
              onChange={value => setKind(value as Kind)}
            />

            {draft.kind === 'class' ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Asignatura: ${draft.subject ?? (draft.customSubject || 'sin elegir')}`}
                  accessibilityHint="Abre la lista de asignaturas"
                  onPress={() => { setQuery(''); setPicking(true); }}
                  style={({ pressed }) => [styles.field, pressed && AppPressed]}
                >
                  <ThemedText numberOfLines={1} style={[styles.fieldText, !draft.subject && !draft.customSubject && styles.fieldPlaceholder]}>
                    {draft.subject ?? (draft.customSubject ? 'Otra asignatura' : 'Elegir asignatura')}
                  </ThemedText>
                  <CustomIcon name="chevron-right" size={18} color={AppColors.textSecondary} />
                </Pressable>
                {draft.subject === null && (
                  <TextInput accessibilityLabel="Nombre de la asignatura" value={draft.customSubject} onChangeText={customSubject => setDraft({ ...draft, customSubject })} placeholder="Nombre de la asignatura" placeholderTextColor="rgba(221, 221, 226, 0.4)" maxLength={40} style={styles.input} selectionColor={AppColors.accent} />
                )}
              </>
            ) : (
              <HanetChoice
                label="Nombre del recreo"
                options={BREAK_NAMES.map(name => ({ value: name, label: name }))}
                value={draft.breakName}
                onChange={breakName => setDraft({ ...draft, breakName })}
              />
            )}

            <View style={styles.timeRow}>
              <ThemedText style={styles.fieldLabel}>Empieza</ThemedText>
              <HanetTimeWheels label="Empieza" minutes={draft.start} onChange={start => setDraft({ ...draft, start })} />
            </View>

            <ThemedText style={styles.fieldLabel}>Duración</ThemedText>
            <HanetChoice
              label="Duración"
              options={[...DURATIONS[draft.kind].map(minutes => ({ value: String(minutes), label: `${minutes} min` })), { value: 'other', label: 'Otra' }]}
              value={draft.duration === null ? 'other' : String(draft.duration)}
              onChange={value => setDraft(value === 'other'
                ? { ...draft, duration: null, end: draftEnd }
                : { ...draft, duration: Number(value) })}
            />
            {draft.duration === null && (
              <View style={styles.timeRow}>
                <ThemedText style={styles.fieldLabel}>Termina</ThemedText>
                <HanetTimeWheels label="Termina" minutes={draft.end} onChange={end => setDraft({ ...draft, end })} />
              </View>
            )}
            <ThemedText style={styles.range} accessibilityLiveRegion="polite">
              {timeOf(draft.start)} – {draftEnd < 24 * 60 ? timeOf(draftEnd) : '…'}
              {draftEnd > draft.start ? ` · ${draftEnd - draft.start} min` : ''}
            </ThemedText>

            {draft.kind === 'class' && (
              <TextInput accessibilityLabel="Sala (opcional)" value={draft.room} onChangeText={room => setDraft({ ...draft, room })} placeholder="Sala (opcional)" placeholderTextColor="rgba(221, 221, 226, 0.4)" maxLength={20} style={styles.input} selectionColor={AppColors.accent} />
            )}
            {!!draftError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{draftError}</ThemedText>}
            <HanetDialogActions>
              <HanetButton label="Cancelar" variant="surface" onPress={() => setDraft(null)} style={dialogStyles.action} />
              <HanetButton label="Listo" onPress={commitDraft} style={dialogStyles.action} />
            </HanetDialogActions>
            {draft.index !== null && <HanetButton label={draft.kind === 'break' ? 'Quitar recreo' : 'Quitar clase'} variant="surface" onPress={removeDraft} />}
          </ScrollView>
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
  blockBreak: {
    minHeight: 44,
    paddingVertical: AppSpacing.sm,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: AppColors.surfaceMuted,
  },
  blockBarBreak: {
    backgroundColor: 'transparent',
  },
  blockSubjectBreak: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: AppColors.textSecondary,
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
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  range: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.canvas,
  },
  fieldText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  fieldPlaceholder: {
    color: AppColors.textSecondary,
    opacity: 0.6,
  },
  subjectList: {
    gap: 6,
  },
  subjectOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  subjectText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  subjectOther: {
    color: AppColors.textSecondary,
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
});
