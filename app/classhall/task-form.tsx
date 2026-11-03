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
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardScroll } from '@/components/ui/keyboard';
import { t } from '@/i18n';

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
  { value: 'no', label: t('classhall.taskForm.no') },
  { value: 'yes', label: t('classhall.taskForm.siMarcadasComoAtrasadas') },
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
      setError(pickError instanceof DocumentError ? pickError.message : t('common.noPudimosAbrirElArchivo'));
    }
  };

  const submit = async () => {
    if (!ready || submitting) return;
    if (pastDue) {
      setError(t('classhall.taskForm.laFechaDeEntregaYa'));
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
      setError(describeAuthError(saveError, t('classhall.taskForm.noPudimosGuardarLaTarea')));
      setSubmitting(false);
    }
  };

  const label = id ? t('common.guardarCambios') : t('classhall.taskForm.publicarTarea');
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: dirty && !submitting,
    onSave: submit,
    saveLabel: label,
    canSave: ready && !pastDue,
    title: id ? t('common.descartarLosCambios') : t('classhall.taskForm.descartarEstaTarea'),
    message: id ? t('classhall.taskForm.laTareaQuedaraComoEstaba') : t('classhall.taskForm.todaviaNoLaHasPublicado'),
  });

  const shownFile = file ? file.name : existing && !removeExisting ? existing.name : null;

  return (
    <KeyboardScroll
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{id ? t('classhall.taskForm.editarTarea') : t('classhall.taskForm.nuevaTarea')}</ThemedText>
      <ThemedText style={styles.lead}>{t('classhall.taskForm.tusEstudiantesLaEntreganEn')}</ThemedText>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('common.nombre')}</ThemedText>
        <TextInput
          accessibilityLabel={t('classhall.taskForm.nombreDeLaTarea')}
          value={form.title}
          onChangeText={title => update({ title })}
          placeholder={t('classhall.taskForm.guiaDeEjerciciosN2')}
          placeholderTextColor={AppColors.surfaceMuted}
          maxLength={80}
          editable={!submitting}
          autoFocus={!id}
          selectionColor={AppColors.accent}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('classhall.taskForm.instrucciones')}{' '}<ThemedText style={styles.optional}>{t('common.opcional')}</ThemedText></ThemedText>
        <TextInput
          accessibilityLabel={t('classhall.taskForm.instrucciones')}
          value={form.instructions}
          onChangeText={instructions => update({ instructions })}
          placeholder={t('classhall.taskForm.resolverLosEjercicios1Al')}
          placeholderTextColor={AppColors.surfaceMuted}
          multiline
          maxLength={MAX_INSTRUCTIONS}
          editable={!submitting}
          selectionColor={AppColors.accent}
          style={[styles.input, styles.multiline]}
        />
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('classhall.taskForm.seEntregaHasta')}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('classhall.taskForm.seEntregaHastaHalllongdateCambiar', { hallLongDate: hallLongDate(form.dueAt) })}
          disabled={submitting}
          onPress={() => setPicking(true)}
          style={({ pressed }) => [styles.input, local.dateButton, pressed && styles.pressed]}
        >
          <ThemedText numberOfLines={1} style={local.dateText}>{hallLongDate(form.dueAt)}</ThemedText>
          <ThemedText style={local.dateAction}>{t('common.cambiar')}</ThemedText>
        </Pressable>
        {pastDue && <ThemedText style={styles.hint}>{t('anniversary.deadline.esaFechaYaPaso')}</ThemedText>}
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('classhall.taskForm.recibirEntregasAtrasadas')}</ThemedText>
        <HanetChoice
          label={t('classhall.taskForm.recibirEntregasAtrasadas')}
          options={LATE_OPTIONS}
          value={form.acceptLate ? 'yes' : 'no'}
          onChange={value => update({ acceptLate: value === 'yes' })}
          disabled={submitting}
        />
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('classhall.taskForm.material')}{' '}<ThemedText style={styles.optional}>{t('common.opcional')}</ThemedText></ThemedText>
        {shownFile ? (
          <View style={local.attachment}>
            <ThemedText numberOfLines={1} style={local.attachmentName}>{shownFile}</ThemedText>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={chooseFile} style={({ pressed }) => [local.pill, pressed && styles.pressed]}>
              <ThemedText style={local.pillText}>{t('common.cambiar')}</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('classhall.taskForm.quitarElMaterial')}
              disabled={submitting}
              onPress={() => { if (file) setFile(null); else setRemoveExisting(true); }}
              style={({ pressed }) => [local.pill, pressed && styles.pressed]}
            >
              <ThemedText style={local.pillText}>{t('common.quitar')}</ThemedText>
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" disabled={submitting} onPress={chooseFile} style={({ pressed }) => [local.attach, pressed && styles.pressed]}>
            <ThemedText style={local.pillText}>{t('classhall.taskForm.adjuntarUnaGuiaOArchivo')}</ThemedText>
          </Pressable>
        )}
        <ThemedText style={styles.hint}>{t('classhall.announce.pdfWordPowerpointExcelO')}</ThemedText>
      </View>

      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || submitting, busy: submitting }}
        disabled={!ready || submitting}
        onPress={submit}
        style={({ pressed }) => [styles.submit, (!ready || submitting) && styles.submitDisabled, pressed && styles.pressed]}
      >
        <ThemedText style={styles.submitText}>{submitting ? t('common.guardando') : label}</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>{t('common.cancelar')}</ThemedText>
      </Pressable>

      <HanetDateTimePickerModal
        visible={picking}
        value={new Date(form.dueAt)}
        onCancel={() => setPicking(false)}
        onConfirm={date => { setPicking(false); update({ dueAt: date.getTime() }); }}
      />
      {dialog}
    </KeyboardScroll>
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
