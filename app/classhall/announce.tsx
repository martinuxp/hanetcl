import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { ThemedText } from '@/components/themed-text';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { DocumentError, deleteHallDocument, getLoadedHall, pickHallDocument, saveHallAnnouncement, uploadHallDocument } from '@/services/classhall-service';
import type { PickedDocument } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardScroll } from '@/components/ui/keyboard';
import { t } from '@/i18n';

const MAX_LENGTH = 2000;

function AnnounceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hallId, id } = useLocalSearchParams<{ hallId: string; id?: string }>();

  // Editing starts from the text already published.
  const [initial] = useState(() => (id ? getLoadedHall(hallId)?.announcements.find(item => item.id === id)?.body ?? '' : ''));
  const [body, setBody] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One optional file per announcement; editing can replace or remove it.
  const [existing] = useState(() => (id ? getLoadedHall(hallId)?.documents?.find(item => item.announcementId === id) ?? null : null));
  const [file, setFile] = useState<PickedDocument | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const fileChanged = !!file || (removeExisting && !!existing);

  const subject = getLoadedHall(hallId)?.hall.subject;
  const ready = body.trim().length > 0 && (body !== initial || fileChanged);

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
    setSubmitting(true);
    setError(null);
    try {
      const announcementId = await saveHallAnnouncement(hallId, body, id);
      // The new file replaces any earlier one on the backend.
      if (file) await uploadHallDocument(hallId, file, { announcementId });
      else if (removeExisting && existing) await deleteHallDocument(hallId, existing.id);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, t('classhall.announce.noPudimosPublicarElAnuncio')));
      setSubmitting(false);
    }
  };

  const label = id ? t('common.guardarCambios') : t('common.publicar');
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: (body.trim() !== initial.trim() || fileChanged) && !submitting,
    onSave: submit,
    saveLabel: label,
    canSave: ready,
    title: id ? t('common.descartarLosCambios') : t('classhall.announce.descartarEsteAnuncio'),
    message: id ? t('classhall.announce.elAnuncioQuedaraComoEstaba') : t('classhall.announce.todaviaNoLoHasPublicado'),
  });

  return (
    <KeyboardScroll
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{id ? t('classhall.announce.editarAnuncio') : t('classhall.announce.nuevoAnuncio')}</ThemedText>
      <ThemedText style={styles.lead}>
        {subject ? t('classhall.announce.loVeranTodosLosEstudiantes', { subject }) : t('classhall.announce.loVeranTodosLosEstudiantes2')}
      </ThemedText>

      <TextInput
        accessibilityLabel={t('classhall.announce.anuncio')}
        value={body}
        onChangeText={(text) => { setBody(text); setError(null); }}
        placeholder={t('classhall.announce.cuestionarioDeEstudioPresentarloTerminado')}
        placeholderTextColor={AppColors.surfaceMuted}
        multiline
        maxLength={MAX_LENGTH}
        editable={!submitting}
        autoFocus={!id}
        selectionColor={AppColors.accent}
        style={[styles.input, styles.multiline]}
      />
      {body.length > MAX_LENGTH - 200 && (
        <ThemedText style={styles.hint}>{t('classhall.announce.valueCaracteresDisponibles', { value: MAX_LENGTH - body.length })}</ThemedText>
      )}

      <View style={local.attachment}>
        {file || (existing && !removeExisting) ? (
          <>
            <View style={local.attachmentText}>
              <ThemedText style={styles.label}>{t('classhall.announce.archivoAdjunto')}</ThemedText>
              <ThemedText numberOfLines={1} style={styles.hint}>{file ? file.name : existing?.name}</ThemedText>
            </View>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={chooseFile} style={({ pressed }) => [local.pill, pressed && styles.pressed]}>
              <ThemedText style={local.pillText}>{t('common.cambiar')}</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('classhall.announce.quitarElArchivoAdjunto')}
              disabled={submitting}
              onPress={() => { if (file) setFile(null); else setRemoveExisting(true); }}
              style={({ pressed }) => [local.pill, pressed && styles.pressed]}
            >
              <ThemedText style={local.pillText}>{t('common.quitar')}</ThemedText>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" disabled={submitting} onPress={chooseFile} style={({ pressed }) => [local.attach, pressed && styles.pressed]}>
            <ThemedText style={local.pillText}>{t('classhall.announce.adjuntarUnArchivoOpcional')}</ThemedText>
          </Pressable>
        )}
      </View>
      <ThemedText style={[styles.hint, local.hint]}>{t('classhall.announce.pdfWordPowerpointExcelO')}</ThemedText>

      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || submitting, busy: submitting }}
        disabled={!ready || submitting}
        onPress={submit}
        style={({ pressed }) => [styles.submit, (!ready || submitting) && styles.submitDisabled, pressed && styles.pressed]}
      >
        <ThemedText style={styles.submitText}>{submitting ? (file ? t('common.subiendo') : t('common.publicando')) : label}</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>{t('common.cancelar')}</ThemedText>
      </Pressable>
      {dialog}
    </KeyboardScroll>
  );
}

const local = StyleSheet.create({
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  attachmentText: {
    flex: 1,
  },
  attach: {
    flex: 1,
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
  hint: {
    marginTop: -AppSpacing.md,
  },
});

export default withSheetFrame(AnnounceScreen, AppColors.surface);
