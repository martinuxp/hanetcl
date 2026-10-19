import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { HallSkeleton } from '@/components/skeletons';
import { DocumentTile, HALL_ICONS, HallHero, HallPill, HallTile, TopBarButton, daysUntil, hallDay, hallLongDate, hallStyles, startOfToday } from '@/components/classhall/hall-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetSegmented } from '@/components/ui/hanet-auth-fields';
import { HanetAvatar } from '@/components/ui/hanet-avatar';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { DocumentError, deleteHallAnnouncement, deleteHallDocument, getHall, getLoadedHall, pickHallDocument, uploadHallDocument, verifyCalendarEvent } from '@/services/classhall-service';
import type { HallAnnouncement, HallCourseEvent, HallDetail, HallDocument, HallEvaluation } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { dropCached, useCached } from '@/services/cache';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'announcements' | 'evaluations' | 'documents';

const TABS: { value: Tab; label: string; accessibilityLabel: string }[] = [
  { value: 'announcements', label: 'Anuncios', accessibilityLabel: 'Anuncios' },
  { value: 'evaluations', label: 'Evaluaciones', accessibilityLabel: 'Evaluaciones' },
  { value: 'documents', label: 'Documentos', accessibilityLabel: 'Documentos' },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase('es')).join('');
}

function shortName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  // "Monica Jeannette Campos Veloso" → "Monica Campos".
  return parts.length >= 4 ? `${parts[0]} ${parts[2]}` : parts.slice(0, 2).join(' ');
}

/** Teacher's blobatar, name with the verified mark, and the date under it. */
function Byline({ name, date, seed }: { name: string; date: string; seed?: string | null }) {
  return (
    <View style={styles.byline}>
      <HanetAvatar seed={seed} fallback={initials(name)} width={33} height={40} />
      <View style={styles.bylineText}>
        <View style={styles.nameRow}>
          <ThemedText numberOfLines={1} style={styles.name}>{shortName(name)}</ThemedText>
          <Image source={HALL_ICONS.verified} style={styles.verified} contentFit="contain" tintColor={AppColors.accent} accessibilityLabel="Docente verificado" />
        </View>
        <ThemedText style={styles.date}>{date}</ThemedText>
      </View>
    </View>
  );
}

const DOCUMENTS_NOTICE = 'Estos documentos son solo para tu clase. No los compartas salvo que tu docente lo permita.';

function AnnouncementCard({ item, attachment, canEdit, onEdit, onDelete, seed }: { item: HallAnnouncement; attachment?: HallDocument; canEdit: boolean; onEdit: () => void; onDelete: () => void; seed?: string | null }) {
  const date = item.createdAt ? hallDay(item.createdAt) : 'Ahora';
  return (
    <View style={styles.card}>
      <Byline name={item.authorName} seed={seed} date={item.updatedAt ? `${date} · editado` : date} />
      <ThemedText selectable style={styles.body}>{item.body}</ThemedText>
      {!!attachment && (
        <>
          <DocumentTile document={attachment} tone="accent" label="Archivo adjunto" />
          <ThemedText style={styles.cardNotice}>{DOCUMENTS_NOTICE}</ThemedText>
        </>
      )}
      {canEdit && (
        <View style={styles.cardActions}>
          <HallPill label="Editar" onPress={onEdit} />
          <HallPill label="Eliminar" onPress={onDelete} />
        </View>
      )}
    </View>
  );
}

