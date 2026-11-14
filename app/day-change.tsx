import { changeDates, changeDayLabel, changeScope, changeTitle } from '@/components/calendar/day-change-banner';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { HanetDateTimePickerModal, HanetTimeWheels } from '@/components/ui/hanet-date-time-picker';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { HanetChoice } from '@/components/ui/hanet-select';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { deleteDayChange, listDayChanges, previewDayChange, saveDayChange } from '@/services/day-changes';
import type { DayChangeInput, DayChangePlan, ListedDayChange } from '@/services/day-changes';
import { dateKey, getCourseSchedule, timeOf } from '@/services/schedule-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardScroll } from '@/components/ui/keyboard';
import { t } from '@/i18n';

// Suspending classes or setting an early dismissal, for the school's
// administration and HNT. The evaluations of the lost hours move by
// themselves to the next class of their subject; before saving, the sheet
// says which and whom it reaches.

type Form = {
  kind: DayChangeInput['kind'];
  from: string;
  to: string;
  endsAt: number;
  scope: DayChangeInput['scope'];
  courses: string[];
  reason: string;
  notify: boolean;
};

function fromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function moment(ms: number) {
  const date = new Date(ms);
  return `${changeDayLabel(dateKey(date))}, ${timeOf(date.getHours() * 60 + date.getMinutes())}`;
}

function DayChangeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = dateKey(new Date());
  const start = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date >= today ? params.date : today;
  const [initial] = useState<Form>(() => ({ kind: 'suspended', from: start, to: start, endsAt: 12 * 60 + 30, scope: 'school', courses: [], reason: '', notify: true }));
  const [form, setForm] = useState<Form>(initial);
  const [existing, setExisting] = useState<ListedDayChange[] | null>(null);
  const [courses, setCourses] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The last preview, with the form it was for.
  const [planned, setPlanned] = useState<{ key: string; plan: DayChangePlan | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ListedDayChange | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    let live = true;
    listDayChanges()
      .then(result => { if (live) { setExisting(result.changes); setCourses(result.courses); } })
      .catch(loadFailure => { if (live) setLoadError(describeAuthError(loadFailure, t('dayChange.noPudimosCargarLosCambios'))); });
    return () => { live = false; };
  }, [attempt]);
  const load = () => { setLoadError(null); setAttempt(value => value + 1); };

  const update = (patch: Partial<Form>) => { setForm(value => ({ ...value, ...patch })); setError(null); };
  const input: DayChangeInput = {
    kind: form.kind,
    from: form.from,
    to: form.kind === 'early' ? form.from : (form.to < form.from ? form.from : form.to),
    endsAt: form.kind === 'early' ? timeOf(form.endsAt) : null,
    scope: form.scope,
    courses: form.scope === 'courses' ? form.courses : [],
    reason: form.reason.trim(),
    notify: form.notify,
  };
  const ready = form.scope === 'school' || form.courses.length > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const planKey = JSON.stringify({ ...input, reason: '', notify: true });

  // What it would move, asked again a moment after the form stops changing.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const timer = setTimeout(() => {
      previewDayChange(input)
        .then(result => { if (live) setPlanned({ key: planKey, plan: result }); })
        .catch(() => { if (live) setPlanned({ key: planKey, plan: null }); });
    }, 450);
    return () => { live = false; clearTimeout(timer); };
  }, [planKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = planned?.key === planKey ? planned.plan : null;
  const planning = ready && planned?.key !== planKey;

  const submit = async () => {
    if (submitting || !ready) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveDayChange(input);
      // The Calendar and the widgets read the timetable again with the change.
      void getCourseSchedule().catch(() => undefined);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, t('dayChange.noPudimosGuardarElCambio')));
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!removing || removeBusy) return;
    setRemoveBusy(true);
    try {
      await deleteDayChange(removing.id, true);
      void getCourseSchedule().catch(() => undefined);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setExisting(list => (list ?? []).filter(item => item.id !== removing.id));
      setRemoving(null);
    } catch (removeError) {
      setError(describeAuthError(removeError, t('dayChange.noPudimosQuitarElCambio')));
      setRemoving(null);
    } finally {
      setRemoveBusy(false);
    }
  };

  const label = form.kind === 'suspended' ? t('dayChange.suspenderClases') : t('dayChange.adelantarLaSalida');
  const { allowLeave, dialog } = useUnsavedChangesGuard({ dirty: dirty && !submitting, onSave: submit, saveLabel: label, canSave: ready });

  const toggleCourse = (course: string) => update({
    courses: form.courses.includes(course) ? form.courses.filter(item => item !== course) : [...form.courses, course],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardScroll
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustsScrollIndicatorInsets={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Image source={require('@/assets/images/HanetCalendarvector.svg')} style={styles.logo} contentFit="contain" />
        </View>
        <ThemedText accessibilityRole="header" style={styles.title}>{t('dayChange.cambiarUnDiaDeClases')}</ThemedText>
        <View style={styles.separator} />
        <ThemedText style={styles.lead}>{t('dayChange.suspendeLasClasesOAdelanta')}</ThemedText>

        {existing === null && !loadError && <ActivityIndicator color={AppColors.textOnLight} style={styles.loading} />}
        {!!loadError && (
          <View style={styles.section}>
            <ThemedText style={styles.fieldError}>{loadError}</ThemedText>
            <HanetButton label={t('calendar.intentarDeNuevo')} variant="surface" onPress={load} />
          </View>
        )}
        {!!existing?.length && (
          <View style={styles.section}>
            <ThemedText style={styles.label}>{t('dayChange.proximosCambios')}</ThemedText>
            <View style={styles.cards}>
              {existing.map(item => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardText}>
                    <ThemedText style={styles.cardMeta}>{changeDates(item)} · {changeScope(item)}</ThemedText>
                    <ThemedText style={styles.cardTitle}>{changeTitle(item)}</ThemedText>
                    {!!item.reason && <ThemedText style={styles.cardBody}>{item.reason}</ThemedText>}
                    {item.moved > 0 && <ThemedText style={styles.cardBody}>{t('dayChange.movioCountPruebas', { count: item.moved })}</ThemedText>}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('dayChange.quitarChangetitleChangedates', { changeTitle: changeTitle(item), changeDates: changeDates(item) })}
                    onPress={() => setRemoving(item)}
                    style={({ pressed }) => [styles.remove, pressed && AppPressed]}
                  >
                    <ThemedText style={styles.removeText}>{t('common.quitar')}</ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <ThemedText style={styles.label}>{t('dayChange.quePasa')}</ThemedText>
          <HanetChoice
            label={t('dayChange.quePasa')}
            options={[{ value: 'suspended', label: t('dayChange.suspensionDeClases') }, { value: 'early', label: t('dayChange.salidaAnticipada') }]}
            value={form.kind}
            onChange={kind => update({ kind: kind as Form['kind'] })}
            disabled={submitting}
          />
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.label}>{form.kind === 'suspended' ? t('dayChange.desde') : t('components.calendar.calendarBarStore.dia')}</ThemedText>
          <DateButton value={form.from} onPress={() => setPicking('from')} disabled={submitting} />
        </View>
        {form.kind === 'suspended' && (
          <View style={styles.section}>
            <ThemedText style={styles.label}>{t('anniversary.deadline.hasta')}</ThemedText>
            <DateButton value={input.to} onPress={() => setPicking('to')} disabled={submitting} />
            {input.to === input.from && <ThemedText style={styles.hint}>{t('dayChange.unSoloDiaEligeOtra')}</ThemedText>}
          </View>
        )}
        {form.kind === 'early' && (
          <View style={styles.section}>
            <ThemedText style={styles.label}>{t('dayChange.horaDeSalida')}</ThemedText>
            <View style={styles.wheels}>
              <HanetTimeWheels minutes={form.endsAt} onChange={endsAt => update({ endsAt })} label={t('dayChange.horaDeSalida')} />
            </View>
            <ThemedText style={styles.hint}>{t('dayChange.lasClasesQueEmpiezanA')}</ThemedText>
          </View>
        )}

        <View style={styles.section}>
          <ThemedText style={styles.label}>{t('dayChange.aQuienes')}</ThemedText>
          <HanetChoice
            label={t('dayChange.aQuienes')}
            options={[{ value: 'school', label: t('services.feedService.todoElLiceo') }, { value: 'courses', label: t('dayChange.algunosCursos') }]}
            value={form.scope}
            onChange={scope => update({ scope: scope as Form['scope'] })}
            disabled={submitting}
          />
          {form.scope === 'courses' && (
            courses.length ? (
              <View style={styles.courses}>
                {courses.map(course => (
                  <HanetChip key={course} label={course} compact selected={form.courses.includes(course)} onPress={() => toggleCourse(course)} disabled={submitting} accessibilityRole="checkbox" />
                ))}
              </View>
            ) : (
              existing !== null && <ThemedText style={styles.hint}>{t('dayChange.noHayCursosEnLa')}</ThemedText>
            )
          )}
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.label}>{t('anniversary.points.motivo')}</ThemedText>
          <TextInput
            accessibilityLabel={t('anniversary.points.motivo')}
            placeholder={t('dayChange.elLiceoSeraLocalDe')}
            placeholderTextColor="rgba(62,62,58,0.6)"
            value={form.reason}
            onChangeText={reason => update({ reason })}
            maxLength={120}
            editable={!submitting}
            style={styles.reason}
          />
          <ThemedText style={styles.hint}>{t('dayChange.loVenEstudiantesYDocentes')}</ThemedText>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: form.notify }}
          onPress={() => update({ notify: !form.notify })}
          style={({ pressed }) => [styles.notify, pressed && styles.pressed]}
        >
          <View style={[styles.box, form.notify && styles.boxOn]}>
            {form.notify && <CustomIcon name="check-circle" size={16} color={AppColors.textPrimary} />}
          </View>
          <View style={styles.notifyText}>
            <ThemedText style={styles.notifyTitle}>{t('dayChange.avisarAhora')}</ThemedText>
            <ThemedText style={styles.notifyBody}>{t('dayChange.lesLlegaUnaNotificacionSi')}</ThemedText>
          </View>
        </Pressable>

        {ready && (
          <View style={styles.plan} accessibilityLiveRegion="polite">
            {planning && !plan ? (
              <ThemedText style={styles.planBody}>{t('dayChange.revisandoLasPruebasDeEsos')}</ThemedText>
            ) : plan ? (
              <>
                <ThemedText style={styles.planTitle}>
                  {t('dayChange.llegaACountPersonasValue', { count: plan.reach, value: plan.moves.length === 0 ? t('dayChange.noHayPruebasQueMover') : t('dayChange.countPruebasPasanASu', { count: plan.moves.length }) })}
                </ThemedText>
                {plan.moves.slice(0, 8).map((move, index) => (
                  <ThemedText key={`${move.title}-${index}`} style={styles.planBody}>
                    {move.subject}: {move.title}. {moment(move.from)} → {moment(move.to)}
                  </ThemedText>
                ))}
                {plan.moves.length > 8 && <ThemedText style={styles.planBody}>{t('dayChange.yMovescountMas', { movesCount: plan.moves.length - 8 })}</ThemedText>}
                {plan.unmoved.length > 0 && (
                  <ThemedText style={styles.planBody}>
                    {t('dayChange.countPruebasNoTienenClase', { count: plan.unmoved.length, title: plan.unmoved[0].title })}
                  </ThemedText>
                )}
              </>
            ) : null}
          </View>
        )}

        {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.saveError}>{error}</ThemedText>}
        <View style={styles.footer}>
          <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => router.back()} disabled={submitting} style={styles.footerButton} />
          <HanetButton label={submitting ? t('common.guardando') : label} onPress={() => void submit()} disabled={!ready || submitting} style={styles.footerButton} />
        </View>
        <View style={{ height: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : 40 }} />
      </KeyboardScroll>

      <HanetDateTimePickerModal
        dateOnly
        visible={picking !== null}
        value={fromKey(picking === 'to' ? input.to : form.from)}
        onCancel={() => setPicking(null)}
        onConfirm={date => {
          const key = dateKey(date);
          if (key < today) setError(t('anniversary.deadline.esaFechaYaPaso'));
          else if (picking === 'from') update({ from: key, to: form.to < key ? key : form.to });
          else update({ to: key < form.from ? form.from : key });
          setPicking(null);
        }}
      />
      <HanetDialog
        visible={!!removing}
        onRequestClose={() => setRemoving(null)}
        title={t('dayChange.quitarEsteCambio')}
        body={removing?.kind === 'suspended'
          ? t('dayChange.lasPruebasQueMovioVuelven')
          : t('dayChange.lasPruebasQueMovioVuelven2')}
      >
        <HanetDialogActions>
          <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => setRemoving(null)} disabled={removeBusy} style={dialogStyles.action} />
          <HanetButton label={removeBusy ? t('editProfile.quitando') : t('common.quitar')} onPress={() => void remove()} disabled={removeBusy} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>
      {dialog}
    </SafeAreaView>
  );
}

