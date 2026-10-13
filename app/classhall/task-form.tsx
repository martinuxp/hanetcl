import { hallLongDate } from '@/components/classhall/hall-ui';
import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { ThemedText } from '@/components/themed-text';
import { HanetDateTimePickerModal } from '@/components/ui/hanet-date-time-picker';
import { HanetChoice } from '@/components/ui/hanet-select';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { DocumentError, deleteHallDocument, getLoadedTask, pickHallDocument, saveHallTask, uploadHallDocument } from '@/services/classhall-service';
import type { PickedDocument } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_INSTRUCTIONS = 3000;

type Form = { title: string; instructions: string; dueAt: number; acceptLate: boolean };

// A week from today at 23:59, the usual deadline.
function defaultDue() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 0, 0);
  return date.getTime();
}

const LATE_OPTIONS = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Sí, marcadas como atrasadas' },
];

/** The teacher publishes a task or edits one: what to do, until when and an optional file. */
function TaskFormScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hallId, id } = useLocalSearchParams<{ hallId: string; id?: string }>();

  const [loaded] = useState(() => (id ? getLoadedTask(hallId, id) : null));
  const [initial] = useState<Form>(() => (loaded
    ? { title: loaded.task.title, instructions: loaded.task.instructions, dueAt: loaded.task.dueAt, acceptLate: loaded.task.acceptLate }
    : { title: '', instructions: '', dueAt: defaultDue(), acceptLate: false }));
  const [form, setForm] = useState<Form>(initial);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());

  // One optional file with the task's material; editing can replace or remove it.
  const existing = loaded?.attachment ?? null;
  const [file, setFile] = useState<PickedDocument | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const fileChanged = !!file || (removeExisting && !!existing);

  const update = (changes: Partial<Form>) => {
    setForm(current => ({ ...current, ...changes }));
    setError(null);
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || fileChanged;
  const ready = form.title.trim().length >= 2 && dirty;
  // A new task due in the past is almost always a slip in the date.
  const pastDue = !id && form.dueAt < openedAt;

  const chooseFile = async () => {
    setError(null);
    try {
      const picked = await pickHallDocument();
      if (picked) setFile(picked);
    } catch (pickError) {
      setError(pickError instanceof DocumentError ? pickError.message : 'No pudimos abrir el archivo.');
    }
  };

  const submit = async () => {
    if (!ready || submitting) return;
    if (pastDue) {
      setError('La fecha de entrega ya pasó. Elige una fecha futura.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const taskId = await saveHallTask({ hallId, taskId: id, title: form.title, instructions: form.instructions, dueAt: form.dueAt, acceptLate: form.acceptLate });
      try {
        if (file) await uploadHallDocument(hallId, file, { taskId });
        else if (removeExisting && existing) await deleteHallDocument(hallId, existing.id);
      } catch {
        // The task is saved; the file can be added again by editing it.
      }
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos guardar la tarea. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const label = id ? 'Guardar cambios' : 'Publicar tarea';
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: dirty && !submitting,
    onSave: submit,
    saveLabel: label,
    canSave: ready && !pastDue,
    title: id ? '¿Descartar los cambios?' : '¿Descartar esta tarea?',
    message: id ? 'La tarea quedará como estaba.' : 'Todavía no la has publicado.',
  });

  const shownFile = file ? file.name : existing && !removeExisting ? existing.name : null;

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{id ? 'Editar tarea' : 'Nueva tarea'}</ThemedText>
      <ThemedText style={styles.lead}>Los estudiantes la entregan desde el Hall con archivos, fotos o vínculos. También aparece en el Calendar del curso.</ThemedText>

      <View style={styles.field}>
        <ThemedText style={styles.label}>Nombre</ThemedText>
        <TextInput
          accessibilityLabel="Nombre de la tarea"
          value={form.title}
          onChangeText={title => update({ title })}
          placeholder="Guía de ejercicios N°2"
          placeholderTextColor={AppColors.surfaceMuted}
          maxLength={80}
          editable={!submitting}
          autoFocus={!id}
          selectionColor={AppColors.accent}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>Instrucciones <ThemedText style={styles.optional}>(opcional)</ThemedText></ThemedText>
        <TextInput
          accessibilityLabel="Instrucciones"
          value={form.instructions}
          onChangeText={instructions => update({ instructions })}
          placeholder="Resolver los ejercicios 1 al 10 y subir una foto o el PDF de tu desarrollo."
          placeholderTextColor={AppColors.surfaceMuted}
          multiline
          maxLength={MAX_INSTRUCTIONS}
          editable={!submitting}
          selectionColor={AppColors.accent}
          style={[styles.input, styles.multiline]}
        />
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>Se entrega hasta</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Se entrega hasta: ${hallLongDate(form.dueAt)}. Cambiar`}
          disabled={submitting}
          onPress={() => setPicking(true)}
          style={({ pressed }) => [styles.input, local.dateButton, pressed && styles.pressed]}
        >
          <ThemedText numberOfLines={1} style={local.dateText}>{hallLongDate(form.dueAt)}</ThemedText>
          <ThemedText style={local.dateAction}>Cambiar</ThemedText>
        </Pressable>
        {pastDue && <ThemedText style={styles.hint}>Esa fecha ya pasó.</ThemedText>}
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>¿Recibir entregas atrasadas?</ThemedText>
        <HanetChoice
          label="¿Recibir entregas atrasadas?"
          options={LATE_OPTIONS}
          value={form.acceptLate ? 'yes' : 'no'}
          onChange={value => update({ acceptLate: value === 'yes' })}
          disabled={submitting}
        />
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>Material <ThemedText style={styles.optional}>(opcional)</ThemedText></ThemedText>
        {shownFile ? (
          <View style={local.attachment}>
            <ThemedText numberOfLines={1} style={local.attachmentName}>{shownFile}</ThemedText>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={chooseFile} style={({ pressed }) => [local.pill, pressed && styles.pressed]}>
              <ThemedText style={local.pillText}>Cambiar</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quitar el material"
              disabled={submitting}
              onPress={() => { if (file) setFile(null); else setRemoveExisting(true); }}
              style={({ pressed }) => [local.pill, pressed && styles.pressed]}
            >
              <ThemedText style={local.pillText}>Quitar</ThemedText>
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" disabled={submitting} onPress={chooseFile} style={({ pressed }) => [local.attach, pressed && styles.pressed]}>
            <ThemedText style={local.pillText}>Adjuntar una guía o archivo</ThemedText>
          </Pressable>
        )}
        <ThemedText style={styles.hint}>PDF, Word, PowerPoint, Excel o imagen, hasta 10 MB. También aparece en Documentos.</ThemedText>
      </View>

      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || submitting, busy: submitting }}
        disabled={!ready || submitting}
        onPress={submit}
        style={({ pressed }) => [styles.submit, (!ready || submitting) && styles.submitDisabled, pressed && styles.pressed]}
      >
        <ThemedText style={styles.submitText}>{submitting ? 'Guardando…' : label}</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
      </Pressable>

      <HanetDateTimePickerModal
        visible={picking}
        value={new Date(form.dueAt)}
        onCancel={() => setPicking(false)}
        onConfirm={date => { setPicking(false); update({ dueAt: date.getTime() }); }}
      />
      {dialog}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  dateText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  dateAction: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  attachmentName: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  attach: {
    minHeight: AppTouch.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  pill: {
    minHeight: AppTouch.minimum - 4,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  pillText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
});

export default withSheetFrame(TaskFormScreen, AppColors.surface);
