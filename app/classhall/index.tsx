import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { HallListSkeleton } from '@/components/skeletons';
import { daysUntil } from '@/components/classhall/hall-ui';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { hallThemeImage, listMyHalls } from '@/services/classhall-service';
import { dismissPushPrompt, enablePush, pushPermission, pushSupport, wasPushPromptDismissed } from '@/services/push-service';
import type { Hall } from '@/services/classhall-service';
import { SCHEDULE_DAYS, blocksOn, minutesOf, myWeek, scheduleDay } from '@/services/schedule-service';
import type { CourseSchedule, ScheduleBlock } from '@/services/schedule-service';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCached } from '@/services/cache';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function evaluationNotice(date: number) {
  const days = daysUntil(date);
  if (days <= 0) return 'Tienes una evaluación programada hoy';
  if (days === 1) return 'Tienes una evaluación programada mañana';
  return `Tienes una evaluación programada en ${days} días`;
}

/** "Hoy 10:00 · Sala 12", "Mar 08:00": the class's next block from now. */
function nextBlockLine(blocks: Pick<ScheduleBlock, 'day' | 'start' | 'room'>[], now = new Date()) {
  const minute = now.getHours() * 60 + now.getMinutes();
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const day = scheduleDay(date);
    const next = blocksOn(blocks as ScheduleBlock[], day).find(block => offset > 0 || minutesOf(block.start) > minute);
    if (next) {
      const when = offset === 0 ? 'Hoy' : offset === 1 ? 'Mañana' : SCHEDULE_DAYS.find(item => item.day === day)?.name.slice(0, 3) ?? '';
      return [`${when} ${next.start}`, next.room || null].filter(Boolean).join(' · ');
    }
  }
  return null;
}

function HallCard({ hall, onOpen, next }: { hall: Hall; onOpen: () => void; next: string | null }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyCode = async () => {
    if (!hall.code) return;
    await Clipboard.setStringAsync(hall.code);
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    setCopied(true);
  };

  const students = hall.memberCount === 1 ? '1 estudiante' : `${hall.memberCount ?? 0} estudiantes`;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${hall.subject}, ${hall.courseId}, ${hall.teacherName}`}
        accessibilityHint="Abre el Hall"
        onPress={onOpen}
        style={({ pressed }) => [styles.cardArt, pressed && styles.pressed]}
      >
        <Image source={hallThemeImage(hall.theme)} style={styles.cardImage} contentFit="cover" />
        {/* Keeps the text legible over any illustration. */}
        <View style={styles.cardShade} />
        <View style={styles.cardText}>
          <ThemedText numberOfLines={1} style={styles.cardSubject}>{hall.subject}</ThemedText>
          <ThemedText numberOfLines={1} style={styles.cardCourse}>{hall.plan === 'comun' ? hall.courseId : hall.plan === 'dominio' ? 'Dominio' : 'Electivo'}{next ? ` · ${next}` : ''}</ThemedText>
          <ThemedText numberOfLines={1} style={styles.cardTeacher}>{hall.teacherName.toLocaleUpperCase('es')}</ThemedText>
        </View>
      </Pressable>
      {!hall.isTeacher && !!hall.nextEvaluation && daysUntil(hall.nextEvaluation.date) <= 7 && (
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [styles.cardStrip, pressed && styles.pressed]}
        >
          <ThemedText numberOfLines={1} style={styles.stripText}>{evaluationNotice(hall.nextEvaluation.date)}</ThemedText>
        </Pressable>
      )}
      {hall.isTeacher && hall.plan === 'comun' && (
        <View style={styles.cardStrip}>
          <ThemedText style={styles.stripText}>Plan común · todo el curso · {students}</ThemedText>
        </View>
      )}
      {hall.isTeacher && hall.plan !== 'comun' && hall.code && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copiar el código del Hall, ${hall.code.split('').join(' ')}`}
          onPress={copyCode}
          style={({ pressed }) => [styles.cardStrip, pressed && styles.pressed]}
        >
          <ThemedText style={styles.stripText}>
            Código <ThemedText style={styles.stripCode}>{hall.code}</ThemedText> · {students}
          </ThemedText>
          <ThemedText style={styles.stripAction}>{copied ? 'Copiado' : 'Copiar'}</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

