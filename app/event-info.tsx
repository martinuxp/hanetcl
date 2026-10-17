import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { EventDetailSkeleton } from '@/components/skeletons';
import { AlertModal } from '@/components/ui/alert-modal';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, ScrollView, Platform, Linking, Alert, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDateTimePicker } from '@/components/ui/hanet-date-time-picker';
import { EVENT_EDITOR_ROLES, describeAuthError, ensureClaims, useRole, useSession } from '@/services/auth-service';
import { db } from '@/services/firebase';
import {
  deleteCalendarEvent,
  fetchCalendarEvent,
  formatDuration,
  formatLongDate,
  formatTime,
  getLoadedCalendarEvent,
  rescheduleCalendarEvent,
  setCalendarEventCancelled,
} from '@/services/ical-service';
import type { CalendarEvent } from '@/services/ical-service';
import { listMyHalls, verifyCalendarEvent } from '@/services/classhall-service';
import type { Hall } from '@/services/classhall-service';
import { sameSubject, subjectName } from '@/constants/subjects';
import { doc, getDoc } from 'firebase/firestore';

const ICONS = {
  date: require('@/assets/icons/event/calendar.svg'),
  duration: require('@/assets/icons/event/timer.svg'),
  location: require('@/assets/icons/event/map-pin.svg'),
  type: require('@/assets/icons/event/book-lock.svg'),
  subject: require('@/assets/icons/event/translate.svg'),
  description: require('@/assets/icons/event/message-text.svg'),
  verified: require('@/assets/icons/event/badge-check.svg'),
};

const ICAL_HOST = 'us-central1-hanet-edu.cloudfunctions.net/icalFeed';

type EventParams = {
  id?: string;
  canEdit?: string;
};

