import { AUDIENCE_OPTIONS, DateField, SheetActions, SheetBody, TextField, defaultTime, formStyles as styles } from '@/components/anniversary/anniversary-form';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChoice } from '@/components/ui/hanet-select';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { deleteDeadline, peekAnniversary, saveDeadline } from '@/services/anniversary-service';
import type { Audience } from '@/services/anniversary-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform } from 'react-native';

/** A deadline for the alianzas, with a reminder a day and two hours before. */
function DeadlineScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = id ? peekAnniversary()?.anniversary?.deadlines.find(deadline => deadline.id === id) : undefined;
  const [initial] = useState(() => ({ title: existing?.title ?? '', dueAt: existing?.dueAt ?? defaultTime(), audience: existing?.audience ?? 'leads' as Audience }));
  const [form, setForm] = useState(initial);
  const [now] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<typeof form>) => { setForm(value => ({ ...value, ...patch })); setError(null); };
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const ready = form.title.trim().length > 0 && dirty;

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await action();
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, fallback));
      setSubmitting(false);
    }
  };

  const submit = () => run(() => saveDeadline({ id: existing?.id, title: form.title.trim(), dueAt: form.dueAt, audience: form.audience }), 'No pudimos guardar el plazo. Inténtalo nuevamente.');
  const label = existing ? 'Guardar cambios' : 'Crear plazo';
  const { allowLeave, dialog } = useUnsavedChangesGuard({ dirty: dirty && !submitting, onSave: submit, saveLabel: label, canSave: ready });

  return (
    <SheetBody title={existing ? 'Editar plazo' : 'Nuevo plazo'} lead="Llega un aviso un día antes y otro dos horas antes.">
      <TextField label="Qué hay que entregar" value={form.title} onChange={title => update({ title })} placeholder="Nómina de deportes" maxLength={100} disabled={submitting} autoFocus={!existing} />
      <DateField label="Hasta" value={form.dueAt} onChange={dueAt => dueAt && update({ dueAt })} disabled={submitting} />
      {form.dueAt < now && <ThemedText style={styles.hint}>Esa fecha ya pasó.</ThemedText>}
      <ThemedText style={styles.label}>Lo ven y les llega el aviso a</ThemedText>
      <HanetChoice label="A quién le llega" options={AUDIENCE_OPTIONS} value={form.audience} onChange={audience => update({ audience: audience as Audience })} disabled={submitting} />
      <SheetActions label={label} busyLabel="Guardando…" ready={ready} busy={submitting} onSubmit={() => void submit()} error={error} />
      {existing && (
        <HanetButton label="Borrar el plazo" variant="surface" disabled={submitting} onPress={() => void run(() => deleteDeadline(existing.id), 'No pudimos borrar el plazo. Inténtalo nuevamente.')} />
      )}
      {dialog}
    </SheetBody>
  );
}

export default withSheetFrame(DeadlineScreen, AppColors.surface);
