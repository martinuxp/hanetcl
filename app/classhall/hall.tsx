import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { BlockEditor } from '@/components/schedule/block-editor';
import { HallSkeleton } from '@/components/skeletons';
import { StudentGrades } from '@/components/classhall/grades-ui';
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
import { SCHEDULE_DAYS, minutesOf, saveHallSchedule } from '@/services/schedule-service';
import type { ScheduleBlock } from '@/services/schedule-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { dropCached, useCached } from '@/services/cache';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { t } from '@/i18n';

type Tab = 'announcements' | 'evaluations' | 'documents';

const TABS: { value: Tab; label: string; accessibilityLabel: string }[] = [
  { value: 'announcements', label: t('classhall.hall.anuncios'), accessibilityLabel: t('classhall.hall.anuncios') },
  { value: 'evaluations', label: t('classhall.hall.evaluaciones'), accessibilityLabel: t('classhall.hall.evaluaciones') },
  { value: 'documents', label: t('classhall.hall.documentos'), accessibilityLabel: t('classhall.hall.documentos') },
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
          <Image source={HALL_ICONS.verified} style={styles.verified} contentFit="contain" tintColor={AppColors.accent} accessibilityLabel={t('classhall.hall.docenteVerificado')} />
        </View>
        <ThemedText style={styles.date}>{date}</ThemedText>
      </View>
    </View>
  );
}

/**
 * The Hall's days and hours. An electivo or dominio keeps its own, which its
 * teacher edits; a plan común Hall shows its subject's blocks of the course.
 */
