import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { ThemedText } from '@/components/themed-text';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppSpacing } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { getLoadedHall, saveHallAnnouncement } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

  const subject = getLoadedHall(hallId)?.hall.subject;
  const ready = body.trim().length > 0 && body !== initial;

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveHallAnnouncement(hallId, body, id);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos publicar el anuncio. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const label = id ? 'Guardar cambios' : 'Publicar';
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: body.trim() !== initial.trim() && !submitting,
    onSave: submit,
    saveLabel: label,
    canSave: ready,
    title: id ? '¿Descartar los cambios?' : '¿Descartar este anuncio?',
    message: id ? 'El anuncio quedará como estaba.' : 'Todavía no lo has publicado.',
  });

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{id ? 'Editar anuncio' : 'Nuevo anuncio'}</ThemedText>
      <ThemedText style={styles.lead}>
        {subject ? `Lo verán todos los estudiantes del Hall de ${subject}.` : 'Lo verán todos los estudiantes del Hall.'}
      </ThemedText>

      <TextInput
        accessibilityLabel="Anuncio"
        value={body}
        onChangeText={(text) => { setBody(text); setError(null); }}
        placeholder="Cuestionario de estudio. Presentarlo terminado en el cuaderno el lunes."
        placeholderTextColor={AppColors.surfaceMuted}
        multiline
        maxLength={MAX_LENGTH}
        editable={!submitting}
        autoFocus={!id}
        selectionColor={AppColors.accent}
        style={[styles.input, styles.multiline]}
      />
      {body.length > MAX_LENGTH - 200 && (
        <ThemedText style={styles.hint}>{MAX_LENGTH - body.length} caracteres disponibles</ThemedText>
      )}

      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || submitting, busy: submitting }}
        disabled={!ready || submitting}
        onPress={submit}
        style={({ pressed }) => [styles.submit, (!ready || submitting) && styles.submitDisabled, pressed && styles.pressed]}
      >
        <ThemedText style={styles.submitText}>{submitting ? 'Publicando…' : label}</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
      </Pressable>
      {dialog}
    </ScrollView>
  );
}

export default withSheetFrame(AnnounceScreen, AppColors.surface);
