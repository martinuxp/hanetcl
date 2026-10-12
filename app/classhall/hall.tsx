import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { HALL_ICONS, HallHero, HallPill, HallTile, TopBarButton, daysUntil, hallDay, hallLongDate, hallStyles, startOfToday } from '@/components/classhall/hall-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetSegmented } from '@/components/ui/hanet-auth-fields';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { deleteHallAnnouncement, getHall, getLoadedHall } from '@/services/classhall-service';
import type { HallAnnouncement, HallCourseEvent, HallDetail, HallEvaluation } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'announcements' | 'evaluations' | 'documents';

const TABS: { value: Tab; label: string; accessibilityLabel: string }[] = [
  { value: 'announcements', label: 'Anuncios', accessibilityLabel: 'Anuncios' },
  { value: 'evaluations', label: 'Evaluaciones', accessibilityLabel: 'Evaluaciones' },
  { value: 'documents', label: 'Documentos', accessibilityLabel: 'Documentos, próximamente' },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase('es')).join('');
}

function shortName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  // "Monica Jeannette Campos Veloso" → "Monica Campos".
  return parts.length >= 4 ? `${parts[0]} ${parts[2]}` : parts.slice(0, 2).join(' ');
}

/** Teacher's name with the verified mark, and the date under it. */
function Byline({ name, date }: { name: string; date: string }) {
  return (
    <View style={styles.byline}>
      <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
        <ThemedText style={styles.avatarText}>{initials(name)}</ThemedText>
      </View>
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

function AnnouncementCard({ item, canEdit, onEdit, onDelete }: { item: HallAnnouncement; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const date = item.createdAt ? hallDay(item.createdAt) : 'Ahora';
  return (
    <View style={styles.card}>
      <Byline name={item.authorName} date={item.updatedAt ? `${date} · editado` : date} />
      <ThemedText selectable style={styles.body}>{item.body}</ThemedText>
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
      </View>
      <ThemedText style={styles.evaluationWhen}>{when}</ThemedText>
    </Pressable>
  );
}

export default function HallScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, initializing } = useSession();

  const [detail, setDetail] = useState<HallDetail | null>(() => (id ? getLoadedHall(id) : null));
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('announcements');
  const [attempt, setAttempt] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<HallAnnouncement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!initializing && !user) router.replace('/auth');
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
        if (active) setError(describeAuthError(loadError, 'No pudimos abrir este Hall. Inténtalo nuevamente.'));
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
  const next = hallNext && (!nextCourse || hallNext.date <= nextCourse.startDate) ? hallNext : undefined;
  const nextFromCourse = !next ? nextCourse : undefined;

  const openEvaluation = (evaluation: HallEvaluation) =>
    router.push({ pathname: '/classhall/evaluation', params: { hallId: id, id: evaluation.id } });
  const newEvaluation = () => router.push({ pathname: '/classhall/evaluation-form', params: { hallId: id } });
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
  const nextTitle = next ? `Evaluación ${hallDay(next.date)}` : nextFromCourse ? `Evaluación ${hallDay(nextFromCourse.startDate)}` : 'Sin evaluaciones';
  const nextSubtitle = next ? 'Abrir T.E.' : nextFromCourse ? 'Ver en Calendar' : isTeacher ? 'Agendar una' : 'por ahora';
  const nextPress = next
    ? () => openEvaluation(next)
    : nextFromCourse
      ? (isTeacher ? undefined : () => openCourseEvent(nextFromCourse))
      : isTeacher ? newEvaluation : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={hallStyles.topBar}>
          <TopBarButton icon={HALL_ICONS.back} label="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/classhall'))} />
          <Image source={HALL_ICONS.logotype} style={hallStyles.logotype} contentFit="contain" contentPosition="left" accessibilityLabel="HaNet ClassHall" />
          <TopBarButton icon={HALL_ICONS.calendar} label="Abrir el Calendar del curso" wide onPress={() => router.navigate('/calendar')} />
        </View>

        {!detail && !error && <ActivityIndicator style={styles.loader} size="large" color={AppColors.textSecondary} />}

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
                subtitle="Próximamente"
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
                        ? 'Cada evaluación que agendes aparece también en el Calendar del curso, con su tabla de especificaciones.'
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
                    <View style={styles.list}>
                      {courseEvents.map(item => (
                        <CourseEventRow key={item.id} item={item} onPress={isTeacher ? undefined : () => openCourseEvent(item)} />
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
              <View style={styles.card}>
                <ThemedText style={styles.emptyTitle}>Próximamente</ThemedText>
                <ThemedText style={styles.body}>Aquí estarán las guías, presentaciones y documentos que comparta tu docente.</ThemedText>
              </View>
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
  loader: {
    marginTop: AppSpacing.xxl,
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
    opacity: 0.7,
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