function HallSchedule({ hallId, subject, blocks, canEdit, fromCourse, onSaved }: { hallId: string; subject: string; blocks: ScheduleBlock[]; canEdit: boolean; fromCourse: boolean; onSaved: (blocks: ScheduleBlock[]) => void }) {
  // The block open in the editor: its position, or null for a new one.
  const [open, setOpen] = useState<number | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sorted = blocks.map((block, index) => ({ block, index })).sort((a, b) => a.block.day - b.block.day || minutesOf(a.block.start) - minutesOf(b.block.start));

  const save = async (next: ScheduleBlock[]) => {
    setSaving(true);
    setError(null);
    try {
      onSaved((await saveHallSchedule(hallId, next)).map(block => ({ ...block, subject })));
      setOpen(undefined);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (saveError) {
      setError(describeAuthError(saveError, t('classhall.hall.noPudimosGuardarElHorario')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.scheduleCard}>
      <ThemedText style={styles.sectionLabel}>{t('common.horario')}</ThemedText>
      {fromCourse && sorted.length > 0 && <ThemedText style={styles.sectionHint}>{t('classhall.hall.vieneDelHorarioDelCurso')}</ThemedText>}
      {sorted.length === 0 && (
        <ThemedText style={styles.sectionHint}>
          {fromCourse ? t('classhall.hall.todaviaNoEstaEnEl') : canEdit ? t('classhall.hall.agregaLosDiasYHoras') : t('classhall.hall.tuDocenteTodaviaNoHa')}
        </ThemedText>
      )}
      {sorted.map(({ block, index }) => {
        const dayName = SCHEDULE_DAYS.find(item => item.day === block.day)?.name ?? '';
        return (
          <Pressable
            key={block.id}
            accessibilityRole={canEdit ? 'button' : undefined}
            accessibilityLabel={`${dayName}, ${block.start} a ${block.end}${block.room ? `, ${block.room}` : ''}`}
            accessibilityHint={canEdit ? t('classhall.hall.editarElBloque') : undefined}
            disabled={!canEdit}
            onPress={() => setOpen(index)}
            style={({ pressed }) => [styles.scheduleRow, pressed && AppPressed]}
          >
            <ThemedText style={styles.scheduleDay}>{dayName}</ThemedText>
            <ThemedText style={styles.scheduleTime}>{block.start} – {block.end}{block.room ? ` · ${block.room}` : ''}</ThemedText>
          </Pressable>
        );
      })}
      {canEdit && <HallPill label={t('classhall.hall.agregarBloque')} onPress={() => setOpen(null)} />}
      {open !== undefined && (
        <BlockEditor
          block={open !== null ? blocks[open] : null}
          day={1}
          others={blocks.filter((_, position) => position !== open)}
          hallSubject={subject}
          saving={saving}
          error={error}
          onSave={block => void save(open !== null ? blocks.map((item, position) => (position === open ? block : item)) : [...blocks, block])}
          onRemove={() => void save(blocks.filter((_, position) => position !== open))}
          onClose={() => { setError(null); setOpen(undefined); }}
        />
      )}
    </View>
  );
}

const DOCUMENTS_NOTICE = t('classhall.hall.estosDocumentosSonSoloPara');

function AnnouncementCard({ item, attachment, canEdit, onEdit, onDelete, seed }: { item: HallAnnouncement; attachment?: HallDocument; canEdit: boolean; onEdit: () => void; onDelete: () => void; seed?: string | null }) {
  const date = item.createdAt ? hallDay(item.createdAt) : t('common.ahora');
  return (
    <View style={styles.card}>
      <Byline name={item.authorName} seed={seed} date={item.updatedAt ? t('classhall.hall.dateEditado', { date }) : date} />
      <ThemedText selectable style={styles.body}>{item.body}</ThemedText>
      {!!attachment && (
        <>
          <DocumentTile document={attachment} tone="accent" label={t('classhall.announce.archivoAdjunto')} />
          <ThemedText style={styles.cardNotice}>{DOCUMENTS_NOTICE}</ThemedText>
        </>
      )}
      {canEdit && (
        <View style={styles.cardActions}>
          <HallPill label={t('common.editar')} onPress={onEdit} />
          <HallPill label={t('common.eliminar')} onPress={onDelete} />
        </View>
      )}
    </View>
  );
}

function EvaluationRow({ item, onPress }: { item: HallEvaluation; onPress: () => void }) {
  const days = daysUntil(item.date);
  const past = item.date < startOfToday();
  const when = past ? t('classhall.hall.yaPaso') : days === 0 ? t('common.hoy2') : t('classhall.hall.enCountDias', { count: days });
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
  const when = item.cancelled ? t('classhall.hall.cancelado') : past ? t('classhall.hall.yaPaso') : days === 0 ? t('common.hoy2') : t('classhall.hall.enCountDias', { count: days });
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
          <ThemedText numberOfLines={1} style={styles.verifiedNote}>{t('classhall.hall.confirmadaPorVerifier', { verifier: item.verifier ?? 'un docente' })}</ThemedText>
        ) : item.verificationRequested ? (
          <ThemedText numberOfLines={1} style={styles.pendingNote}>{t('classhall.hall.porConfirmarPorUnDocente')}</ThemedText>
        ) : null}
      </View>
      <ThemedText style={styles.evaluationWhen}>{when}</ThemedText>
    </Pressable>
  );
}