export default function EventInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, initializing } = useSession();
  const params = useLocalSearchParams<EventParams>();

  const [icalModalVisible, setIcalModalVisible] = useState(false);
  const [courseIdState, setCourseIdState] = useState<string | null>(null);

  const [event, setEvent] = useState<CalendarEvent | null>(() => (params.id ? getLoadedCalendarEvent(params.id) ?? null : null));
  const [loading, setLoading] = useState(!event && !!params.id);

  // The calendar passes a hint so the buttons do not pop in; the token is
  // what actually decides, and the rules enforce it either way.
  const role = useRole();
  // A teacher's evaluation from ClassHall is changed only in its Hall.
  const canEdit = !event?.hallId && (role ? EVENT_EDITOR_ROLES.includes(role) : params.canEdit === '1');
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // "Cancelar o cambiar evento": a menu first, then the date step if chosen.
  const [manageStep, setManageStep] = useState<'closed' | 'menu' | 'date'>('closed');
  const [draftDate, setDraftDate] = useState(() => new Date());
  const [managing, setManaging] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  // Coming back from the edit form: show what was just saved.
  const eventId = event?.id;
  useFocusEffect(
    useCallback(() => {
      if (!eventId || !user) return;
      let active = true;
      (async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const courseId = userDoc.data()?.courseId as string | undefined;
          if (!courseId) return;
          const fresh = await fetchCalendarEvent(courseId, eventId);
          if (active && fresh) setEvent(fresh);
        } catch (e) {
          console.error(e);
        }
      })();
      return () => { active = false; };
    }, [eventId, user])
  );

  // Opened without going through the calendar (a reload or a direct link):
  // read the event from the user's course.
  useEffect(() => {
    if (event || !params.id || initializing || !user) return;

    let active = true;
    (async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const courseId = userDoc.data()?.courseId as string | undefined;
        if (!courseId) return;
        await ensureClaims(user);
        const loaded = await fetchCalendarEvent(courseId, params.id as string);
        if (active) setEvent(loaded);
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [event, initializing, params.id, user]);

  const isEvaluation = event?.eventType?.toLocaleLowerCase().startsWith('evaluación') ?? false;

  // The Hall of this subject, when the viewer is in one: Calendar and
  // ClassHall share the subject list, so an event leads to its class.
  const [halls, setHalls] = useState<Hall[] | null>(null);
  const eventSubject = event?.subject;
  useEffect(() => {
    if (!user || !eventSubject) return;
    let active = true;
    listMyHalls()
      .then(result => { if (active) setHalls(result.halls); })
      .catch(() => {});
    return () => { active = false; };
  }, [user, eventSubject]);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const subjectHall = event && halls
    ? halls.find(hall => hall.id === event.hallId) ?? halls.find(hall => sameSubject(hall.subject, event.subject))
    : undefined;
  const confirmInfo = async () => {
    if (!event || !subjectHall || verifying) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await verifyCalendarEvent(subjectHall.id, event.id);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEvent({ ...event, verified: true, verifier: result.verifier, verificationRequested: false });
    } catch (confirmError) {
      setVerifyError(describeAuthError(confirmError, 'No pudimos confirmar la información. Inténtalo nuevamente.'));
    } finally {
      setVerifying(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/calendar');
  };

  const getCourseId = async (purpose: string) => {
    if (!user) {
      Alert.alert('Inicia sesión', `Necesitas una sesión activa para ${purpose}.`);
      return null;
    }
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const courseId = userDoc.data()?.courseId as string | undefined;
    if (!courseId) {
      Alert.alert('Error', 'No tienes un curso vinculado a tu HaNet ID.');
      return null;
    }
    return courseId;
  };

  const handleOpenIcalMenu = async () => {
    try {
      const courseId = await getCourseId('consultar la fuente iCal de tu curso');
      if (!courseId) return;
      setCourseIdState(courseId);
      setIcalModalVisible(true);
    } catch (e) {
      console.error(e);
    }
  };

  const copyIcalToClipboard = async () => {
    if (!courseIdState) return;
    await Clipboard.setStringAsync(`https://${ICAL_HOST}?courseId=${encodeURIComponent(courseIdState)}`);
    setIcalModalVisible(false);
    setTimeout(() => {
      Alert.alert('Copiado', 'Enlace de suscripción iCal copiado al portapapeles.');
    }, 500);
  };

  const handleSubscribe = async () => {
    try {
      const courseId = await getCourseId('suscribirte al calendario de tu curso');
      if (!courseId) return;

      const query = `?courseId=${encodeURIComponent(courseId)}`;
      if (Platform.OS === 'android') {
        await Linking.openURL(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`https://${ICAL_HOST}${query}`)}`);
      } else {
        await Linking.openURL(`webcal://${ICAL_HOST}${query}`);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Hubo un error al abrir el calendario.');
    }
  };

  const handleEdit = () => {
    router.push({
      pathname: '/create-event',
      params: {
        id: event?.id,
        title: event?.title,
        description: event?.description,
        startDate: event?.startDate.toISOString(),
        subject: event?.subject,
        type: event?.eventType,
        location: event?.location,
      },
    });
  };

  const openManage = () => {
    if (!event) return;
    setDraftDate(event.startDate);
    setManageError(null);
    setManageStep('menu');
  };

  const closeManage = () => {
    if (managing) return;
    setManageStep('closed');
    setManageError(null);
  };

  // Runs one change on the event and shows the saved result.
  const applyChange = async (change: (courseId: string) => Promise<CalendarEvent | null>) => {
    if (!event || !user) return;
    setManaging(true);
    setManageError(null);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const courseId = userDoc.data()?.courseId as string | undefined;
      if (!courseId) throw new Error('missing-course');
      await ensureClaims(user);
      const updated = await change(courseId);
      if (updated) setEvent(updated);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setManageStep('closed');
    } catch (e) {
      console.error(e);
      setManageError((e as { code?: string }).code === 'permission-denied'
        ? 'Tu cuenta no tiene permiso para cambiar este evento.'
        : 'No se pudo guardar el cambio. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setManaging(false);
    }
  };

  const saveNewDate = () => applyChange(courseId => rescheduleCalendarEvent(courseId, event as CalendarEvent, draftDate));
  const toggleCancelled = () => applyChange(courseId => setCalendarEventCancelled(courseId, (event as CalendarEvent).id, !(event as CalendarEvent).cancelled));

  const closeDelete = () => {
    if (deleting) return;
    setDeleteVisible(false);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!event || !user) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const courseId = userDoc.data()?.courseId as string | undefined;
      if (!courseId) throw new Error('missing-course');
      await ensureClaims(user);
      await deleteCalendarEvent(courseId, event.id);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDeleteVisible(false);
      goBack();
    } catch (e) {
      console.error(e);
      setDeleteError((e as { code?: string }).code === 'permission-denied'
        ? 'Tu cuenta no tiene permiso para eliminar eventos de este curso.'
        : 'No se pudo eliminar el evento. Revisa tu conexión e inténtalo de nuevo.');
      setDeleting(false);
    }
  };

  if (initializing || (loading && user)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.skeleton}><EventDetailSkeleton /></View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={[styles.container, styles.missing]}>
        <ThemedText style={styles.missingTitle}>Evento no disponible</ThemedText>
        <ThemedText style={styles.missingText}>Vuelve al calendario y ábrelo de nuevo.</ThemedText>
        <HanetButton label="Volver al calendario" onPress={goBack} style={styles.missingButton} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 132 }]}
      >
        <View style={styles.topBar}>
          <ThemedText style={styles.topBarDate} numberOfLines={1}>{formatLongDate(event.startDate)}</ThemedText>
        </View>

        <ThemedText accessibilityRole="header" style={[styles.title, event.cancelled && styles.titleCancelled]}>
          {event.title}
        </ThemedText>
        {event.cancelled && <ThemedText style={styles.cancelledNote}>Este evento fue cancelado.</ThemedText>}

        <View style={styles.card}>
          <InfoRow icon={ICONS.date} label="Fecha" value={formatLongDate(event.startDate)} />
          {/* A task has no duration: it is handed in until that time. */}
          {event.taskId ? (
            <InfoRow icon={ICONS.duration} label="Se entrega hasta" value={formatTime(event.startDate)} />
          ) : (
            <InfoRow
              icon={ICONS.duration}
              label="Duración"
              value={`${formatTime(event.startDate)} - ${formatTime(event.endDate)} (${formatDuration(event.startDate, event.endDate)})`}
            />
          )}
          {!!event.location && <InfoRow icon={ICONS.location} label="Ubicación" value={event.location} />}
          {!!event.eventType && (
            <InfoRow icon={ICONS.type} label={isEvaluation ? 'Tipo de evaluación' : 'Tipo de evento'} value={event.eventType} />
          )}
          {!!event.subject && <InfoRow icon={ICONS.subject} label="Asignatura relacionada" value={subjectName(event.subject)} />}
          {!!event.description && <InfoRow icon={ICONS.description} label="Descripción" value={event.description} />}

          <View style={styles.cardActions}>
            {event.hallId && event.taskId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Abre la tarea en su Hall"
                onPress={() => router.push({ pathname: '/classhall/task', params: { hallId: event.hallId, id: event.taskId } })}
                style={({ pressed }) => [styles.actionButton, styles.actionButtonTall, pressed && styles.pressed]}
              >
                <ThemedText style={styles.actionLabel}>Tarea</ThemedText>
                <ThemedText style={styles.actionSoon}>Abrir y entregar en ClassHall</ThemedText>
              </Pressable>
            ) : event.hallId && event.evaluationId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Abre la evaluación en su Hall"
                onPress={() => router.push({ pathname: '/classhall/evaluation', params: { hallId: event.hallId, id: event.evaluationId } })}
                style={({ pressed }) => [styles.actionButton, styles.actionButtonTall, pressed && styles.pressed]}
              >
                <ThemedText style={styles.actionLabel}>Tabla de especificaciones</ThemedText>
                <ThemedText style={styles.actionSoon}>Abrir en ClassHall</ThemedText>
              </Pressable>
            ) : (
              <ComingSoonButton label="Tabla de especificaciones" tall />
            )}
            <ComingSoonButton label="Ir a los documentos de la clase" dark />
          </View>

          <ThemedText style={styles.finePrint}>
            Evento generado y conectado al HaNet Calendar del curso.
          </ThemedText>
        </View>

        {!!event.writer && !event.hallId && (
          <View style={styles.attribution}>
            <CustomIcon name="check-circle" size={21} color={AppColors.textSecondary} />
            <View style={styles.attributionText}>
              <ThemedText style={styles.attributionLabel}>Info. escrita por un miembro de la directiva:</ThemedText>
              <ThemedText style={styles.attributionName}>{event.writer}</ThemedText>
            </View>
          </View>
        )}

        {!event.verified && event.verificationRequested && (
          <ThemedText style={styles.pendingNote}>Pendiente de confirmación por un docente.</ThemedText>
        )}

        {event.verified && !!event.verifier && (
          <View style={styles.attribution}>
            <Image source={ICONS.verified} style={styles.badge} contentFit="contain" />
            <View style={styles.attributionText}>
              <ThemedText style={styles.attributionLabel}>Info. verificada por un docente:</ThemedText>
              <ThemedText style={styles.attributionName}>{event.verifier}</ThemedText>
            </View>
          </View>
        )}

        <ThemedText style={styles.finePrint}>
          La información publicada por miembros de la directiva puede no ser oficial. La información verificada por tus profesores está indicada con un verificado azul.
        </ThemedText>

        <View style={styles.secondaryActions}>
          {!!subjectHall?.isTeacher && !event.hallId && !event.verified && !event.cancelled && (
            <HanetButton label={verifying ? 'Confirmando…' : 'Confirmar información'} onPress={confirmInfo} disabled={verifying} />
          )}
          {!!verifyError && <ThemedText accessibilityLiveRegion="assertive" style={styles.pendingNote}>{verifyError}</ThemedText>}
          {!!subjectHall?.isTeacher && !event.hallId && isEvaluation && !event.cancelled && (
            <HanetButton
              label="Completar en ClassHall"
              accessibilityHint="Pasa esta evaluación a tu Hall para agregar su tabla de especificaciones"
              onPress={() => router.push({
                pathname: '/classhall/evaluation-new',
                params: { hallId: subjectHall.id, fromEvent: event.id, title: event.title, date: String(event.startDate.getTime()) },
              })}
            />
          )}
          {!!subjectHall && (
            <HanetButton
              label={`Ir al Hall de ${subjectHall.subject}`}
              variant="surface"
              onPress={() => router.push({ pathname: '/classhall/hall', params: { id: subjectHall.id } })}
            />
          )}
          {canEdit && (
            <HanetButton label="Editar información" variant="surface" onPress={handleEdit} />
          )}
          {canEdit && (
            <HanetButton label="Cancelar o cambiar evento" variant="surface" onPress={openManage} />
          )}
          <HanetButton
            label="Suscribir mi calendario (iCal)"
            variant="surface"
            icon={<CustomIcon name="calendar" size={18} color={AppColors.textPrimary} />}
            onPress={handleSubscribe}
          />
          <Pressable accessibilityRole="button" onPress={handleOpenIcalMenu} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
            <ThemedText style={styles.linkText}>Copiar fuente iCal</ThemedText>
          </Pressable>
          {canEdit && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Eliminar evento"
              accessibilityHint="Pide confirmación antes de eliminar"
              onPress={() => setDeleteVisible(true)}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
            >
              <ThemedText style={styles.deleteText}>Eliminar evento</ThemedText>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <AlertModal visible={manageStep !== 'closed'} onRequestClose={closeManage}>
        <View style={styles.modalOverlay}>
          <Pressable accessibilityLabel="Cerrar sin cambios" style={StyleSheet.absoluteFill} onPress={closeManage} />
          <View accessibilityViewIsModal style={styles.deleteCard}>
            {manageStep === 'date' ? (
              <>
                <ThemedText style={styles.deleteTitle}>Nueva fecha y hora</ThemedText>
                <ThemedText style={styles.deleteBody}>La duración del evento se mantiene.</ThemedText>
                <HanetDateTimePicker value={draftDate} onChange={setDraftDate} style={styles.managePicker} />
                {!!manageError && <ThemedText accessibilityLiveRegion="assertive" style={styles.deleteErrorText}>{manageError}</ThemedText>}
                <View style={styles.deleteActions}>
                  <HanetButton label="Atrás" variant="surface" onPress={() => setManageStep('menu')} disabled={managing} style={styles.deleteAction} />
                  <HanetButton label={managing ? 'Guardando…' : 'Guardar'} onPress={saveNewDate} disabled={managing} style={styles.deleteAction} />
                </View>
              </>
            ) : (
              <>
                <ThemedText style={styles.deleteTitle}>Cancelar o cambiar evento</ThemedText>
                <ThemedText style={styles.deleteBody}>
                  {event.cancelled
                    ? 'Este evento está cancelado. Puedes reactivarlo o moverlo a otra fecha.'
                    : 'Mueve el evento a otra fecha o márcalo como cancelado. El curso lo verá de inmediato.'}
                </ThemedText>
                {!!manageError && <ThemedText accessibilityLiveRegion="assertive" style={styles.deleteErrorText}>{manageError}</ThemedText>}
                <View style={styles.manageOptions}>
                  <HanetButton label="Cambiar fecha y hora" onPress={() => setManageStep('date')} disabled={managing} />
                  <HanetButton
                    label={managing ? 'Guardando…' : event.cancelled ? 'Reactivar evento' : 'Cancelar evento'}
                    variant="accent"
                    onPress={toggleCancelled}
                    disabled={managing}
                  />
                  <HanetButton label="Cerrar" variant="surface" onPress={closeManage} disabled={managing} />
                </View>
              </>
            )}
          </View>
        </View>
      </AlertModal>

      <AlertModal visible={deleteVisible} onRequestClose={closeDelete}>
        <View style={styles.modalOverlay}>
          <Pressable accessibilityLabel="Cerrar sin eliminar" style={StyleSheet.absoluteFill} onPress={closeDelete} />
          <View accessibilityViewIsModal style={styles.deleteCard}>
            <ThemedText style={styles.deleteTitle}>¿Eliminar este evento?</ThemedText>
            <ThemedText style={styles.deleteBody}>
              {`"${event.title}" se borrará del calendario de todo el curso. No se puede deshacer.`}
            </ThemedText>
            {!!deleteError && (
              <ThemedText accessibilityLiveRegion="assertive" style={styles.deleteErrorText}>{deleteError}</ThemedText>
            )}
            <View style={styles.deleteActions}>
              <HanetButton label="Cancelar" variant="surface" onPress={closeDelete} disabled={deleting} style={styles.deleteAction} />
              <HanetButton label={deleting ? 'Eliminando…' : 'Eliminar'} variant="accent" onPress={handleDelete} disabled={deleting} style={styles.deleteAction} />
            </View>
          </View>
        </View>
      </AlertModal>

      <AlertModal visible={icalModalVisible} onRequestClose={() => setIcalModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <CustomIcon name="calendar" size={24} color={AppColors.textOnLight} />
            <View style={styles.modalTextSection}>
              <ThemedText style={styles.modalTitle}>Añadir calendario iCal</ThemedText>
              <ThemedText style={styles.modalSubtitle}>
                {`Al copiar la fuente iCal de "HNC - ${courseIdState || ''}", podrás suscribir el calendario a cualquier aplicación o servicio compatible sin depender de HaNet Calendar.`}
              </ThemedText>
            </View>
            <HanetButton label="Copiar al portapapeles" onPress={copyIcalToClipboard} />
            <HanetButton label="Volver atrás" variant="surface" onPress={() => setIcalModalVisible(false)} />
          </View>
        </View>
      </AlertModal>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: number; label: string; value: string }) {
  return (
    <View style={styles.infoRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Image source={icon} style={styles.icon} contentFit="contain" />
      <View style={styles.infoText}>
        <ThemedText style={styles.infoLabel}>{label}</ThemedText>
        <ThemedText style={styles.infoValue}>{value}</ThemedText>
      </View>
    </View>
  );
}

// Both actions depend on ClassHall, which does not exist yet.
function ComingSoonButton({ label, tall, dark }: { label: string; tall?: boolean; dark?: boolean }) {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}, próximamente`}
      accessibilityState={{ disabled: true }}
      style={[styles.actionButton, tall && styles.actionButtonTall, dark && styles.actionButtonDark]}
    >
      <ThemedText style={[styles.actionLabel, dark && styles.actionLabelDark]}>{label}</ThemedText>
      <ThemedText style={[styles.actionSoon, dark && styles.actionLabelDark]}>Próximamente</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pendingNote: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.errorText,
  },
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.md,
    gap: 15,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    padding: AppSpacing.md,
  },
  topBarDate: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textSecondary,
  },
  icon: {
    width: 24,
    height: 24,
  },
  title: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontFamily: 'DMSans_700Bold',
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.8,
    color: AppColors.textSecondary,
  },
  titleCancelled: {
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
  cancelledNote: {
    paddingHorizontal: 10,
    marginTop: -10,
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  card: {
    padding: AppSpacing.xxl,
    gap: AppSpacing.xl,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 15,
  },
  infoText: {
    flex: 1,
    gap: 10,
  },
  infoLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 16,
    letterSpacing: -0.35,
    color: AppColors.textSecondary,
  },
  infoValue: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: -0.56,
    color: AppColors.textSecondary,
  },
  cardActions: {
    gap: AppSpacing.xl,
  },
  actionButton: {
    height: 58,
    paddingHorizontal: AppSpacing.xl,
    borderRadius: AppRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.controlActive,
    opacity: 0.55,
  },
  actionButtonTall: {
    height: 100,
  },
  actionButtonDark: {
    backgroundColor: AppColors.primary,
  },
  actionLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    textAlign: 'center',
    color: AppColors.controlOnActive,
  },
  actionLabelDark: {
    color: AppColors.textPrimary,
  },
  actionSoon: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.controlOnActive,
  },
  finePrint: {
    alignSelf: 'center',
    maxWidth: 309,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: -0.2,
    textAlign: 'center',
    color: AppColors.textPrimary,
    opacity: 0.7,
  },
  attribution: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    maxWidth: 309,
  },
  badge: {
    width: 21,
    height: 21,
  },
  attributionText: {
    flexShrink: 1,
    opacity: 0.7,
  },
  attributionLabel: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.52,
    color: AppColors.textPrimary,
  },
  attributionName: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.52,
    color: AppColors.textPrimary,
  },
  secondaryActions: {
    marginTop: AppSpacing.md,
    gap: AppSpacing.sm,
  },
  linkButton: {
    minHeight: AppTouch.minimum,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.md,
  },
  linkText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    textDecorationLine: 'underline',
    color: AppColors.textSecondary,
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.6,
  },
  deleteButton: {
    minHeight: AppTouch.minimum,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    marginTop: AppSpacing.sm,
  },
  deleteText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.accent,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 380,
    padding: AppSpacing.xl,
    gap: AppSpacing.sm,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  deleteTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  deleteBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  deleteErrorText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.errorText,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.md,
  },
  deleteAction: {
    flex: 1,
  },
  manageOptions: {
    gap: AppSpacing.sm,
    marginTop: AppSpacing.md,
  },
  managePicker: {
    marginTop: AppSpacing.sm,
    padding: 0,
  },
  skeleton: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: AppSpacing.md,
    paddingTop: 64 + AppSpacing.md,
  },
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.xl,
    gap: AppSpacing.sm,
  },
  missingTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 26,
    color: AppColors.textPrimary,
  },
  missingText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: AppColors.textSecondary,
  },
  missingButton: {
    marginTop: AppSpacing.md,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: AppSpacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    padding: AppSpacing.xxl,
    gap: AppSpacing.md,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceSoft,
  },
  modalTextSection: {
    gap: 6,
    paddingBottom: AppSpacing.sm,
  },
  modalTitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textOnLight,
  },
  modalSubtitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: -0.35,
    color: AppColors.textOnLight,
    opacity: 0.8,
  },
});
