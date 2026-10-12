import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors } from '@/constants/design-tokens';
import React, { useRef, useState } from 'react';
import { StyleSheet, View, ScrollView, Platform, TextInput, Pressable, KeyboardAvoidingView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { ensureClaims, useSession } from '@/services/auth-service';
import { db, calendarDb } from '@/services/firebase';
import { SUBJECTS, subjectName } from '@/constants/subjects';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { HanetDateTimePickerModal } from '@/components/ui/hanet-date-time-picker';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

// New events start on the next 5-minute mark, matching the picker's step.
function nextRoundedTime() {
  const date = new Date();
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
  return date;
}

// Errors whose message is already written for the person using the form.
class FormError extends Error {}

function describeSaveError(error: unknown) {
  if (error instanceof FormError) return error.message;
  if ((error as { code?: string }).code === 'permission-denied') {
    return 'Tu cuenta no tiene permiso para publicar en este curso.';
  }
  return 'No se pudo guardar el evento. Revisa tu conexión e inténtalo de nuevo.';
}

function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const params = useLocalSearchParams();
  const eventId = params.id as string;
  const isEditing = !!eventId;

  const [title, setTitle] = useState((params.title as string) || '');
  const [description, setDescription] = useState((params.description as string) || '');
  const [startDate, setStartDate] = useState(() => params.startDate ? new Date(params.startDate as string) : nextRoundedTime());
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Older events may carry another name for the same subject; the form shows the shared one.
  const [subject, setSubject] = useState(() => (params.subject ? subjectName(params.subject as string) : ''));
  const [eventType, setEventType] = useState((params.type as string) || '');
  const [location, setLocation] = useState((params.location as string) || '');
  const [loading, setLoading] = useState(false);
  const [requestVerification, setRequestVerification] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // What the form opened with; anything different is unsaved work.
  const [initial] = useState(() => ({
    title,
    description,
    start: startDate.getTime(),
    subject,
    eventType,
    location,
    requestVerification,
  }));
  const dirty =
    title !== initial.title ||
    description !== initial.description ||
    startDate.getTime() !== initial.start ||
    subject !== initial.subject ||
    eventType !== initial.eventType ||
    location !== initial.location ||
    requestVerification !== initial.requestVerification;

  const missingTitle = !title.trim();
  const missingSubject = !subject;
  const missingType = !eventType;

  // The description sits at the end of the form; once the keyboard is up,
  // bring it back into view.
  const revealDescription = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);
  };

  // The same subjects as ClassHall, so events and Halls line up.
  const subjectsList = SUBJECTS.map(item => item.name);
  const eventTypesList = ['Evaluación sumativa', 'Evaluación formativa', 'Taller', 'Tarea', 'Remedial', 'Actividad', 'Off Topic'];

  const handleSubmit = async () => {
    setSaveError(null);
    if (missingTitle || missingSubject || missingType) {
      setShowErrors(true);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!user) {
      setSaveError('Inicia sesión para publicar eventos.');
      return;
    }

    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) throw new FormError('No encontramos tu perfil de HaNet.');

      const courseId = userDoc.data().courseId;
      if (!courseId) throw new FormError('Tu HaNet ID todavía no está vinculado a un curso.');

      await ensureClaims(user);

      const endDate = new Date(startDate.getTime() + 90 * 60 * 1000); // 1.5 horas por defecto

      if (isEditing) {
        const docRef = doc(calendarDb, `HNC-LCH.${courseId}`, eventId);
        await updateDoc(docRef, {
          title: title.trim(),
          description: description.trim(),
          startDate,
          endDate,
          location: location.trim() || 'Liceo',
          subject: subject,
          type: eventType,
          verificationRequested: requestVerification,
          updatedAt: serverTimestamp(),
        });
      } else {
        const eventsRef = collection(calendarDb, `HNC-LCH.${courseId}`);
        await addDoc(eventsRef, {
          title: title.trim(),
          description: description.trim(),
          startDate,
          endDate,
          location: location.trim() || 'Liceo',
          subject: subject,
          type: eventType,
          verificationRequested: requestVerification,
          authorUid: user.uid,
          authorName: user.displayName || 'Estudiante',
          createdAt: serverTimestamp(),
        });
      }

      // The calendar reloads on focus, so the new event is the confirmation.
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (err) {
      console.error(err);
      setSaveError(describeSaveError(err));
      setLoading(false);
    }
  };

  // Swiping the sheet away, tapping outside or "Cancelar" asks first.
  const { allowLeave, dialog: discardDialog } = useUnsavedChangesGuard({
    dirty: dirty && !loading,
    onSave: handleSubmit,
    message: isEditing
      ? 'Los cambios a este evento todavía no se han guardado.'
      : 'El evento que estás creando todavía no se ha guardado.',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, width: '100%' }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustsScrollIndicatorInsets={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 30, paddingBottom: 0 }}
      >
        <View style={styles.modalHeader}>
          <Image
            source={require('@/assets/images/HanetCalendarvector.svg')}
            style={{ width: 148, height: 36, marginLeft: 5 }}
            contentFit="contain"
          />
        </View>

        <TextInput
          accessibilityLabel="Título del evento"
          placeholder="Añade un titulo"
          placeholderTextColor="rgba(62,62,58,0.6)"
          style={styles.modalTitleInput}
          value={title}
          onChangeText={setTitle}
        />
        <View style={[styles.separator, showErrors && missingTitle && styles.separatorError]} />
        {showErrors && missingTitle && <ThemedText accessibilityLiveRegion="polite" style={[styles.fieldError, styles.titleError]}>Escribe un título para el evento.</ThemedText>}

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>Fecha y hora</ThemedText>
          <TouchableRipple
            accessibilityRole="button"
            accessibilityLabel="Elegir fecha y hora"
            style={styles.datePickerBtn}
            onPress={() => setDatePickerVisibility(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <ThemedText style={styles.datePickerText}>
                {startDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })},{' '}
                {startDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </ThemedText>
              <CustomIcon name="clock" size={20} color={AppColors.textSecondary} />
            </View>
          </TouchableRipple>

          <HanetDateTimePickerModal
            visible={isDatePickerVisible}
            value={startDate}
            onConfirm={(date) => { setStartDate(date); setDatePickerVisibility(false); }}
            onCancel={() => setDatePickerVisibility(false)}
          />
        </View>

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>Ubicación</ThemedText>
          <View style={[styles.datePickerBtn, { alignItems: 'center' }]}>
            <TextInput
              accessibilityLabel="Ubicación del evento"
              style={[styles.datePickerText, { flex: 1, outlineStyle: 'none' as any }]}
              value={location}
              onChangeText={setLocation}
              placeholder="Sala o lugar (opcional)"
              placeholderTextColor="rgba(250,250,249,0.5)"
            />
            <CustomIcon name="map-pin" size={20} color={AppColors.textSecondary} />
          </View>
        </View>

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>Asignatura relacionada</ThemedText>
          {showErrors && missingSubject && <ThemedText accessibilityLiveRegion="polite" style={styles.fieldError}>Elige una asignatura.</ThemedText>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {subjectsList.map((s) => {
              const isSelected = subject === s;
              return (
                <HanetChip
                  key={s}
                  label={s}
                  selected={isSelected}
                  onPress={() => setSubject(s)}
                />
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>Tipo de evento</ThemedText>
          {showErrors && missingType && <ThemedText accessibilityLiveRegion="polite" style={styles.fieldError}>Elige un tipo de evento.</ThemedText>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {eventTypesList.map((t) => {
              const isSelected = eventType === t;
              return (
                <HanetChip
                  key={t}
                  label={t}
                  selected={isSelected}
                  onPress={() => setEventType(t)}
                />
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>Subir documentos</ThemedText>
          <HanetButton
            label="Adjuntar documentos · Próximamente"
            icon={<CustomIcon name="file-text" size={20} color={AppColors.textPrimary} />}
            onPress={() => undefined}
            disabled
            variant="surface"
          />
          <ThemedText style={{ fontSize: 12, color: AppColors.surface, opacity: 0.8, marginTop: 10, lineHeight: 16 }}>
            Formatos permitidos: PDF, Word, PowerPoint, Excel, imágenes (JPG, PNG, WEBP), video (MP4) y audio (MP3). Máx. 10 MB por archivo.
          </ThemedText>
        </View>

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>Añadir descripción</ThemedText>
          <TextInput
            accessibilityLabel="Descripción del evento"
            placeholder="Añade descripción adicional"
            placeholderTextColor="rgba(62,62,58,0.5)"
            multiline
            value={description}
            onChangeText={setDescription}
            onFocus={revealDescription}
            style={{ fontSize: 16, color: AppColors.textOnLight, minHeight: 80, borderBottomWidth: 1.5, borderBottomColor: AppColors.textOnLight, fontFamily: 'DMSans_400Regular', outlineStyle: 'none' as any }}
          />
          <ThemedText style={{ fontSize: 12, color: AppColors.surface, opacity: 0.8, marginTop: 10, lineHeight: 16 }}>
            La información que publiques podrá ser verificada por tu profesor de asignatura si es correcta, eliminada si es completamente incorrecta, o editada y verificada si requiere cambios.
          </ThemedText>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="Solicitar verificación docente"
          accessibilityState={{ checked: requestVerification }}
          onPress={() => setRequestVerification((current) => !current)}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 40 }, pressed && { opacity: 0.75 }]}
        >
          <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: requestVerification ? AppColors.accent : AppColors.surface, marginRight: 12, justifyContent: 'center', alignItems: 'center' }}>
            {requestVerification && <CustomIcon name="check-circle" size={16} color={AppColors.textPrimary} />}
          </View>
          <ThemedText style={{ flex: 1, fontSize: 13, color: AppColors.surface, lineHeight: 18, fontFamily: 'DMSans_500Medium' }}>
            Solicitar al docente de la asignatura verificar la información después de agregarla
          </ThemedText>
        </Pressable>

        {/* Action Buttons inside scroll */}
        {!!saveError && (
          <ThemedText accessibilityLiveRegion="assertive" style={styles.saveError}>{saveError}</ThemedText>
        )}
        <View style={styles.modalFooter}>
          <HanetButton label="Cancelar" variant="surface" onPress={() => router.back()} disabled={loading} style={styles.footerButton} />
          <HanetButton label={loading ? 'Guardando…' : (isEditing ? 'Guardar cambios' : 'Agregar')} onPress={handleSubmit} disabled={loading} style={styles.footerButton} />
        </View>
        <View style={{ height: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : 40 }} />

      </ScrollView>
      </KeyboardAvoidingView>
      {discardDialog}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.neutral2,
    borderTopLeftRadius: Platform.OS === 'android' ? 50 : 0,
    borderTopRightRadius: Platform.OS === 'android' ? 50 : 0,
    overflow: 'hidden',
  },
  modalHeader: { paddingTop: 0, paddingBottom: 16 },
  modalTitleInput: { fontSize: 32, fontFamily: 'DMSans_700Bold', letterSpacing: -2, color: AppColors.textOnLight, paddingBottom: 10, outlineStyle: 'none' as any },
  separator: { height: 2, backgroundColor: AppColors.textOnLight, marginBottom: 25 },
  separatorError: { backgroundColor: AppColors.accent, marginBottom: 8 },
  fieldError: { color: AppColors.errorTextOnLight, fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  titleError: { marginBottom: 17 },
  saveError: { color: AppColors.errorTextOnLight, fontFamily: 'DMSans_700Bold', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  modalSection: { marginBottom: 20 },
  modalLabel: { color: AppColors.textOnLight, fontFamily: 'DMSans_700Bold', fontSize: 15, marginBottom: 10 },
  datePickerBtn: { backgroundColor: AppColors.surface, borderRadius: 16, flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16 },
  datePickerText: { fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary, fontSize: 13 },
  chipScroll: { gap: 10, paddingRight: 20 },
  modalFooter: { flexDirection: 'row', gap: 10, width: '100%' },
  footerButton: { flex: 1 },
});

export default withSheetFrame(CreateEventScreen, AppColors.neutral2);