export default function ClassHallScreen() {
  const router = useRouter();
  const { user, initializing } = useSession();

  const [loadedHalls, setHalls] = useState<Hall[] | null>(null);
  const [loadedCanCreate, setCanCreate] = useState<boolean | null>(null);
  // What the phone kept shows until this visit's load answers.
  const kept = useCached<{ halls: Hall[]; canCreate: boolean }>(user ? 'halls' : null);
  const halls = loadedHalls ?? kept?.halls ?? null;
  // Each card says when the class meets next: an electivo's own blocks, or the course's Horario.
  const week = myWeek(useCached<CourseSchedule>(user ? 'schedule:mine' : null));
  const nextOf = (hall: Hall) => nextBlockLine(hall.blocks?.length ? hall.blocks : week.filter(block => block.hallId === hall.id));
  const courseHalls = halls?.filter(hall => hall.plan === 'comun') ?? [];
  const joinedHalls = halls?.filter(hall => hall.plan !== 'comun') ?? [];
  const open = (hall: Hall) => router.push({ pathname: '/classhall/hall', params: { id: hall.id } });
  const canCreate = loadedCanCreate ?? kept?.canCreate ?? false;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Asks once, here where it matters, to turn notifications on.
  const [askPush, setAskPush] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (!initializing && !user) router.replace('/onboarding');
  }, [initializing, router, user]);

  useEffect(() => {
    if (!user || pushSupport() !== 'supported') return;
    let active = true;
    void Promise.all([pushPermission(), wasPushPromptDismissed()]).then(([permission, dismissed]) => {
      if (active) setAskPush(permission === 'undetermined' && !dismissed);
    });
    return () => { active = false; };
  }, [user]);

  const turnOnPush = async () => {
    setEnabling(true);
    await enablePush();
    setEnabling(false);
    setAskPush(false);
  };
  const notNow = () => {
    setAskPush(false);
    void dismissPushPrompt();
  };

  // Reloads when coming back from the sheets that join or create a Hall.
  useFocusEffect(useCallback(() => {
    if (!user) return;
    let active = true;
    listMyHalls()
      .then(result => {
        if (!active) return;
        setHalls(result.halls);
        setCanCreate(result.canCreate);
        setError(null);
      })
      .catch(loadError => {
        if (active) setError(describeAuthError(loadError, 'No pudimos cargar tus clases. Inténtalo nuevamente.'));
      });
    return () => { active = false; };
    // `attempt` re-runs the load from the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, attempt]));

  const loading = halls === null && !error;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <ThemedText style={styles.brand}>HaNet <ThemedText style={styles.brandSmall}>ClassHall</ThemedText></ThemedText>
        </View>

        <View style={styles.heading}>
          <ThemedText accessibilityRole="header" style={styles.title}>ClassHall</ThemedText>
          <ThemedText style={styles.subtitle}>Mis clases y asignaturas</ThemedText>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/classhall/join')}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <ThemedText style={styles.actionText}>Unirse a un Hall</ThemedText>
          </Pressable>
          {canCreate && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/classhall/create')}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <ThemedText style={styles.actionText}>Crear un Hall</ThemedText>
            </Pressable>
          )}
        </View>

        {/* Notifications are for students: teachers publish, they are not notified. */}
        {askPush && halls !== null && !canCreate && (
          <View style={styles.notice}>
            <ThemedText style={styles.noticeTitle}>¿Te avisamos?</ThemedText>
            <ThemedText style={styles.noticeText}>
              Te avisamos de anuncios, tareas y material nuevo, y te recordamos el día antes de entregar.
            </ThemedText>
            <View style={styles.pushActions}>
              <Pressable accessibilityRole="button" disabled={enabling} onPress={() => void turnOnPush()} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                <ThemedText style={styles.retryText}>{enabling ? 'Activando…' : 'Activar'}</ThemedText>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={enabling} onPress={notNow} style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
                <ThemedText style={styles.laterText}>Ahora no</ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        {loading && <HallListSkeleton />}

        {!!error && (
          <View style={styles.notice}>
            <ThemedText accessibilityLiveRegion="polite" style={styles.noticeText}>{error}</ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => { setError(null); setAttempt(count => count + 1); }}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <ThemedText style={styles.retryText}>Reintentar</ThemedText>
            </Pressable>
          </View>
        )}

        {halls?.length === 0 && !error && (
          <View style={styles.notice}>
            <ThemedText style={styles.noticeTitle}>Todavía no tienes clases</ThemedText>
            <ThemedText style={styles.noticeText}>
              {canCreate
                ? 'Crea un Hall para tu asignatura. Si es para todo el curso, todos entran solos.'
                : 'Las clases de tu curso aparecen solas cuando tus docentes crean su Hall. Para un electivo o dominio, usa «Unirse a un Hall».'}
            </ThemedText>
          </View>
        )}

        {/* The course's classes first, then the ones joined with a code. */}
        {courseHalls.length > 0 && joinedHalls.length > 0 && <ThemedText accessibilityRole="header" style={styles.groupLabel}>Tu curso</ThemedText>}
        {courseHalls.map(hall => <HallCard key={hall.id} hall={hall} next={nextOf(hall)} onOpen={() => open(hall)} />)}
        {joinedHalls.length > 0 && <ThemedText accessibilityRole="header" style={styles.groupLabel}>Electivos y dominios</ThemedText>}
        {joinedHalls.map(hall => <HallCard key={hall.id} hall={hall} next={nextOf(hall)} onOpen={() => open(hall)} />)}
      </ScrollView>
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
    padding: AppSpacing.md,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: AppSpacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
  },
  brand: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  brandSmall: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  heading: {
    paddingHorizontal: AppSpacing.xs,
    paddingVertical: AppSpacing.sm,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -1.1,
    color: AppColors.textPrimary,
  },
  subtitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -1.1,
    color: AppColors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    padding: AppSpacing.sm,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  action: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.md,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  actionText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  notice: {
    padding: AppSpacing.xl,
    gap: AppSpacing.sm,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  noticeTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.5,
    color: AppColors.textPrimary,
  },
  noticeText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: -0.3,
    color: AppColors.textSecondary,
  },
  retry: {
    minHeight: AppTouch.minimum,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.xl,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.controlActive,
  },
  pushActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.xs,
  },
  later: {
    minHeight: AppTouch.minimum,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
  },
  laterText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  retryText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.controlOnActive,
  },
  card: {
    overflow: 'hidden',
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  cardArt: {
    height: 116,
    justifyContent: 'center',
  },
  cardImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  cardShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  cardText: {
    paddingHorizontal: AppSpacing.xl,
    paddingRight: '35%',
  },
  cardSubject: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.6,
    color: AppColors.textPrimary,
  },
  groupLabel: {
    marginTop: AppSpacing.sm,
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: AppColors.textSecondary,
  },
  cardCourse: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  cardTeacher: {
    marginTop: AppSpacing.md,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  cardStrip: {
    minHeight: AppTouch.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.xl,
    backgroundColor: AppColors.surfaceSoft,
  },
  stripText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textOnLight,
  },
  stripCode: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    letterSpacing: 1.5,
    color: AppColors.textOnLight,
  },
  stripAction: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textOnLight,
  },
  pressed: {
    opacity: 0.6,
  },
});