function EvaluationRow({ item, onPress }: { item: HallEvaluation; onPress: () => void }) {
  const days = daysUntil(item.date);
  const past = item.date < startOfToday();
  const when = past ? 'Ya pasó' : days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${hallLongDate(item.date)}, ${when}`}
      onPress={onPress}
      style={({ pressed }) => [styles.evaluation, past && styles.evaluationPast, pressed && AppPressed]}
    >
      <View style={[styles.evaluationBadge, !past && styles.evaluationBadgeNext]}>
        <ThemedText style={[styles.evaluationDay, !past && styles.onAccent]}>{new Date(item.date).getDate()}</ThemedText>
        <ThemedText style={[styles.evaluationMonth, !past && styles.onAccent]}>{hallDay(item.date).split(' ')[1].slice(0, 3)}</ThemedText>
      </View>
      <View style={styles.evaluationText}>
        <ThemedText numberOfLines={2} style={styles.evaluationTitle}>{item.title}</ThemedText>
        <ThemedText numberOfLines={1} style={styles.evaluationMeta}>{hallLongDate(item.date)}</ThemedText>
      </View>
      <ThemedText style={styles.evaluationWhen}>{when}</ThemedText>
    </Pressable>
  );
}

function isEvaluationType(type: string) {
  return type.toLocaleLowerCase('es').startsWith('evaluaci');
}

/** An event the course put on its Calendar for this subject. */
function CourseEventRow({ item, onPress }: { item: HallCourseEvent; onPress?: () => void }) {
  const past = item.startDate < startOfToday();
  const days = daysUntil(item.startDate);
  const when = item.cancelled ? 'Cancelado' : past ? 'Ya pasó' : days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${item.title}, ${item.type ? `${item.type}, ` : ''}${hallLongDate(item.startDate)}, ${when}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.evaluation, (past || item.cancelled) && styles.evaluationPast, pressed && AppPressed]}
    >
      <View style={styles.evaluationBadge}>
        <ThemedText style={styles.evaluationDay}>{new Date(item.startDate).getDate()}</ThemedText>
        <ThemedText style={styles.evaluationMonth}>{hallDay(item.startDate).split(' ')[1].slice(0, 3)}</ThemedText>
      </View>
      <View style={styles.evaluationText}>
        <ThemedText numberOfLines={2} style={[styles.evaluationTitle, item.cancelled && styles.cancelled]}>{item.title}</ThemedText>
        <ThemedText numberOfLines={1} style={styles.evaluationMeta}>{[item.type, hallLongDate(item.startDate)].filter(Boolean).join(' · ')}</ThemedText>
        {item.verified ? (
          <ThemedText numberOfLines={1} style={styles.verifiedNote}>Confirmada por {item.verifier ?? 'un docente'}</ThemedText>
        ) : item.verificationRequested ? (
          <ThemedText numberOfLines={1} style={styles.pendingNote}>Por confirmar por un docente</ThemedText>
        ) : null}
      </View>
      <ThemedText style={styles.evaluationWhen}>{when}</ThemedText>
    </Pressable>
  );
}

export default function HallScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, initializing } = useSession();

  const [loadedDetail, setDetail] = useState<HallDetail | null>(() => (id ? getLoadedHall(id) : null));
  // What the phone kept shows until this visit's load answers, unless the
  // Hall turned out to be gone.
  const kept = useCached<HallDetail>(user && id ? `hall:${id}` : null);
  const [gone, setGone] = useState(false);
  const detail = loadedDetail ?? (gone ? null : kept) ?? null;
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('announcements');
  const [attempt, setAttempt] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<HallAnnouncement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [pendingDocument, setPendingDocument] = useState<HallDocument | null>(null);
  // A course Calendar event the teacher opened: confirm it or complete it here.
  const [courseEvent, setCourseEvent] = useState<HallCourseEvent | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  // The moment the screen opened, to tell open tasks from closed ones.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!initializing && !user) router.replace('/onboarding');
  }, [initializing, router, user]);

  // Reloads on coming back from the forms, so what was published shows up.
  useFocusEffect(useCallback(() => {
    if (!user || !id) return;
    let active = true;
    getHall(id)
      .then(result => {
        if (!active) return;
        setDetail(result);
        setError(null);
      })
      .catch(loadError => {
        if (!active) return;
        // A Hall that is gone or closed to this account stops showing what the phone kept.
        const code = (loadError as { code?: string }).code;
        if (code === 'functions/not-found' || code === 'functions/permission-denied') {
          dropCached(`hall:${id}`);
          setDetail(null);
          setGone(true);
        }
        setError(describeAuthError(loadError, 'No pudimos abrir este Hall. Inténtalo nuevamente.'));
      });
    return () => { active = false; };
    // `attempt` re-runs the load from the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id, attempt]));

  const hall = detail?.hall;
  const isTeacher = !!hall?.isTeacher;
  const upcoming = detail?.evaluations.filter(item => item.date >= startOfToday()) ?? [];
  const courseEvents = detail?.courseEvents ?? [];
  // The course's own evaluations of this subject count too: the card shows
  // whichever comes first, the Hall's or the Calendar's.
  const nextCourse = courseEvents.find(item => !item.cancelled && item.startDate >= startOfToday() && isEvaluationType(item.type));
  const hallNext = upcoming[0];
  // The tasks tile: what the student still has to hand in, or the teacher's open tasks.
  const tasks = detail?.tasks ?? [];
  const openTasks = tasks.filter(task => task.dueAt >= now);
  const toHandIn = tasks.filter(task => !task.mySubmission && (task.dueAt >= now || task.acceptLate));
  const tasksSubtitle = isTeacher
    ? (openTasks.length ? `${openTasks.length} ${openTasks.length === 1 ? 'abierta' : 'abiertas'}` : 'Publicar')
    : (toHandIn.length ? `${toHandIn.length} por entregar` : tasks.length ? 'Al día' : 'Sin tareas');
  const next = hallNext && (!nextCourse || hallNext.date <= nextCourse.startDate) ? hallNext : undefined;
  const nextFromCourse = !next ? nextCourse : undefined;

  const openEvaluation = (evaluation: HallEvaluation) =>
    router.push({ pathname: '/classhall/evaluation', params: { hallId: id, id: evaluation.id } });
  const newEvaluation = () => router.push({ pathname: '/classhall/evaluation-new', params: { hallId: id } });
  const announce = (announcementId?: string) =>
    router.push({ pathname: '/classhall/announce', params: announcementId ? { hallId: id, id: announcementId } : { hallId: id } });

  const confirmDelete = async () => {
    if (!pendingDelete || !id || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteHallAnnouncement(id, pendingDelete.id);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDetail(current => current && { ...current, announcements: current.announcements.filter(item => item.id !== pendingDelete.id) });
      setPendingDelete(null);
    } catch (removeError) {
      setDeleteError(describeAuthError(removeError, 'No pudimos eliminar el anuncio. Inténtalo nuevamente.'));
    } finally {
      setDeleting(false);
    }
  };

  // Course events open in the Calendar, which reads them with the student's
  // course; a teacher sees them listed but opens them from their own Calendar.
  const openCourseEvent = (event: HallCourseEvent) => router.push({ pathname: '/event-info', params: { id: event.id } });
  // The teacher takes a course evaluation into the Hall to complete its table.
  const adoptCourseEvent = (event: HallCourseEvent) => router.push({
    pathname: '/classhall/evaluation-new',
    params: { hallId: id, fromEvent: event.id, title: event.title, date: String(event.startDate) },
  });
  const courseEventPress = (event: HallCourseEvent) => {
    if (!isTeacher) return () => openCourseEvent(event);
    return event.cancelled ? undefined : () => { setVerifyError(null); setCourseEvent(event); };
  };

  const documents = detail?.documents ?? [];
  const attachmentOf = (announcementId: string) => documents.find(item => item.announcementId === announcementId);

  const addDocument = async () => {
    if (!id || uploading) return;
    setDocumentError(null);
    try {
      const picked = await pickHallDocument();
      if (!picked) return;
      setUploading(true);
      const added = await uploadHallDocument(id, picked);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDetail(current => current && { ...current, documents: [added, ...(current.documents ?? [])] });
    } catch (uploadError) {
      setDocumentError(uploadError instanceof DocumentError ? uploadError.message : describeAuthError(uploadError, 'No pudimos subir el documento. Inténtalo nuevamente.'));
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = async () => {
    if (!pendingDocument || !id || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteHallDocument(id, pendingDocument.id);
      setDetail(current => current && { ...current, documents: current.documents?.filter(item => item.id !== pendingDocument.id) });
      setPendingDocument(null);
    } catch (removeError) {
      setDeleteError(describeAuthError(removeError, 'No pudimos eliminar el documento. Inténtalo nuevamente.'));
    } finally {
      setDeleting(false);
    }
  };

  const confirmCourseEvent = async () => {
    if (!courseEvent || !id || verifying) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await verifyCalendarEvent(id, courseEvent.id);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const confirmed = { ...courseEvent, verified: true, verifier: result.verifier, verificationRequested: false };
      setDetail(current => current && {
        ...current,
        courseEvents: current.courseEvents?.map(item => (item.id === confirmed.id ? confirmed : item)),
      });
      setCourseEvent(null);
    } catch (confirmError) {
      setVerifyError(describeAuthError(confirmError, 'No pudimos confirmar la información. Inténtalo nuevamente.'));
    } finally {
      setVerifying(false);
    }
  };
  const nextTitle = next ? `Evaluación ${hallDay(next.date)}` : nextFromCourse ? `Evaluación ${hallDay(nextFromCourse.startDate)}` : 'Sin evaluaciones';
  const nextSubtitle = next ? 'Abrir T.E.' : nextFromCourse ? (isTeacher ? 'Revisar' : 'Ver en Calendar') : isTeacher ? 'Agendar una' : 'por ahora';
  const nextPress = next
    ? () => openEvaluation(next)
    : nextFromCourse
      ? courseEventPress(nextFromCourse)
      : isTeacher ? newEvaluation : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={hallStyles.topBar}>
          <TopBarButton icon={HALL_ICONS.back} label="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/classhall'))} />
          <Image source={HALL_ICONS.logotype} style={hallStyles.logotype} contentFit="contain" contentPosition="left" accessibilityLabel="HaNet ClassHall" />
          <TopBarButton icon={HALL_ICONS.calendar} label="Abrir el Calendar del curso" wide onPress={() => router.navigate('/calendar')} />
        </View>

        {!detail && !error && <HallSkeleton />}

        {!!error && !detail && (
          <View style={styles.card}>
            <ThemedText accessibilityLiveRegion="polite" style={styles.body}>{error}</ThemedText>
            <HallPill label="Reintentar" tone="light" onPress={() => { setError(null); setAttempt(count => count + 1); }} />
          </View>
        )}

        {hall && (
          <>
            <HallHero hall={hall} />

            <View style={styles.summary}>
              <HallTile
                icon={HALL_ICONS.tasks}
                tone="primary"
                title="Tareas"
                subtitle={tasksSubtitle}
                accessibilityLabel={`Tareas, ${tasksSubtitle}. Abrir`}
                onPress={() => router.push({ pathname: '/classhall/tasks', params: { hallId: id } })}
                compact
                style={styles.summaryTasks}
              />
              <HallTile
                icon={HALL_ICONS.warning}
                tone="accent"
                title={nextTitle}
                subtitle={nextSubtitle}
                accessibilityLabel={next
                  ? `Próxima evaluación: ${next.title}, ${hallLongDate(next.date)}. Abrir la tabla de especificaciones`
                  : nextFromCourse ? `Próxima evaluación: ${nextFromCourse.title}, ${hallLongDate(nextFromCourse.startDate)}, del Calendar del curso` : undefined}
                onPress={nextPress}
                style={styles.summaryNext}
              />
            </View>

            <View style={styles.divider} />

            <HanetSegmented options={TABS} value={tab} onChange={setTab} accessibilityLabel="Secciones del Hall" background={AppColors.surface} />

            {tab === 'announcements' && (
              <>
                {isTeacher && <HanetButton label="Publicar un anuncio" variant="surface" onPress={() => announce()} />}
                {detail.announcements.length === 0 && (
                  <View style={styles.card}>
                    <ThemedText style={styles.emptyTitle}>Sin anuncios</ThemedText>
                    <ThemedText style={styles.body}>
                      {isTeacher ? 'Lo que publiques aquí lo verán todos los estudiantes del Hall.' : 'Cuando tu docente publique algo, aparecerá aquí.'}
                    </ThemedText>
                  </View>
                )}
                {detail.announcements.map(item => (
                  <AnnouncementCard
                    key={item.id}
                    item={item}
                    attachment={attachmentOf(item.id)}
                    seed={hall.teacherAvatarSeed}
                    canEdit={isTeacher}
                    onEdit={() => announce(item.id)}
                    onDelete={() => { setDeleteError(null); setPendingDelete(item); }}
                  />
                ))}
              </>
            )}

            {tab === 'evaluations' && (
              <>
                {isTeacher && <HanetButton label="Agendar una evaluación" variant="surface" onPress={newEvaluation} />}
                {detail.evaluations.length === 0 ? (courseEvents.length === 0 && (
                  <View style={styles.card}>
                    <ThemedText style={styles.emptyTitle}>Sin evaluaciones</ThemedText>
                    <ThemedText style={styles.body}>
                      {isTeacher
                        ? 'También aparecen en el Calendar del curso, con su tabla de especificaciones.'
                        : 'Cuando tu docente agende una evaluación, verás aquí la fecha y los contenidos.'}
                    </ThemedText>
                  </View>
                )) : (
                  <View style={styles.list}>
                    {[...upcoming, ...detail.evaluations.filter(item => item.date < startOfToday()).reverse()].map(item => (
                      <EvaluationRow key={item.id} item={item} onPress={() => openEvaluation(item)} />
                    ))}
                  </View>
                )}
                {courseEvents.length > 0 && (
                  <>
                    <ThemedText style={styles.sectionLabel}>Del Calendar del curso</ThemedText>
                    {isTeacher && (
                      <ThemedText style={styles.sectionHint}>Toca un evento para confirmar su información o, si es una evaluación, completarla en tu Hall.</ThemedText>
                    )}
                    <View style={styles.list}>
                      {courseEvents.map(item => (
                        <CourseEventRow key={item.id} item={item} onPress={courseEventPress(item)} />
                      ))}
                    </View>
                  </>
                )}
                <ThemedText style={styles.finePrint}>
                  Las evaluaciones del Hall también aparecen en el Calendar del curso, y lo que el curso agende para {hall.subject} aparece aquí.
                </ThemedText>
              </>
            )}

            {tab === 'documents' && (
              <>
                {isTeacher && (
                  <HanetButton label={uploading ? 'Subiendo…' : 'Subir un documento'} variant="surface" disabled={uploading} onPress={addDocument} />
                )}
                {!!documentError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{documentError}</ThemedText>}
                {documents.length === 0 ? (
                  <View style={styles.card}>
                    <ThemedText style={styles.emptyTitle}>Sin documentos</ThemedText>
                    <ThemedText style={styles.body}>
                      {isTeacher
                        ? 'PDF, Word, PowerPoint, Excel o imagen, hasta 10 MB. Solo los ven los estudiantes del Hall.'
                        : 'Aquí estarán las guías, presentaciones y documentos que comparta tu docente.'}
                    </ThemedText>
                  </View>
                ) : documents.map(item => (
                  <View key={item.id} style={styles.card}>
                    <Byline name={item.authorName} seed={hall.teacherAvatarSeed} date={item.createdAt ? hallDay(item.createdAt) : 'Ahora'} />
                    <DocumentTile
                      document={item}
                      label={item.evaluationId ? 'Tabla de especificaciones' : item.taskId ? 'Material de tarea' : undefined}
                    />
                    {isTeacher && (
                      <View style={styles.cardActions}>
                        <HallPill label="Eliminar" onPress={() => { setDeleteError(null); setPendingDocument(item); }} />
                      </View>
                    )}
                  </View>
                ))}
                {documents.length > 0 && <ThemedText style={styles.finePrint}>{DOCUMENTS_NOTICE}</ThemedText>}
              </>
            )}

            {isTeacher && hall.plan === 'comun' && (
              <ThemedText style={styles.finePrint}>
                Plan común: todo {hall.courseId} está en este Hall · {hall.memberCount === 1 ? '1 estudiante' : `${hall.memberCount ?? 0} estudiantes`} en la nómina
              </ThemedText>
            )}
            {isTeacher && hall.plan !== 'comun' && !!hall.code && (
              <ThemedText style={styles.finePrint}>
                {hall.plan === 'dominio' ? 'Dominio' : 'Electivo'} · Código del Hall: <ThemedText style={styles.code}>{hall.code}</ThemedText> · {hall.memberCount === 1 ? '1 estudiante' : `${hall.memberCount ?? 0} estudiantes`}
              </ThemedText>
            )}
            {isTeacher && (
              <View style={styles.teacherRow}>
                <HallPill label="Editar Hall" tone="light" onPress={() => router.push({ pathname: '/classhall/create', params: { id: hall.id } })} />
              </View>
            )}
          </>
        )}
      </ScrollView>

      <HanetDialog
        visible={!!courseEvent}
        onRequestClose={() => !verifying && setCourseEvent(null)}
        dismissOnBackdrop={!verifying}
        title={courseEvent?.title}
        body={courseEvent ? [
          [courseEvent.type, hallLongDate(courseEvent.startDate)].filter(Boolean).join(' · '),
          courseEvent.authorName ? `Lo publicó ${courseEvent.authorName} en el Calendar del curso.` : 'Está en el Calendar del curso.',
          courseEvent.verified
            ? `Ya la confirmó ${courseEvent.verifier ?? 'un docente'}.`
            : courseEvent.verificationRequested
              ? 'La directiva pidió que un docente confirme esta información.'
              : 'Si está bien, confírmala para que el curso sepa que la revisaste.',
        ].join('\n\n') : undefined}
      >
        {!!verifyError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{verifyError}</ThemedText>}
        <View style={styles.dialogButtons}>
          {!!courseEvent && !courseEvent.verified && (
            <HanetButton label={verifying ? 'Confirmando…' : 'Confirmar información'} disabled={verifying} onPress={confirmCourseEvent} />
          )}
          {!!courseEvent && isEvaluationType(courseEvent.type) && (
            <HanetButton
              label="Completar en mi Hall"
              variant="surface"
              disabled={verifying}
              onPress={() => { const event = courseEvent; setCourseEvent(null); adoptCourseEvent(event); }}
            />
          )}
          <HanetButton label="Cerrar" variant="surface" disabled={verifying} onPress={() => setCourseEvent(null)} />
        </View>
      </HanetDialog>

      <HanetDialog
        visible={!!pendingDocument}
        onRequestClose={() => !deleting && setPendingDocument(null)}
        dismissOnBackdrop={!deleting}
        title="¿Eliminar este documento?"
        body={pendingDocument ? `${pendingDocument.name}. Los estudiantes del Hall dejarán de verlo${pendingDocument.announcementId ? ' y se quitará del anuncio' : ''}. No se puede deshacer.` : undefined}
      >
        {!!deleteError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{deleteError}</ThemedText>}
        <HanetDialogActions>
          <HanetButton label="Cancelar" variant="surface" disabled={deleting} onPress={() => setPendingDocument(null)} style={dialogStyles.action} />
          <HanetButton label={deleting ? 'Eliminando…' : 'Eliminar'} variant="accent" disabled={deleting} onPress={removeDocument} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>

      <HanetDialog
        visible={!!pendingDelete}
        onRequestClose={() => !deleting && setPendingDelete(null)}
        dismissOnBackdrop={!deleting}
        title="¿Eliminar este anuncio?"
        body="Los estudiantes del Hall dejarán de verlo. No se puede deshacer."
      >
        {!!deleteError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{deleteError}</ThemedText>}
        <HanetDialogActions>
          <HanetButton label="Cancelar" variant="surface" disabled={deleting} onPress={() => setPendingDelete(null)} style={dialogStyles.action} />
          <HanetButton label={deleting ? 'Eliminando…' : 'Eliminar'} variant="accent" disabled={deleting} onPress={confirmDelete} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.md,
    paddingBottom: TAB_BAR_CLEARANCE + AppSpacing.xl,
    gap: AppSpacing.md,
  },
  summary: {
    flexDirection: 'row',
    gap: 15,
    paddingVertical: 13,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  summaryTasks: {
    flex: 106,
  },
  summaryNext: {
    flex: 221,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.surfaceMuted,
  },
  card: {
    gap: AppSpacing.xl,
    padding: AppSpacing.xxl,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 33,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceRaised,
  },
  avatarText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  bylineText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flexShrink: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.63,
    color: AppColors.textPrimary,
  },
  verified: {
    width: 14,
    height: 14,
  },
  date: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: -0.35,
    color: AppColors.textPrimary,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: -0.35,
    color: AppColors.textPrimary,
  },
  cardActions: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  emptyTitle: {
    marginBottom: -AppSpacing.md,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.5,
    color: AppColors.textPrimary,
  },
  list: {
    gap: AppSpacing.sm,
  },
  evaluation: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    padding: AppSpacing.md,
    paddingRight: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  evaluationPast: {
    opacity: 0.6,
  },
  evaluationBadge: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.primary,
  },
  evaluationBadgeNext: {
    backgroundColor: AppColors.accent,
  },
  evaluationDay: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  evaluationMonth: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 14,
    color: AppColors.textPrimary,
  },
  onAccent: {
    color: AppColors.textOnLight,
  },
  evaluationText: {
    flex: 1,
    gap: 2,
  },
  evaluationTitle: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  evaluationMeta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  cancelled: {
    textDecorationLine: 'line-through',
  },
  teacherRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  verifiedNote: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  pendingNote: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.errorText,
  },
  dialogButtons: {
    gap: AppSpacing.sm,
  },
  cardNotice: {
    opacity: 0.7,
    fontFamily: 'DMSans_300Light',
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: -0.44,
    color: AppColors.textPrimary,
  },
  sectionHint: {
    marginTop: -AppSpacing.sm,
    paddingHorizontal: AppSpacing.xs,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  sectionLabel: {
    marginTop: AppSpacing.sm,
    paddingHorizontal: AppSpacing.xs,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  evaluationWhen: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  finePrint: {
    paddingHorizontal: AppSpacing.xl,
    textAlign: 'center',
    opacity: 0.7,
    fontFamily: 'DMSans_300Light',
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: -0.44,
    color: AppColors.textPrimary,
  },
  code: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    color: AppColors.textPrimary,
  },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
});
