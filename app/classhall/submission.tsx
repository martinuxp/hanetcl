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
import { KeyboardScroll } from '@/components/ui/keyboard';
import { t } from '@/i18n';

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
      setError(describeAuthError(saveError, t('classhall.submission.noPudimosGuardarLaRevision')));
      setSaving(false);
    }
  };

  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: changed && !saving,
    onSave: () => save(true),
    saveLabel: t('classhall.submission.guardarYMarcarRevisada'),
    title: t('classhall.submission.descartarElComentario'),
    message: t('classhall.submission.todaviaNoLoHasGuardado'),
  });

  if (!submission) {
    return (
      <ScrollView style={styles.sheet} contentContainerStyle={[styles.content, { paddingTop: AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}>
        <ThemedText style={styles.title}>{t('classhall.submission.entrega')}</ThemedText>
        <ThemedText style={styles.lead}>{t('classhall.submission.noEncontramosEstaEntregaVuelve')}</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
          <ThemedText style={styles.cancelText}>{t('common.volver')}</ThemedText>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardScroll
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={local.header}>
        <HanetAvatar seed={submission.avatarSeed} fallback={submission.studentName.slice(0, 1).toLocaleUpperCase('es')} width={48} height={58} radius={16} />
        <View style={local.headerText}>
          <ThemedText accessibilityRole="header" style={styles.title}>{submission.studentName}</ThemedText>
          <ThemedText style={styles.lead}>
            {[submission.courseId, submission.submittedAt ? t('classhall.submission.entregoElHalllongdate', { hallLongDate: hallLongDate(submission.submittedAt) }) : null].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        {submission.late && <StatusPill label={t('common.atrasada')} tone="late" />}
      </View>

      <View style={local.items}>
        {submission.items.map(item => (
          <SubmissionItemRow key={item.id} item={item} onOpen={() => void openHallDocument({ url: item.url })} />
        ))}
        {submission.items.length === 0 && <ThemedText style={styles.hint}>{t('classhall.submission.estaEntregaNoTraeArchivos')}</ThemedText>}
      </View>

      {!!submission.note && (
        <View style={local.note}>
          <ThemedText style={local.noteLabel}>{t('classhall.submission.comentarioDelEstudiante')}</ThemedText>
          <ThemedText selectable style={local.noteText}>{submission.note}</ThemedText>
        </View>
      )}

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('classhall.submission.tuComentario')}{' '}<ThemedText style={styles.optional}>{t('common.opcional')}</ThemedText></ThemedText>
        <TextInput
          accessibilityLabel={t('classhall.submission.tuComentarioParaElEstudiante')}
          value={feedback}
          onChangeText={text => { setFeedback(text); setError(null); }}
          placeholder={t('classhall.submission.bienResueltoRevisaElEjercicio')}
          placeholderTextColor={AppColors.surfaceMuted}
          multiline
          maxLength={MAX_FEEDBACK}
          editable={!saving}
          selectionColor={AppColors.accent}
          style={[styles.input, styles.multiline]}
        />
        <ThemedText style={styles.hint}>{t('classhall.submission.soloLoVeEsteEstudiante')}</ThemedText>
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
          {saving ? t('common.guardando') : submission.reviewed ? t('classhall.submission.guardarComentario') : t('classhall.submission.marcarComoRevisada')}
        </ThemedText>
      </Pressable>
      {submission.reviewed && (
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save(false)} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
          <ThemedText style={styles.cancelText}>{t('classhall.submission.volverAPorRevisar')}</ThemedText>
        </Pressable>
      )}
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>{t('common.cerrar')}</ThemedText>
      </Pressable>
      {dialog}
    </KeyboardScroll>
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
