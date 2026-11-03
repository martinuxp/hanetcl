import { DateField, PointsFields, SheetActions, SheetBody, TextField, formStyles as styles } from '@/components/anniversary/anniversary-form';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions } from '@/components/ui/hanet-dialog';
import { HanetChoice } from '@/components/ui/hanet-select';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { ACTIVITY_GROUPS, deleteActivity, peekAnniversary, saveActivity } from '@/services/anniversary-service';
import type { ActivityGroup, ActivityMode } from '@/services/anniversary-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { t } from '@/i18n';

const MODES = [
  { value: 'podium', label: t('anniversary.activity.porLugares') },
  { value: 'manual', label: t('anniversary.activity.puntosAMano') },
];

type Form = { name: string; group: ActivityGroup; startsAt: number | null; place: string; mode: ActivityMode; points: string[]; text: string };

/** Creates or edits an activity and its point table. */
function ActivityScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const anniversary = peekAnniversary()?.anniversary;
  const places = Math.max(2, anniversary?.alliances.length ?? 4);
  const existing = id ? anniversary?.activities.find(activity => activity.id === id) : undefined;

  const [initial] = useState<Form>(() => ({
    name: existing?.name ?? '',
    group: existing?.group ?? 'previas',
    startsAt: existing?.startsAt ?? null,
    place: existing?.place ?? '',
    mode: existing?.mode ?? 'podium',
    points: existing?.points.length ? existing.points.map(String) : ['6000', '3000', '1500', '1000'].slice(0, places),
    text: existing?.text ?? '',
  }));
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const update = (patch: Partial<Form>) => { setForm(value => ({ ...value, ...patch })); setError(null); };
  const points = Array.from({ length: places }, (_, index) => Number(form.points[index] || 0));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const ready = form.name.trim().length > 0 && (form.mode === 'manual' || points.some(value => value > 0)) && dirty;

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveActivity({
        id: existing?.id,
        name: form.name.trim(),
        group: form.group,
        startsAt: form.startsAt,
        place: form.place.trim(),
        mode: form.mode,
        points: form.mode === 'podium' ? points : [],
        text: form.text.trim(),
      });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, t('anniversary.activity.noPudimosGuardarLaActividad')));
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!existing || submitting) return;
    setSubmitting(true);
    try {
      await deleteActivity(existing.id);
      allowLeave();
      setConfirming(false);
      router.back();
    } catch (deleteError) {
      setConfirming(false);
      setError(describeAuthError(deleteError, t('anniversary.activity.noPudimosBorrarLaActividad')));
      setSubmitting(false);
    }
  };

  const label = existing ? t('common.guardarCambios') : t('anniversary.activity.crearActividad');
  const { allowLeave, dialog } = useUnsavedChangesGuard({ dirty: dirty && !submitting, onSave: submit, saveLabel: label, canSave: ready });
  const modeChanged = !!existing?.result && existing.mode !== form.mode;

  return (
    <SheetBody title={existing ? t('anniversary.activity.editarActividad') : t('common.nuevaActividad')} lead={t('anniversary.activity.losPuntosDeCadaLugar')}>
      <TextField label={t('common.nombre')} value={form.name} onChange={name => update({ name })} placeholder={t('anniversary.activity.baileDeAlianza')} disabled={submitting} autoFocus={!existing} />
      <ThemedText style={styles.label}>{t('anniversary.activity.parteDelAniversario')}</ThemedText>
      <HanetChoice label={t('anniversary.activity.parteDelAniversario')} options={ACTIVITY_GROUPS} value={form.group} onChange={group => update({ group: group as ActivityGroup })} disabled={submitting} scroll />
      <DateField label={t('anniversary.activity.diaYHora')} optional value={form.startsAt} onChange={startsAt => update({ startsAt })} disabled={submitting} />
      <TextField label={t('anniversary.activity.lugar')} optional value={form.place} onChange={place => update({ place })} placeholder={t('anniversary.activity.gimnasio')} disabled={submitting} />
      <TextField label={t('common.descripcion')} optional value={form.text} onChange={text => update({ text })} placeholder={t('anniversary.activity.minimo30YMaximo50')} multiline maxLength={500} disabled={submitting} />

      <ThemedText style={styles.label}>{t('anniversary.activity.comoSePuntua')}</ThemedText>
      <HanetChoice label={t('anniversary.activity.comoSePuntua')} options={MODES} value={form.mode} onChange={mode => update({ mode: mode as ActivityMode })} disabled={submitting} />
      {form.mode === 'podium' ? (
        <PointsFields label={t('anniversary.activity.puntosPorLugar')} points={form.points} count={places} onChange={next => update({ points: next })} disabled={submitting} />
      ) : (
        <ThemedText style={styles.hint}>{t('anniversary.activity.paraLoQueSeCuenta')}</ThemedText>
      )}
      {modeChanged && <ThemedText style={styles.hint}>{t('anniversary.activity.alCambiarComoSePuntua')}</ThemedText>}

      <SheetActions label={label} busyLabel={t('common.guardando')} ready={ready} busy={submitting} onSubmit={submit} error={error} />
      {existing && <HanetButton label={t('anniversary.activity.borrarLaActividad')} variant="surface" disabled={submitting} onPress={() => setConfirming(true)} />}

      <HanetDialog
        visible={confirming}
        onRequestClose={() => setConfirming(false)}
        title={t('anniversary.activity.borrarLaActividad2')}
        body={t('anniversary.activity.tambienSeQuitanLosPuntos')}
      >
        <HanetDialogActions>
          <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => setConfirming(false)} style={local.dialogButton} />
          <HanetButton label={submitting ? t('common.borrando') : t('common.borrar')} variant="accent" disabled={submitting} onPress={remove} style={local.dialogButton} />
        </HanetDialogActions>
      </HanetDialog>
      {dialog}
    </SheetBody>
  );
}

const local = StyleSheet.create({
  dialogButton: {
    flex: 1,
  },
});

export default withSheetFrame(ActivityScreen, AppColors.surface);
