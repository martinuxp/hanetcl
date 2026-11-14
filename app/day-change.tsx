import { SheetActions, SheetBody, TextField, formStyles as styles } from '@/components/anniversary/anniversary-form';
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
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
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
    <SheetBody title={t('dayChange.cambiarUnDiaDeClases')} lead={t('dayChange.suspendeLasClasesOAdelanta')}>
      {existing === null && !loadError && <ActivityIndicator color={AppColors.textSecondary} />}
      {!!loadError && (
        <View style={styles.field}>
          <ThemedText style={styles.error}>{loadError}</ThemedText>
          <HanetButton label={t('calendar.intentarDeNuevo')} variant="surface" onPress={load} />
        </View>
      )}
      {!!existing?.length && (
        <View style={styles.field}>
          <ThemedText style={styles.label}>{t('dayChange.proximosCambios')}</ThemedText>
          {existing.map(item => (
            <View key={item.id} style={local.card}>
              <View style={local.cardText}>
                <ThemedText style={local.cardMeta}>{changeDates(item)} · {changeScope(item)}</ThemedText>
                <ThemedText style={local.cardTitle}>{changeTitle(item)}</ThemedText>
                {!!item.reason && <ThemedText style={local.cardBody}>{item.reason}</ThemedText>}
                {item.moved > 0 && <ThemedText style={local.cardBody}>{t('dayChange.movioCountPruebas', { count: item.moved })}</ThemedText>}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('dayChange.quitarChangetitleChangedates', { changeTitle: changeTitle(item), changeDates: changeDates(item) })}
                onPress={() => setRemoving(item)}
                style={({ pressed }) => [local.remove, pressed && AppPressed]}
              >
                <ThemedText style={local.removeText}>{t('common.quitar')}</ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('dayChange.quePasa')}</ThemedText>
        <HanetChoice
          label={t('dayChange.quePasa')}
          options={[{ value: 'suspended', label: t('dayChange.suspensionDeClases') }, { value: 'early', label: t('dayChange.salidaAnticipada') }]}
          value={form.kind}
          onChange={kind => update({ kind: kind as Form['kind'] })}
          disabled={submitting}
        />
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{form.kind === 'suspended' ? t('dayChange.desde') : t('components.calendar.calendarBarStore.dia')}</ThemedText>
        <DateButton value={form.from} onPress={() => setPicking('from')} disabled={submitting} />
      </View>
      {form.kind === 'suspended' && (
        <View style={styles.field}>
          <ThemedText style={styles.label}>{t('anniversary.deadline.hasta')}</ThemedText>
          <DateButton value={input.to} onPress={() => setPicking('to')} disabled={submitting} />
          {input.to === input.from && <ThemedText style={styles.hint}>{t('dayChange.unSoloDiaEligeOtra')}</ThemedText>}
        </View>
      )}
      {form.kind === 'early' && (
        <View style={styles.field}>
          <ThemedText style={styles.label}>{t('dayChange.horaDeSalida')}</ThemedText>
          <View style={local.wheels}>
            <HanetTimeWheels minutes={form.endsAt} onChange={endsAt => update({ endsAt })} label={t('dayChange.horaDeSalida')} />
          </View>
          <ThemedText style={styles.hint}>{t('dayChange.lasClasesQueEmpiezanA')}</ThemedText>
        </View>
      )}

      <View style={styles.field}>
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
            <View style={local.courses}>
              {courses.map(course => (
                <HanetChip key={course} label={course} compact selected={form.courses.includes(course)} onPress={() => toggleCourse(course)} disabled={submitting} accessibilityRole="checkbox" />
              ))}
            </View>
          ) : (
            existing !== null && <ThemedText style={styles.hint}>{t('dayChange.noHayCursosEnLa')}</ThemedText>
          )
        )}
      </View>

      <TextField label={t('anniversary.points.motivo')} optional value={form.reason} onChange={reason => update({ reason })} placeholder={t('dayChange.elLiceoSeraLocalDe')} maxLength={120} disabled={submitting} />
      <ThemedText style={[styles.hint, local.reasonHint]}>{t('dayChange.loVenEstudiantesYDocentes')}</ThemedText>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: form.notify }}
        onPress={() => update({ notify: !form.notify })}
        style={({ pressed }) => [local.notify, pressed && AppPressed]}
      >
        <View style={[local.box, form.notify && local.boxOn]}>
          {form.notify && <CustomIcon name="check-circle" size={16} color={AppColors.textPrimary} />}
        </View>
        <View style={local.notifyText}>
          <ThemedText style={styles.label}>{t('dayChange.avisarAhora')}</ThemedText>
          <ThemedText style={styles.hint}>{t('dayChange.lesLlegaUnaNotificacionSi')}</ThemedText>
        </View>
      </Pressable>

      {ready && (
        <View style={local.plan} accessibilityLiveRegion="polite">
          {planning && !plan ? (
            <ThemedText style={styles.hint}>{t('dayChange.revisandoLasPruebasDeEsos')}</ThemedText>
          ) : plan ? (
            <>
              <ThemedText style={local.planTitle}>
                {t('dayChange.llegaACountPersonasValue', { count: plan.reach, value: plan.moves.length === 0 ? t('dayChange.noHayPruebasQueMover') : t('dayChange.countPruebasPasanASu', { count: plan.moves.length }) })}
              </ThemedText>
              {plan.moves.slice(0, 8).map((move, index) => (
                <ThemedText key={`${move.title}-${index}`} style={styles.hint}>
                  {move.subject}: {move.title}. {moment(move.from)} → {moment(move.to)}
                </ThemedText>
              ))}
              {plan.moves.length > 8 && <ThemedText style={styles.hint}>{t('dayChange.yMovescountMas', { movesCount: plan.moves.length - 8 })}</ThemedText>}
              {plan.unmoved.length > 0 && (
                <ThemedText style={styles.hint}>
                  {t('dayChange.countPruebasNoTienenClase', { count: plan.unmoved.length, title: plan.unmoved[0].title })}
                </ThemedText>
              )}
            </>
          ) : null}
        </View>
      )}

      <SheetActions label={label} busyLabel={t('common.guardando')} ready={ready && !submitting} busy={submitting} onSubmit={() => void submit()} error={error} />

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
    </SheetBody>
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
      style={({ pressed }) => [styles.input, local.dateButton, pressed && styles.pressed]}
    >
      <ThemedText numberOfLines={1} style={local.dateText}>{label.charAt(0).toUpperCase() + label.slice(1)}</ThemedText>
      <ThemedText style={local.dateAction}>{t('common.cambiar')}</ThemedText>
    </Pressable>
  );
}

const local = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardMeta: {
    ...AppType.caption,
    color: AppColors.textSecondary,
  },
  cardTitle: {
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  cardBody: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
  remove: {
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  removeText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  dateText: {
    flex: 1,
    ...AppType.callout,
    color: AppColors.textPrimary,
  },
  dateAction: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
  },
  wheels: {
    alignSelf: 'flex-start',
    padding: AppSpacing.sm,
    borderRadius: AppRadii.md,
    backgroundColor: AppColors.canvas,
  },
  courses: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  reasonHint: {
    marginTop: -AppSpacing.lg,
  },
  notify: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing.md,
  },
  box: {
    width: 24,
    height: 24,
    marginTop: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.canvas,
  },
  boxOn: {
    backgroundColor: AppColors.accent,
  },
  notifyText: {
    flex: 1,
    gap: 2,
  },
  plan: {
    gap: AppSpacing.xs,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  planTitle: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
});

export default withSheetFrame(DayChangeScreen, AppColors.surface);