export default function HallScreen() {
  const insets = useSafeAreaInsets();
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
  // A finger on a covered grade: the page holds still meanwhile.
  const [scratching, setScratching] = useState(false);

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
        setError(describeAuthError(loadError, t('classhall.hall.noPudimosAbrirEsteHall')));
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
    ? (openTasks.length ? t('classhall.hall.countAbiertas', { count: openTasks.length }) : t('common.publicar'))
    : (toHandIn.length ? t('classhall.hall.tohandincountPorEntregar', { toHandInCount: toHandIn.length }) : tasks.length ? t('classhall.hall.alDia') : t('classhall.hall.sinTareas'));
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
      setDeleteError(describeAuthError(removeError, t('classhall.hall.noPudimosEliminarElAnuncio')));
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
      setDocumentError(uploadError instanceof DocumentError ? uploadError.message : describeAuthError(uploadError, t('classhall.hall.noPudimosSubirElDocumento')));
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
      setDeleteError(describeAuthError(removeError, t('classhall.hall.noPudimosEliminarElDocumento')));
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
      setVerifyError(describeAuthError(confirmError, t('classhall.hall.noPudimosConfirmarLaInformacion')));
    } finally {
      setVerifying(false);
    }
  };
  const nextTitle = next ? `Evaluación ${hallDay(next.date)}` : nextFromCourse ? `Evaluación ${hallDay(nextFromCourse.startDate)}` : t('classhall.hall.sinEvaluaciones');
  const nextSubtitle = next ? t('classhall.evaluation.abrirTE') : nextFromCourse ? (isTeacher ? t('classhall.hall.revisar') : t('classhall.hall.verEnCalendar')) : isTeacher ? t('classhall.hall.agendarUna') : t('classhall.hall.porAhora');
  const nextPress = next
    ? () => openEvaluation(next)
    : nextFromCourse
      ? courseEventPress(nextFromCourse)
      : isTeacher ? newEvaluation : undefined;

  return (
    <FrostedScreen style={styles.container}>
      <ScrollView scrollEnabled={!scratching} contentContainerStyle={withTopInset(styles.content, insets.top)} showsVerticalScrollIndicator={false}>
        <View style={hallStyles.topBar}>
          <TopBarButton icon={HALL_ICONS.back} label={t('common.volver')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/classhall'))} />
          <Image source={HALL_ICONS.logotype} style={hallStyles.logotype} contentFit="contain" contentPosition="left" accessibilityLabel={t('common.hanetClasshall')} />
          <TopBarButton icon={HALL_ICONS.calendar} label={t('common.abrirElCalendarDelCurso')} wide onPress={() => router.navigate('/calendar')} />
        </View>

        {!detail && !error && <HallSkeleton />}

        {!!error && !detail && (
          <View style={styles.card}>
            <ThemedText accessibilityLiveRegion="polite" style={styles.body}>{error}</ThemedText>
            <HallPill label={t('common.reintentar')} tone="light" onPress={() => { setError(null); setAttempt(count => count + 1); }} />
          </View>
        )}

        {hall && (
          <>
            <HallHero hall={hall} />

            {/* Notas: a new grade comes covered, right at the top of the Hall. */}
            {!isTeacher && hall.gradesOn && (
              <StudentGrades hallId={hall.id} expected={hall.newGrades ?? 0} onScratching={setScratching} />
            )}

            <View style={styles.summary}>
              <HallTile
                icon={HALL_ICONS.tasks}
                tone="primary"
                title={t('classhall.hall.tareas')}
                subtitle={tasksSubtitle}
                accessibilityLabel={t('classhall.hall.tareasTaskssubtitleAbrir', { tasksSubtitle })}
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
                  ? t('classhall.hall.proximaEvaluacionTitleHalllongdateAbrir', { title: next.title, hallLongDate: hallLongDate(next.date) })
                  : nextFromCourse ? t('classhall.hall.proximaEvaluacionTitleHalllongdateDel', { title: nextFromCourse.title, hallLongDate: hallLongDate(nextFromCourse.startDate) }) : undefined}
                onPress={nextPress}
                style={styles.summaryNext}
              />
            </View>

            {(isTeacher || !!hall.blocks?.length) && (
              <HallSchedule
                hallId={hall.id}
                subject={hall.subject}
                blocks={(hall.blocks ?? []).map(block => ({ ...block, subject: hall.subject }))}
                canEdit={isTeacher && hall.plan !== 'comun'}
                fromCourse={hall.plan === 'comun'}
                onSaved={blocks => detail && setDetail({ ...detail, hall: { ...hall, blocks } })}
              />
            )}

            <View style={styles.divider} />

            <HanetSegmented options={TABS} value={tab} onChange={setTab} accessibilityLabel={t('classhall.hall.seccionesDelHall')} background={AppColors.surface} />

            {tab === 'announcements' && (
              <>
                {isTeacher && <HanetButton label={t('classhall.hall.publicarUnAnuncio')} variant="surface" onPress={() => announce()} />}
                {detail.announcements.length === 0 && (
                  <View style={styles.card}>
                    <ThemedText style={styles.emptyTitle}>{t('classhall.hall.sinAnuncios')}</ThemedText>
                    <ThemedText style={styles.body}>
                      {isTeacher ? t('classhall.hall.loQuePubliquesAquiLo') : t('classhall.hall.cuandoTuDocentePubliqueAlgo')}
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
                {isTeacher && <HanetButton label={t('classhall.hall.agendarUnaEvaluacion')} variant="surface" onPress={newEvaluation} />}
                {detail.evaluations.length === 0 ? (courseEvents.length === 0 && (
                  <View style={styles.card}>
                    <ThemedText style={styles.emptyTitle}>{t('classhall.hall.sinEvaluaciones')}</ThemedText>
                    <ThemedText style={styles.body}>
                      {isTeacher
                        ? t('classhall.hall.tambienAparecenEnElCalendar')
                        : t('classhall.hall.cuandoTuDocenteAgendeUna')}
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
                    <ThemedText style={styles.sectionLabel}>{t('classhall.hall.delCalendarDelCurso')}</ThemedText>
                    {isTeacher && (
                      <ThemedText style={styles.sectionHint}>{t('classhall.hall.tocaUnEventoParaConfirmar')}</ThemedText>
                    )}
                    <View style={styles.list}>
                      {courseEvents.map(item => (
                        <CourseEventRow key={item.id} item={item} onPress={courseEventPress(item)} />
                      ))}
                    </View>
                  </>
                )}
                <ThemedText style={styles.finePrint}>
                  {t('classhall.hall.lasEvaluacionesDelHallTambien', { subject: hall.subject })}
                </ThemedText>
              </>
            )}

            {tab === 'documents' && (
              <>
                {isTeacher && (
                  <HanetButton label={uploading ? t('common.subiendo') : t('classhall.hall.subirUnDocumento')} variant="surface" disabled={uploading} onPress={addDocument} />
                )}
                {!!documentError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{documentError}</ThemedText>}
                {documents.length === 0 ? (
                  <View style={styles.card}>
                    <ThemedText style={styles.emptyTitle}>{t('classhall.hall.sinDocumentos')}</ThemedText>
                    <ThemedText style={styles.body}>
                      {isTeacher
                        ? t('classhall.hall.pdfWordPowerpointExcelO')
                        : t('classhall.hall.aquiEstaranLasGuiasPresentaciones')}
                    </ThemedText>
                  </View>
                ) : documents.map(item => (
                  <View key={item.id} style={styles.card}>
                    <Byline name={item.authorName} seed={hall.teacherAvatarSeed} date={item.createdAt ? hallDay(item.createdAt) : t('common.ahora')} />
                    <DocumentTile
                      document={item}
                      label={item.evaluationId ? t('common.tablaDeEspecificaciones') : item.taskId ? t('classhall.hall.materialDeTarea') : undefined}
                    />
                    {isTeacher && (
                      <View style={styles.cardActions}>
                        <HallPill label={t('common.eliminar')} onPress={() => { setDeleteError(null); setPendingDocument(item); }} />
                      </View>
                    )}
                  </View>
                ))}
                {documents.length > 0 && <ThemedText style={styles.finePrint}>{DOCUMENTS_NOTICE}</ThemedText>}
              </>
            )}

            {isTeacher && hall.plan === 'comun' && (
              <ThemedText style={styles.finePrint}>
                {t('classhall.hall.planComunTodoCourseidEsta', { count: hall.memberCount ?? 0, courseId: hall.courseId })}
              </ThemedText>
            )}
            {isTeacher && hall.plan !== 'comun' && !!hall.code && (
              <ThemedText style={styles.finePrint}>
                {hall.plan === 'dominio' ? t('common.dominio') : t('common.electivo')}{' '}{t('classhall.hall.codigoDelHall')}{' '}<ThemedText style={styles.code}>{hall.code}</ThemedText> · {t('classhall.hall.countEstudiantes', { count: hall.memberCount ?? 0 })}
              </ThemedText>
            )}
            {isTeacher && (
              <View style={styles.teacherRow}>
                <HallPill label={t('classhall.create.editarHall')} tone="light" onPress={() => router.push({ pathname: '/classhall/create', params: { id: hall.id } })} />
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
          courseEvent.authorName ? t('classhall.hall.loPublicoAuthornameEnEl', { authorName: courseEvent.authorName }) : t('classhall.hall.estaEnElCalendarDel'),
          courseEvent.verified
            ? t('classhall.hall.yaLaConfirmoVerifier', { verifier: courseEvent.verifier ?? 'un docente' })
            : courseEvent.verificationRequested
              ? t('classhall.hall.laDirectivaPidioQueUn')
              : t('classhall.hall.siEstaBienConfirmalaPara'),
        ].join('\n\n') : undefined}
      >
        {!!verifyError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{verifyError}</ThemedText>}
        <View style={styles.dialogButtons}>
          {!!courseEvent && !courseEvent.verified && (
            <HanetButton label={verifying ? t('classhall.hall.confirmando') : t('classhall.hall.confirmarInformacion')} disabled={verifying} onPress={confirmCourseEvent} />
          )}
          {!!courseEvent && isEvaluationType(courseEvent.type) && (
            <HanetButton
              label={t('classhall.hall.completarEnMiHall')}
              variant="surface"
              disabled={verifying}
              onPress={() => { const event = courseEvent; setCourseEvent(null); adoptCourseEvent(event); }}
            />
          )}
          <HanetButton label={t('common.cerrar')} variant="surface" disabled={verifying} onPress={() => setCourseEvent(null)} />
        </View>
      </HanetDialog>

      <HanetDialog
        visible={!!pendingDocument}
        onRequestClose={() => !deleting && setPendingDocument(null)}
        dismissOnBackdrop={!deleting}
        title={t('classhall.hall.eliminarEsteDocumento')}
        body={pendingDocument ? t('classhall.hall.nameLosEstudiantesDelHall', { name: pendingDocument.name, value: pendingDocument.announcementId ? t('classhall.hall.ySeQuitaraDelAnuncio') : '' }) : undefined}
      >
        {!!deleteError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{deleteError}</ThemedText>}
        <HanetDialogActions>
          <HanetButton label={t('common.cancelar')} variant="surface" disabled={deleting} onPress={() => setPendingDocument(null)} style={dialogStyles.action} />
          <HanetButton label={deleting ? t('common.eliminando') : t('common.eliminar')} variant="accent" disabled={deleting} onPress={removeDocument} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>

      <HanetDialog
        visible={!!pendingDelete}
        onRequestClose={() => !deleting && setPendingDelete(null)}
        dismissOnBackdrop={!deleting}
        title={t('classhall.hall.eliminarEsteAnuncio')}
        body={t('classhall.hall.losEstudiantesDelHallDejaran')}
      >
        {!!deleteError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{deleteError}</ThemedText>}
        <HanetDialogActions>
          <HanetButton label={t('common.cancelar')} variant="surface" disabled={deleting} onPress={() => setPendingDelete(null)} style={dialogStyles.action} />
          <HanetButton label={deleting ? t('common.eliminando') : t('common.eliminar')} variant="accent" disabled={deleting} onPress={confirmDelete} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>
    </FrostedScreen>
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
  scheduleCard: {
    gap: AppSpacing.sm,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  scheduleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  scheduleDay: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  scheduleTime: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textSecondary,
    fontVariant: ['tabular-nums'],
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
