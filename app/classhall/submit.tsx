import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { SubmissionItemRow, dueLabel } from '@/components/classhall/task-ui';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { DocumentError, cleanSubmissionLink, getLoadedTask, pickHallDocument, pickSubmissionPhoto, submitHallTask } from '@/services/classhall-service';
import type { PendingFile } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardScroll } from '@/components/ui/keyboard';

const MAX_ITEMS = 6;
const MAX_NOTE = 1000;

type Link = { url: string; name: string };

// iOS cannot present a picker while a dialog is still leaving.
const afterDialog = () => new Promise(resolve => setTimeout(resolve, Platform.OS === 'ios' ? 400 : 0));

/** One of the three ways to add something: a tile with an icon and a word. */
function AddOption({ icon, label, onPress, disabled }: { icon: 'file-text' | 'camera' | 'link'; label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Agregar ${label.toLocaleLowerCase('es')}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [local.option, disabled && styles.submitDisabled, pressed && styles.pressed]}
    >
      <CustomIcon name={icon} size={24} color={AppColors.textPrimary} />
      <ThemedText style={local.optionLabel}>{label}</ThemedText>
    </Pressable>
  );
}

/**
 * The submission sheet: the student gathers files, photos and links, adds a
 * comment if they want and hands the task in. Editing starts from what they
 * already handed in.
 */
function SubmitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hallId, taskId } = useLocalSearchParams<{ hallId: string; taskId: string }>();

  const [loaded] = useState(() => getLoadedTask(hallId, taskId));
  const previous = loaded?.mySubmission ?? null;
  const [keep, setKeep] = useState<string[]>(() => previous?.items.map(item => item.id) ?? []);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [note, setNote] = useState(previous?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [choosingPhoto, setChoosingPhoto] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const submitting = !!progress;

  const kept = previous?.items.filter(item => keep.includes(item.id)) ?? [];
  const count = kept.length + files.length + links.length;
  const full = count >= MAX_ITEMS;
  const changed = files.length > 0 || links.length > 0 || kept.length !== (previous?.items.length ?? 0) || note.trim() !== (previous?.note ?? '').trim();
  const ready = (count > 0 || !!note.trim()) && (changed || !previous);
  const [openedAt] = useState(() => Date.now());
  const late = !!loaded && openedAt > loaded.task.dueAt;

  const addFile = (file: PendingFile) => {
    setFiles(list => [...list, file]);
    setError(null);
  };

  const chooseFile = async () => {
    setError(null);
    try {
      const picked = await pickHallDocument();
      if (picked) addFile(picked);
    } catch (pickError) {
      setError(pickError instanceof DocumentError ? pickError.message : 'No pudimos abrir el archivo.');
    }
  };

  const choosePhoto = async (source: 'camera' | 'library') => {
    setChoosingPhoto(false);
    setError(null);
    await afterDialog();
    try {
      const photo = await pickSubmissionPhoto(source);
      if (photo) addFile(photo);
    } catch (pickError) {
      setError(pickError instanceof DocumentError ? pickError.message : 'No pudimos abrir la foto.');
    }
  };

  const addLink = () => {
    const url = cleanSubmissionLink(linkText);
    if (!url) {
      setLinkError('Eso no parece una dirección web. Cópiala completa, por ejemplo docs.google.com/…');
      return;
    }
    if (links.some(link => link.url === url) || kept.some(item => item.kind === 'link' && item.url === url)) {
      setLinkError('Ese vínculo ya está en tu entrega.');
      return;
    }
    setLinks(list => [...list, { url, name: new URL(url).hostname.replace(/^www\./, '') + new URL(url).pathname.replace(/\/$/, '') }]);
    setLinkText('');
    setLinkError(null);
    setAddingLink(false);
    setError(null);
  };

  const submit = async () => {
    if (!ready || submitting) return;
    setError(null);
    setProgress({ done: 0, total: files.length });
    try {
      await submitHallTask({
        hallId,
        taskId,
        keep,
        files,
        links: links.map(link => ({ url: link.url })),
        note,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProgress(null);
      allowLeave();
      router.back();
    } catch (submitError) {
      setProgress(null);
      setError(submitError instanceof DocumentError ? submitError.message : describeAuthError(submitError, 'No pudimos entregar la tarea. Revisa tu conexión e inténtalo nuevamente.'));
    }
  };

  const label = previous ? 'Actualizar entrega' : 'Entregar';
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: changed && !submitting,
    onSave: submit,
    saveLabel: label,
    canSave: ready,
    title: previous ? '¿Descartar los cambios?' : '¿Descartar esta entrega?',
    message: previous ? 'Tu entrega quedará como estaba.' : 'Todavía no has entregado la tarea.',
  });

  return (
    <KeyboardScroll
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{previous ? 'Editar entrega' : 'Entregar tarea'}</ThemedText>
      {!!loaded && (
        <ThemedText style={styles.lead}>
          {loaded.task.title} · {dueLabel(loaded.task.dueAt, openedAt)}{late ? '. Quedará marcada como atrasada.' : '.'}
        </ThemedText>
      )}

      <View style={local.options}>
        <AddOption icon="file-text" label="Archivo" disabled={full || submitting} onPress={() => void chooseFile()} />
        <AddOption icon="camera" label="Foto" disabled={full || submitting} onPress={() => { setError(null); setChoosingPhoto(true); }} />
        <AddOption icon="link" label="Vínculo" disabled={full || submitting} onPress={() => { setError(null); setLinkError(null); setAddingLink(true); }} />
      </View>
      <ThemedText style={[styles.hint, local.hint]}>
        {full ? `Llegaste al máximo de ${MAX_ITEMS} archivos o vínculos.` : 'PDF, Word, PowerPoint, Excel o imagen, hasta 10 MB cada uno. Vínculos a Drive, Canva, YouTube u otros.'}
      </ThemedText>

      {count > 0 ? (
        <View style={local.items}>
          {kept.map(item => (
            <SubmissionItemRow key={item.id} item={item} disabled={submitting} onRemove={() => setKeep(list => list.filter(id => id !== item.id))} />
          ))}
          {files.map((file, index) => (
            <SubmissionItemRow
              key={`${file.uri}-${index}`}
              item={{ kind: 'file', name: file.name, fileKind: file.mimeType.startsWith('image/') ? 'image' : file.mimeType === 'application/pdf' ? 'pdf' : 'file', size: file.size }}
              disabled={submitting}
              onRemove={() => setFiles(list => list.filter((_, at) => at !== index))}
            />
          ))}
          {links.map((link, index) => (
            <SubmissionItemRow key={link.url} item={{ kind: 'link', name: link.name }} disabled={submitting} onRemove={() => setLinks(list => list.filter((_, at) => at !== index))} />
          ))}
        </View>
      ) : (
        <View style={local.empty}>
          <ThemedText style={local.emptyText}>Todavía no has agregado nada. Sube un archivo, una foto o un vínculo.</ThemedText>
        </View>
      )}

      <View style={styles.field}>
        <ThemedText style={styles.label}>Comentario para tu docente <ThemedText style={styles.optional}>(opcional)</ThemedText></ThemedText>
        <TextInput
          accessibilityLabel="Comentario para tu docente"
          value={note}
          onChangeText={text => { setNote(text); setError(null); }}
          placeholder="Por ejemplo, qué parte te costó."
          placeholderTextColor={AppColors.surfaceMuted}
          multiline
          maxLength={MAX_NOTE}
          editable={!submitting}
          selectionColor={AppColors.accent}
          style={[styles.input, local.note]}
        />
      </View>

      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || submitting, busy: submitting }}
        disabled={!ready || submitting}
        onPress={submit}
        style={({ pressed }) => [styles.submit, (!ready || submitting) && styles.submitDisabled, pressed && styles.pressed]}
      >
        <ThemedText style={styles.submitText}>{label}</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
      </Pressable>

      <HanetDialog visible={choosingPhoto} onRequestClose={() => setChoosingPhoto(false)} dismissOnBackdrop title="Agregar una foto" body="Para tareas en el cuaderno o en papel: que se vea toda la hoja, con buena luz.">
        <View style={local.dialogButtons}>
          {Platform.OS !== 'web' && <HanetButton label="Tomar foto" onPress={() => void choosePhoto('camera')} />}
          <HanetButton label="Elegir de la galería" variant={Platform.OS === 'web' ? 'primary' : 'surface'} onPress={() => void choosePhoto('library')} />
          <HanetButton label="Cancelar" variant="surface" onPress={() => setChoosingPhoto(false)} />
        </View>
      </HanetDialog>

      <HanetDialog visible={addingLink} onRequestClose={() => setAddingLink(false)} title="Agregar un vínculo" body="Si es un documento de Google, Canva u otro, revisa que tu docente pueda abrirlo.">
        <TextInput
          accessibilityLabel="Dirección del vínculo"
          value={linkText}
          onChangeText={text => { setLinkText(text); setLinkError(null); }}
          placeholder="https://docs.google.com/…"
          placeholderTextColor={AppColors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          autoFocus
          onSubmitEditing={addLink}
          returnKeyType="done"
          selectionColor={AppColors.accent}
          style={local.linkInput}
        />
        {!!linkError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{linkError}</ThemedText>}
        <HanetDialogActions>
          <HanetButton label="Cancelar" variant="surface" onPress={() => setAddingLink(false)} style={dialogStyles.action} />
          <HanetButton label="Agregar" disabled={!linkText.trim()} onPress={addLink} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>

      <HanetDialog visible={submitting} onRequestClose={() => {}}>
        <View style={local.loading}>
          <ActivityIndicator size="large" color={AppColors.textPrimary} />
          <ThemedText accessibilityLiveRegion="polite" style={local.loadingTitle}>
            {progress && progress.done < progress.total ? `Subiendo ${progress.done + 1} de ${progress.total}…` : 'Entregando…'}
          </ThemedText>
          <ThemedText style={local.loadingText}>No cierres la app hasta que termine.</ThemedText>
        </View>
      </HanetDialog>
      {dialog}
    </KeyboardScroll>
  );
}

const local = StyleSheet.create({
  options: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  optionLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: AppColors.textPrimary,
  },
  hint: {
    marginTop: -AppSpacing.sm,
  },
  items: {
    gap: AppSpacing.sm,
  },
  empty: {
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: AppColors.surfaceMuted,
  },
  emptyText: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  note: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  dialogButtons: {
    gap: AppSpacing.sm,
  },
  linkInput: {
    minHeight: 48,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    color: AppColors.textPrimary,
  },
  loading: {
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.md,
  },
  loadingTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  loadingText: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
});

export default withSheetFrame(SubmitScreen, AppColors.surface);
