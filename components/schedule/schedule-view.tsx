import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { BlockEditor } from '@/components/schedule/block-editor';
import type { BlockKind } from '@/components/schedule/block-editor';
import { NowNextCard } from '@/components/schedule/now-next-card';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { HanetSelect } from '@/components/ui/hanet-select';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError, useSession } from '@/services/auth-service';
import { useCached } from '@/services/cache';
import { SCHEDULE_DAYS, blocksOn, getCourseSchedule, isBreak, myWeek, nowAndNext, saveCourseSchedule, scheduleDay } from '@/services/schedule-service';
import type { CourseSchedule, ScheduleBlock } from '@/services/schedule-service';
import { syncHomeWidget } from '@/services/widget-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Horario: the course's week, block by block, with what is on now. The
// course's Directiva, the administration and HNT edit it. Each student also
// sees the blocks of their electivos and dominios, which their Halls set.
// `embedded` is the Calendar's Horario view: no top bar of its own, and
// "Editar horario" opens the full screen to edit there.

export function ScheduleView({ embedded = false }: { embedded?: boolean }) {
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
  // The block open in the editor: its position in `blocks`, or null for a new one.
  const [draft, setDraft] = useState<{ index: number | null; kind: BlockKind } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getCourseSchedule(courseId);
      setLoaded(result);
      setError(null);
      if (!courseId) void syncHomeWidget(myWeek(result));
    } catch (loadError) {
      setError(describeAuthError(loadError, 'No pudimos cargar el horario.'));
    }
  }, [courseId]);

  useFocusEffect(useCallback(() => {
    if (user) void load();
  }, [load, user]));

  const blocks = edited ?? schedule?.blocks ?? [];
  // While editing, only the course's own blocks; otherwise the whole week.
  const dayBlocks = blocksOn(edited ? blocks : myWeek(schedule), day);
  const isToday = day === scheduleDay(now);
  const { current, next } = nowAndNext(myWeek(schedule), now);
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
      if (!courseId) void syncHomeWidget(myWeek({ blocks: saved, hallBlocks: schedule.hallBlocks }));
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

  const saveDraft = (block: ScheduleBlock) => {
    if (!draft) return;
    setEdited(draft.index !== null ? blocks.map((item, position) => (position === draft.index ? block : item)) : [...blocks, block]);
    setDraft(null);
  };

  const removeDraft = () => {
    if (!draft || draft.index === null) return;
    setEdited(blocks.filter((_, position) => position !== draft.index));
    setDraft(null);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/calendar'));

  return (
    <SafeAreaView style={styles.screen} edges={embedded ? [] : ['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={AppColors.accent} />}
        keyboardShouldPersistTaps="handled"
      >
        {!embedded && (
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={back} style={({ pressed }) => [styles.roundButton, pressed && AppPressed]}>
            <Image source={require('@/assets/icons/event/arrow-left-long.svg')} style={styles.icon} contentFit="contain" tintColor={AppColors.textPrimary} />
          </Pressable>
          <View style={styles.titleWrap}>
            <ThemedText accessibilityRole="header" style={styles.title}>Horario</ThemedText>
            {!!schedule?.courseId && <ThemedText style={styles.subtitle}>{schedule.courseId}</ThemedText>}
          </View>
        </View>
        )}

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
                  // Every class opens its Hall: electivos and dominios, and the plan común ones that have one.
                  const hallId = block.hallId;
                  return (
                    <Pressable
                      key={`${block.id}-${index}`}
                      accessibilityRole={edited || hallId ? 'button' : undefined}
                      accessibilityLabel={`${block.start} a ${block.end}, ${block.subject}${block.room ? `, ${block.room}` : ''}${live ? ', ahora' : ''}`}
                      accessibilityHint={edited ? 'Editar el bloque' : hallId ? 'Abrir el Hall' : undefined}
                      disabled={!edited && !hallId}
                      onPress={() => (edited
                        ? setDraft({ index, kind: pause ? 'break' : 'class' })
                        : router.push({ pathname: '/classhall/hall', params: { id: hallId } }))}
                      style={({ pressed }) => [styles.block, pause && styles.blockBreak, live && styles.blockLive, pressed && AppPressed]}
                    >
                      <View style={styles.blockTime}>
                        <ThemedText style={styles.blockStart}>{block.start}</ThemedText>
                        <ThemedText style={styles.blockEnd}>{block.end}</ThemedText>
                      </View>
                      <View style={[styles.blockBar, pause && styles.blockBarBreak, live && styles.blockBarLive]} />
                      <View style={styles.blockText}>
                        <ThemedText style={[styles.blockSubject, pause && styles.blockSubjectBreak]}>{block.subject}</ThemedText>
                        {(!!block.room || block.kind === 'hall') && (
                          <ThemedText style={styles.blockRoom}>
                            {[block.kind === 'hall' ? (block.plan === 'dominio' ? 'Dominio' : 'Electivo') : null, block.room || null].filter(Boolean).join(' · ')}
                          </ThemedText>
                        )}
                      </View>
                      {(edited || !!hallId) && <CustomIcon name="chevron-right" size={18} color={AppColors.textSecondary} />}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {schedule.canEdit && (
              edited ? (
                <View style={styles.editActions}>
                  <HanetDialogActions>
                    <HanetButton label="Agregar clase" variant="surface" disabled={saving} onPress={() => setDraft({ index: null, kind: 'class' })} style={dialogStyles.action} />
                    <HanetButton label="Agregar recreo" variant="surface" disabled={saving} onPress={() => setDraft({ index: null, kind: 'break' })} style={dialogStyles.action} />
                  </HanetDialogActions>
                  <HanetDialogActions>
                    <HanetButton label="Descartar" variant="surface" disabled={saving} onPress={() => setEdited(null)} style={dialogStyles.action} />
                    <HanetButton label={saving ? 'Guardando…' : 'Guardar'} variant="accent" disabled={saving} onPress={() => void save()} style={dialogStyles.action} />
                  </HanetDialogActions>
                </View>
              ) : (
                <HanetButton label="Editar horario" variant="surface" onPress={() => (embedded ? router.push('/schedule') : setEdited(schedule.blocks))} style={styles.editButton} />
              )
            )}
            <ThemedText style={styles.note}>Los electivos y dominios los agrega cada Hall: aparecen en el horario de quienes están en él.</ThemedText>
          </>
        )}
      </ScrollView>

      {!!draft && (
        <BlockEditor
          block={draft.index !== null ? blocks[draft.index] : null}
          day={day}
          kind={draft.kind}
          others={blocks.filter((_, position) => position !== draft.index)}
          onSave={saveDraft}
          onRemove={removeDraft}
          onClose={() => setDraft(null)}
        />
      )}
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
});
