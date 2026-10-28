import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { hallLongDate } from '@/components/classhall/hall-ui';
import { StatusPill, SubmissionItemRow } from '@/components/classhall/task-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetAvatar } from '@/components/ui/hanet-avatar';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { getLoadedTask, openHallDocument, reviewHallSubmission } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_FEEDBACK = 1000;

/** The teacher looks at one student's submission, marks it reviewed and can leave a comment. */
function SubmissionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hallId, taskId, uid } = useLocalSearchParams<{ hallId: string; taskId: string; uid: string }>();

  const [submission] = useState(() => getLoadedTask(hallId, taskId)?.submissions?.find(item => item.uid === uid) ?? null);
  const [feedback, setFeedback] = useState(submission?.feedback ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = feedback.trim() !== (submission?.feedback ?? '').trim();

  const save = async (reviewed: boolean) => {
    if (!submission || saving) return;
    setSaving(true);
    setError(null);
    try {
      await reviewHallSubmission(hallId, taskId, submission.uid, reviewed, feedback);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos guardar la revisión. Inténtalo nuevamente.'));
      setSaving(false);
    }
  };

  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: changed && !saving,
    onSave: () => save(true),
    saveLabel: 'Guardar y marcar revisada',
    title: '¿Descartar el comentario?',
    message: 'Todavía no lo has guardado.',
  });

  if (!submission) {
    return (
      <ScrollView style={styles.sheet} contentContainerStyle={[styles.content, { paddingTop: AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}>
        <ThemedText style={styles.title}>Entrega</ThemedText>
        <ThemedText style={styles.lead}>No encontramos esta entrega. Vuelve a la tarea e inténtalo nuevamente.</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
          <ThemedText style={styles.cancelText}>Volver</ThemedText>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={local.header}>
        <HanetAvatar seed={submission.avatarSeed} fallback={submission.studentName.slice(0, 1).toLocaleUpperCase('es')} width={48} height={58} radius={16} />
        <View style={local.headerText}>
          <ThemedText accessibilityRole="header" style={styles.title}>{submission.studentName}</ThemedText>
          <ThemedText style={styles.lead}>
            {[submission.courseId, submission.submittedAt ? `Entregó el ${hallLongDate(submission.submittedAt)}` : null].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        {submission.late && <StatusPill label="Atrasada" tone="late" />}
      </View>

      <View style={local.items}>
        {submission.items.map(item => (
          <SubmissionItemRow key={item.id} item={item} onOpen={() => void openHallDocument({ url: item.url })} />
        ))}
        {submission.items.length === 0 && <ThemedText style={styles.hint}>Esta entrega no trae archivos.</ThemedText>}
      </View>

      {!!submission.note && (
        <View style={local.note}>
          <ThemedText style={local.noteLabel}>Comentario del estudiante</ThemedText>
          <ThemedText selectable style={local.noteText}>{submission.note}</ThemedText>
        </View>
      )}

      <View style={styles.field}>
        <ThemedText style={styles.label}>Tu comentario <ThemedText style={styles.optional}>(opcional)</ThemedText></ThemedText>
        <TextInput
          accessibilityLabel="Tu comentario para el estudiante"
          value={feedback}
          onChangeText={text => { setFeedback(text); setError(null); }}
          placeholder="Bien resuelto. Revisa el ejercicio 4."
          placeholderTextColor={AppColors.surfaceMuted}
          multiline
          maxLength={MAX_FEEDBACK}
          editable={!saving}
          selectionColor={AppColors.accent}
          style={[styles.input, styles.multiline]}
        />
        <ThemedText style={styles.hint}>Solo lo ve este estudiante.</ThemedText>
      </View>

      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: saving, busy: saving }}
        disabled={saving || (submission.reviewed && !changed)}
        onPress={() => void save(true)}
        style={({ pressed }) => [styles.submit, (saving || (submission.reviewed && !changed)) && styles.submitDisabled, pressed && styles.pressed]}
      >
        <ThemedText style={styles.submitText}>
          {saving ? 'Guardando…' : submission.reviewed ? 'Guardar comentario' : 'Marcar como revisada'}
        </ThemedText>
      </Pressable>
      {submission.reviewed && (
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save(false)} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
          <ThemedText style={styles.cancelText}>Volver a «Por revisar»</ThemedText>
        </Pressable>
      )}
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>Cerrar</ThemedText>
      </Pressable>
      {dialog}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing.md,
  },
  headerText: {
    flex: 1,
    gap: AppSpacing.xs,
  },
  items: {
    gap: AppSpacing.sm,
  },
  note: {
    gap: 4,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  noteLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  noteText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: AppColors.textPrimary,
  },
});

export default withSheetFrame(SubmissionScreen, AppColors.surface);