function DateButton({ value, onPress, disabled }: { value: string; onPress: () => void; disabled?: boolean }) {
  const label = changeDayLabel(value);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('dayChange.labelCambiar', { label })}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.dateButton, pressed && styles.pressed]}
    >
      <ThemedText numberOfLines={1} style={styles.dateText}>{label.charAt(0).toUpperCase() + label.slice(1)}</ThemedText>
      <CustomIcon name="calendar" size={18} color={AppColors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.neutral2,
    borderTopLeftRadius: Platform.OS === 'android' ? 50 : 0,
    borderTopRightRadius: Platform.OS === 'android' ? 50 : 0,
    overflow: 'hidden',
  },
  scroll: { flex: 1, width: '100%' },
  content: { paddingHorizontal: 20, paddingTop: 30, paddingBottom: 0 },
  header: { paddingBottom: 16 },
  logo: { width: 148, height: 36, marginLeft: 5 },
  title: { fontSize: 32, lineHeight: 38, fontFamily: 'DMSans_700Bold', letterSpacing: -2, color: AppColors.textOnLight, paddingBottom: 10 },
  separator: { height: 2, backgroundColor: AppColors.textOnLight, marginBottom: 12 },
  lead: { fontSize: 14, lineHeight: 20, fontFamily: 'DMSans_500Medium', color: AppColors.surface, marginBottom: 25 },
  loading: { marginBottom: 20 },
  section: { marginBottom: 20 },
  label: { color: AppColors.textOnLight, fontFamily: 'DMSans_700Bold', fontSize: 15, marginBottom: 10 },
  hint: { fontSize: 13, lineHeight: 18, color: AppColors.surface, fontFamily: 'DMSans_500Medium', marginTop: 10 },
  fieldError: { color: AppColors.errorTextOnLight, fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  saveError: { color: AppColors.errorTextOnLight, fontFamily: 'DMSans_700Bold', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  pressed: { opacity: 0.75 },
  cards: { gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    padding: 16,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  cardText: { flex: 1, gap: 2 },
  cardMeta: { ...AppType.caption, color: AppColors.textSecondary },
  cardTitle: { fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 20, color: AppColors.textPrimary },
  cardBody: { ...AppType.footnote, color: AppColors.textSecondary },
  remove: {
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  removeText: { ...AppType.caption, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  dateText: { flex: 1, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary, fontSize: 13 },
  wheels: {
    alignSelf: 'flex-start',
    padding: AppSpacing.sm,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  courses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  reason: {
    fontSize: 16,
    color: AppColors.textOnLight,
    paddingVertical: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: AppColors.textOnLight,
    fontFamily: 'DMSans_400Regular',
    outlineStyle: 'none' as any,
  },
  notify: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  box: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surface,
  },
  boxOn: { backgroundColor: AppColors.accent },
  notifyText: { flex: 1, gap: 2 },
  notifyTitle: { fontSize: 15, lineHeight: 20, fontFamily: 'DMSans_700Bold', color: AppColors.textOnLight },
  notifyBody: { fontSize: 13, lineHeight: 18, fontFamily: 'DMSans_500Medium', color: AppColors.surface },
  plan: {
    gap: AppSpacing.xs,
    padding: 16,
    marginBottom: 24,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  planTitle: { fontSize: 14, lineHeight: 20, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  planBody: { ...AppType.footnote, color: AppColors.textSecondary },
  footer: { flexDirection: 'row', gap: 10, width: '100%' },
  footerButton: { flex: 1 },
});

export default withSheetFrame(DayChangeScreen, AppColors.neutral2);
