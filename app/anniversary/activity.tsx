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

const MODES = [
  { value: 'podium', label: 'Por lugares' },
  { value: 'manual', label: 'Puntos a mano' },
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
      setError(describeAuthError(saveError, 'No pudimos guardar la actividad. Inténtalo nuevamente.'));
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
      setError(describeAuthError(deleteError, 'No pudimos borrar la actividad. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const label = existing ? 'Guardar cambios' : 'Crear actividad';
  const { allowLeave, dialog } = useUnsavedChangesGuard({ dirty: dirty && !submitting, onSave: submit, saveLabel: label, canSave: ready });
  const modeChanged = !!existing?.result && existing.mode !== form.mode;

  return (
    <SheetBody title={existing ? 'Editar actividad' : 'Nueva actividad'} lead="Los puntos de cada lugar se suman solos cuando pones el resultado.">
      <TextField label="Nombre" value={form.name} onChange={name => update({ name })} placeholder="Baile de alianza" disabled={submitting} autoFocus={!existing} />
      <ThemedText style={styles.label}>Parte del aniversario</ThemedText>
      <HanetChoice label="Parte del aniversario" options={ACTIVITY_GROUPS} value={form.group} onChange={group => update({ group: group as ActivityGroup })} disabled={submitting} scroll />
      <DateField label="Día y hora" optional value={form.startsAt} onChange={startsAt => update({ startsAt })} disabled={submitting} />
      <TextField label="Lugar" optional value={form.place} onChange={place => update({ place })} placeholder="Gimnasio" disabled={submitting} />
      <TextField label="Descripción" optional value={form.text} onChange={text => update({ text })} placeholder="Mínimo 30 y máximo 50 integrantes, 4 a 6 minutos." multiline maxLength={500} disabled={submitting} />

      <ThemedText style={styles.label}>Cómo se puntúa</ThemedText>
      <HanetChoice label="Cómo se puntúa" options={MODES} value={form.mode} onChange={mode => update({ mode: mode as ActivityMode })} disabled={submitting} />
      {form.mode === 'podium' ? (
        <PointsFields label="Puntos por lugar" points={form.points} count={places} onChange={next => update({ points: next })} disabled={submitting} />
      ) : (
        <ThemedText style={styles.hint}>Para lo que se cuenta (canastas, fotos, objetos): al poner el resultado escribes los puntos de cada alianza.</ThemedText>
      )}
      {modeChanged && <ThemedText style={styles.hint}>Al cambiar cómo se puntúa se borra el resultado que tenía.</ThemedText>}

      <SheetActions label={label} busyLabel="Guardando…" ready={ready} busy={submitting} onSubmit={submit} error={error} />
      {existing && <HanetButton label="Borrar la actividad" variant="surface" disabled={submitting} onPress={() => setConfirming(true)} />}

      <HanetDialog
        visible={confirming}
        onRequestClose={() => setConfirming(false)}
        title="¿Borrar la actividad?"
        body="También se quitan los puntos que dio. No se puede deshacer."
      >
        <HanetDialogActions>
          <HanetButton label="Cancelar" variant="surface" onPress={() => setConfirming(false)} style={local.dialogButton} />
          <HanetButton label={submitting ? 'Borrando…' : 'Borrar'} variant="accent" disabled={submitting} onPress={remove} style={local.dialogButton} />
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
