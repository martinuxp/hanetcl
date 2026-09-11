import { AppColors } from '@/constants/design-tokens';
import React, { useState } from 'react';
import { StyleSheet, View, ScrollView, Platform, TextInput, Alert, Pressable } from 'react-native';
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { useSession } from '@/services/auth-service';
import { db, calendarDb } from '@/services/firebase';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const params = useLocalSearchParams();
  const eventId = params.id as string;
  const isEditing = !!eventId;

  const [title, setTitle] = useState((params.title as string) || '');
  const [description, setDescription] = useState((params.description as string) || '');
  const [startDate, setStartDate] = useState(params.startDate ? new Date(params.startDate as string) : new Date());
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [subject, setSubject] = useState((params.subject as string) || 'Lengua y Literatura');
  const [eventType, setEventType] = useState((params.type as string) || 'Evaluación sumativa');
  const [location, setLocation] = useState((params.location as string) || 'Sala 304-B (P3)');
  const [loading, setLoading] = useState(false);
  const [requestVerification, setRequestVerification] = useState(false);

  const handleConfirmDate = (date: Date) => {
    setStartDate(date);
    setDatePickerVisibility(false);
  };

  const subjectsList = ['Lengua y Literatura', 'Matemáticas', 'Inglés', 'Biología', 'Química', 'Física', 'Historia', 'Filosofía', 'Artes Visuales', 'Artes Musicales', 'Tecnología', 'Educación Física', 'Religión', 'Orientación'];
  const eventTypesList = ['Evaluación sumativa', 'Evaluación formativa', 'Taller', 'Tarea', 'Remedial', 'Actividad', 'Off Topic'];

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Debes añadir al menos un título para el evento.');
      return;
    }
    if (!user) {
      Alert.alert('Error', 'Debes iniciar sesión para crear eventos.');
      return;
    }

    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) throw new Error('No se encontró el perfil de usuario.');

      const courseId = userDoc.data().courseId;
      if (!courseId) throw new Error('Tu usuario no tiene un curso vinculado.');

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

      setLoading(false);
      Alert.alert('Éxito', isEditing ? 'Evento actualizado correctamente.' : 'Evento publicado para tu curso. 📚');
      router.back();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'No se pudo guardar el evento.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={{ flex: 1, width: '100%' }}
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
        <View style={styles.separator} />

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>Fecha y hora</ThemedText>
          <TouchableRipple accessibilityRole="button" accessibilityLabel="Elegir fecha y hora" style={styles.datePickerBtn} onPress={() => setDatePickerVisibility(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <ThemedText style={styles.datePickerText}>
                {startDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })},{' '}
                {startDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </ThemedText>
              <CustomIcon name="clock" size={20} color={AppColors.textSecondary} />
            </View>
          </TouchableRipple>

          <DateTimePickerModal
            isVisible={isDatePickerVisible}
            mode="datetime"
            date={startDate}
            onConfirm={handleConfirmDate}
            onCancel={() => setDatePickerVisibility(false)}
            confirmTextIOS="Confirmar"
            cancelTextIOS="Cancelar"
            locale="es_CL"
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
              placeholder="Ej: Sala 304-B"
              placeholderTextColor="rgba(250,250,249,0.5)"
            />
            <CustomIcon name="map-pin" size={20} color={AppColors.textSecondary} />
          </View>
        </View>

        <View style={styles.modalSection}>
          <ThemedText style={styles.modalLabel}>Asignatura relacionada</ThemedText>
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
          <ThemedText style={{ fontSize: 11, color: AppColors.surface, opacity: 0.6, marginTop: 10, lineHeight: 14 }}>
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
            style={{ fontSize: 16, color: AppColors.textOnLight, minHeight: 80, borderBottomWidth: 1.5, borderBottomColor: AppColors.textOnLight, fontFamily: 'DMSans_400Regular', outlineStyle: 'none' as any }}
          />
          <ThemedText style={{ fontSize: 11, color: AppColors.surface, opacity: 0.6, marginTop: 10, lineHeight: 14 }}>
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
        <View style={styles.modalFooter}>
          <HanetButton label="Cancelar" variant="surface" onPress={() => router.back()} disabled={loading} style={styles.footerButton} />
          <HanetButton label={loading ? 'Guardando…' : (isEditing ? 'Guardar cambios' : 'Agregar')} onPress={handleSubmit} disabled={loading} style={styles.footerButton} />
        </View>
        <View style={{ height: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : 40 }} />

      </ScrollView>
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
  modalSection: { marginBottom: 20 },
  modalLabel: { color: AppColors.textOnLight, fontFamily: 'DMSans_700Bold', fontSize: 15, marginBottom: 10 },
  datePickerBtn: { backgroundColor: AppColors.surface, borderRadius: 16, flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16 },
  datePickerText: { fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary, fontSize: 13 },
  chipScroll: { gap: 10, paddingRight: 20 },
  modalFooter: { flexDirection: 'row', gap: 10, width: '100%' },
  footerButton: { flex: 1 },
});
