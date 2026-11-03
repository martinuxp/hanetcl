import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors } from '@/constants/design-tokens';
import React, { useRef, useState } from 'react';
import { StyleSheet, View, Platform, TextInput, Pressable, type ScrollViewInstance } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { ensureClaims, useClaimCourse, useSession } from '@/services/auth-service';
import { db, calendarDb } from '@/services/firebase';
import { SUBJECTS, isUpperLevel, subjectName } from '@/constants/subjects';
import { HanetChoice } from '@/components/ui/hanet-select';
import { collection, addDoc, deleteField, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDateTimePickerModal } from '@/components/ui/hanet-date-time-picker';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { KeyboardScroll } from '@/components/ui/keyboard';
import { t } from '@/i18n';

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
    return t('createEvent.tuCuentaNoTienePermiso');
  }
  return t('createEvent.noPudimosGuardarElEvento');
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
  const scrollRef = useRef<ScrollViewInstance>(null);
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

  // The same subjects as ClassHall, so events and Halls line up. Dominios
  // (plan diferenciado) only exist in 3° and 4° medio.
  const courseId = useClaimCourse();
  const upper = isUpperLevel(courseId);
  const subjectsList = SUBJECTS
    .filter(item => item.plans.includes('comun') || item.plans.includes('electivo') || upper || item.name === subject)
    .map(item => item.name);
  // The event types are saved as written (and read by the widgets and alerts): they're data, not labels.
  // i18n-ignore-next-line
  const eventTypesList = ['Evaluación sumativa', 'Evaluación formativa', 'Taller', 'Tarea', 'Remedial', 'Actividad', 'Otro'];

  const handleSubmit = async () => {
    setSaveError(null);
    if (missingTitle || missingSubject || missingType) {
      setShowErrors(true);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!user) {
      setSaveError(t('createEvent.iniciaSesionParaPublicarEventos'));
      return;
    }

    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) throw new FormError(t('createEvent.noEncontramosTuPerfilDe'));

      const courseId = userDoc.data().courseId;
      if (!courseId) throw new FormError(t('common.tuHanetIdTodaviaNo'));

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
          // Changed information has to be confirmed again by a teacher.
          verified: false,
          verifier: deleteField(),
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
      ? t('createEvent.losCambiosAEsteEvento')
      : t('createEvent.elEventoQueEstasCreando'),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardScroll
        ref={scrollRef}
        style={{ flex: 1, width: '100%' }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
          accessibilityLabel={t('createEvent.tituloDelEvento')}
          placeholder={t('createEvent.anadeUnTitulo')}
          placeholderTextColor="rgba(62,62,58,0.6)"
          style={styles.modalTitleInput}
          value={title}
          onChangeText={setTitle}
        />
        <View style={[styles.separator, showErrors && missingTitle && styles.separatorError]} />
        {showErrors && missingTitle && <ThemedText accessibilityLiveRegion="polite" style={[styles.fieldError, styles.titleError]}>{t('createEvent.escribeUnTituloParaEl')}</ThemedText>}

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>{t('createEvent.fechaYHora')}</ThemedText>
          <TouchableRipple
            accessibilityRole="button"
            accessibilityLabel={t('createEvent.elegirFechaYHora')}
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
          <ThemedText style={styles.modalLabel}>{t('createEvent.ubicacion')}</ThemedText>
          <View style={[styles.datePickerBtn, { alignItems: 'center' }]}>
            <TextInput
              accessibilityLabel={t('createEvent.ubicacionDelEvento')}
              style={[styles.datePickerText, { flex: 1, outlineStyle: 'none' as any }]}
              value={location}
              onChangeText={setLocation}
              placeholder={t('createEvent.salaOLugarOpcional')}
              placeholderTextColor="rgba(250,250,249,0.5)"
            />
            <CustomIcon name="map-pin" size={20} color={AppColors.textSecondary} />
          </View>
        </View>

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>{t('createEvent.asignaturaRelacionada')}</ThemedText>
          {showErrors && missingSubject && <ThemedText accessibilityLiveRegion="polite" style={styles.fieldError}>{t('createEvent.eligeUnaAsignatura')}</ThemedText>}
          <HanetChoice
            label={t('createEvent.asignaturaRelacionada')}
            options={subjectsList.map(name => ({ value: name, label: name }))}
            value={subject || null}
            onChange={setSubject}
            scroll
          />
        </View>

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>{t('common.tipoDeEvento')}</ThemedText>
          {showErrors && missingType && <ThemedText accessibilityLiveRegion="polite" style={styles.fieldError}>{t('createEvent.eligeUnTipoDeEvento')}</ThemedText>}
          <HanetChoice
            label={t('common.tipoDeEvento')}
            options={eventTypesList.map(name => ({ value: name, label: name }))}
            value={eventType || null}
            onChange={setEventType}
            scroll
          />
        </View>

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>{t('createEvent.subirDocumentos')}</ThemedText>
          <HanetButton
            label={t('createEvent.adjuntarDocumentosProximamente')}
            icon={<CustomIcon name="file-text" size={20} color={AppColors.textPrimary} />}
            onPress={() => undefined}
            disabled
            variant="surface"
          />
        </View>

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>{t('createEvent.anadirDescripcion')}</ThemedText>
          <TextInput
            accessibilityLabel={t('createEvent.descripcionDelEvento')}
            placeholder={t('createEvent.queHayQueSaberO')}
            placeholderTextColor="rgba(62,62,58,0.5)"
            multiline
            value={description}
            onChangeText={setDescription}
            onFocus={revealDescription}
            style={{ fontSize: 16, color: AppColors.textOnLight, minHeight: 80, borderBottomWidth: 1.5, borderBottomColor: AppColors.textOnLight, fontFamily: 'DMSans_400Regular', outlineStyle: 'none' as any }}
          />
          <ThemedText style={{ fontSize: 12, color: AppColors.surface, opacity: 0.8, marginTop: 10, lineHeight: 16 }}>
            {t('createEvent.unDocentePuedeConfirmarCorregir')}
          </ThemedText>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={t('createEvent.solicitarVerificacionDocente')}
          accessibilityState={{ checked: requestVerification }}
          onPress={() => setRequestVerification((current) => !current)}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 40 }, pressed && { opacity: 0.75 }]}
        >
          <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: requestVerification ? AppColors.accent : AppColors.surface, marginRight: 12, justifyContent: 'center', alignItems: 'center' }}>
            {requestVerification && <CustomIcon name="check-circle" size={16} color={AppColors.textPrimary} />}
          </View>
          <ThemedText style={{ flex: 1, fontSize: 13, color: AppColors.surface, lineHeight: 18, fontFamily: 'DMSans_500Medium' }}>
            {t('createEvent.pedirQueElDocenteDe')}
          </ThemedText>
        </Pressable>

        {/* Action Buttons inside scroll */}
        {!!saveError && (
          <ThemedText accessibilityLiveRegion="assertive" style={styles.saveError}>{saveError}</ThemedText>
        )}
        <View style={styles.modalFooter}>
          <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => router.back()} disabled={loading} style={styles.footerButton} />
          <HanetButton label={loading ? t('common.guardando') : (isEditing ? t('common.guardarCambios') : t('common.agregar'))} onPress={handleSubmit} disabled={loading} style={styles.footerButton} />
        </View>
        <View style={{ height: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : 40 }} />

      </KeyboardScroll>
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
  modalFooter: { flexDirection: 'row', gap: 10, width: '100%' },
  footerButton: { flex: 1 },
});

export default withSheetFrame(CreateEventScreen, AppColors.neutral2);
