import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { HallSkeleton } from '@/components/skeletons';
import { HALL_ICONS, TopBarButton, hallStyles } from '@/components/classhall/hall-ui';
import { TaskRow } from '@/components/classhall/task-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetSegmented } from '@/components/ui/hanet-auth-fields';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { getHall, getLoadedHall, taskStatus } from '@/services/classhall-service';
import type { HallDetail, HallTaskSummary } from '@/services/classhall-service';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Filter = 'open' | 'done';

/**
 * The Hall's tasks. A student sees first what they still have to hand in;
 * the teacher, the open ones with how many handed them in.
 */
export default function TasksScreen() {
  const router = useRouter();
  const { hallId } = useLocalSearchParams<{ hallId: string }>();
  const { user, initializing } = useSession();

  const [detail, setDetail] = useState<HallDetail | null>(() => (hallId ? getLoadedHall(hallId) : null));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>('open');
  // The moment the screen opened, to tell open tasks from closed ones.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!initializing && !user) router.replace('/onboarding');
  }, [initializing, router, user]);

  // Reloads on coming back from a task, so a new submission or task shows up.
  useFocusEffect(useCallback(() => {
    if (!user || !hallId) return;
    let active = true;
    getHall(hallId)
      .then(result => { if (active) { setDetail(result); setError(null); } })
      .catch(loadError => { if (active) setError(describeAuthError(loadError, 'No pudimos cargar las tareas. Inténtalo nuevamente.')); });
    return () => { active = false; };
    // `attempt` re-runs the load from the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hallId, attempt]));

  const hall = detail?.hall;
  const isTeacher = !!hall?.isTeacher;
  const tasks = detail?.tasks ?? [];

  // Open: what can still be handed in (and, for a student, is not yet).
  const isOpen = (task: HallTaskSummary) => {
    if (isTeacher) return task.dueAt >= now;
    const status = taskStatus(task, task.mySubmission, now).tone;
    return status === 'pending' || status === 'late';
  };
  const open = tasks.filter(isOpen).sort((a, b) => a.dueAt - b.dueAt);
  const done = tasks.filter(task => !isOpen(task)).sort((a, b) => b.dueAt - a.dueAt);
  const shown = filter === 'open' ? open : done;

  const filters = [
    { value: 'open' as const, label: isTeacher ? `Abiertas${open.length ? ` (${open.length})` : ''}` : `Por entregar${open.length ? ` (${open.length})` : ''}`, accessibilityLabel: isTeacher ? 'Abiertas' : 'Por entregar' },
    { value: 'done' as const, label: isTeacher ? 'Cerradas' : 'Entregadas y cerradas', accessibilityLabel: isTeacher ? 'Cerradas' : 'Entregadas y cerradas' },
  ];

  const openTask = (task: HallTaskSummary) => router.push({ pathname: '/classhall/task', params: { hallId, id: task.id } });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={hallStyles.topBar}>
          <TopBarButton icon={HALL_ICONS.back} label="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/classhall/hall', params: { id: hallId } }))} />
          <Image source={HALL_ICONS.logotype} style={hallStyles.logotype} contentFit="contain" contentPosition="left" accessibilityLabel="HaNet ClassHall" />
          <TopBarButton icon={HALL_ICONS.calendar} label="Abrir el Calendar del curso" wide onPress={() => router.navigate('/calendar')} />
        </View>

        <View style={styles.header}>
          <ThemedText accessibilityRole="header" style={styles.title}>Tareas</ThemedText>
          {!!hall && <ThemedText style={styles.subtitle}>{hall.subject} · {hall.courseId}</ThemedText>}
        </View>

        {!detail && !error && <HallSkeleton hero={false} />}
        {!!error && !detail && (
          <View style={styles.card}>
            <ThemedText accessibilityLiveRegion="polite" style={styles.body}>{error}</ThemedText>
            <HanetButton label="Reintentar" variant="surface" onPress={() => { setError(null); setAttempt(count => count + 1); }} />
          </View>
        )}

        {!!detail && (
          <>
            {isTeacher && (
              <HanetButton label="Nueva tarea" onPress={() => router.push({ pathname: '/classhall/task-form', params: { hallId } })} />
            )}
            {tasks.length > 0 && (
              <HanetSegmented options={filters} value={filter} onChange={setFilter} accessibilityLabel="Filtrar tareas" background={AppColors.surface} />
            )}

            {tasks.length === 0 ? (
              <View style={styles.card}>
                <ThemedText style={styles.emptyTitle}>Sin tareas</ThemedText>
                <ThemedText style={styles.body}>
                  {isTeacher
                    ? 'Publica una tarea con su fecha de entrega. Tus estudiantes la entregan aquí con archivos, fotos o vínculos, y tú revisas cada entrega.'
                    : 'Cuando tu docente publique una tarea, aparecerá aquí y podrás entregarla desde la app.'}
                </ThemedText>
              </View>
            ) : shown.length === 0 ? (
              <View style={styles.card}>
                <ThemedText style={styles.emptyTitle}>{filter === 'open' ? (isTeacher ? 'Ninguna abierta' : 'Todo al día') : 'Nada por aquí'}</ThemedText>
                <ThemedText style={styles.body}>
                  {filter === 'open'
                    ? (isTeacher ? 'Las tareas que cerraron están en "Cerradas".' : 'No tienes tareas por entregar en este Hall.')
                    : (isTeacher ? 'Aquí quedan las tareas cuyo plazo terminó.' : 'Aquí quedan las tareas que entregaste o que ya cerraron.')}
                </ThemedText>
              </View>
            ) : (
              <View style={styles.list}>
                {shown.map(task => (
                  <TaskRow key={task.id} task={task} now={now} isTeacher={isTeacher} expected={detail.expectedSubmissions} onPress={() => openTask(task)} />
                ))}
              </View>
            )}

            <ThemedText style={styles.finePrint}>
              Las tareas también aparecen en el Calendar del curso. HaNet no pone notas: tu docente revisa cada entrega y puede dejarte un comentario.
            </ThemedText>
          </>
        )}
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
    paddingHorizontal: AppSpacing.md,
    paddingBottom: TAB_BAR_CLEARANCE + AppSpacing.xl,
    gap: AppSpacing.md,
  },
  header: {
    paddingHorizontal: AppSpacing.xs,
    gap: 2,
  },
  title: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -1.2,
    color: AppColors.textPrimary,
  },
  subtitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  card: {
    gap: AppSpacing.xl,
    padding: AppSpacing.xxl,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  emptyTitle: {
    marginBottom: -AppSpacing.md,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.5,
    color: AppColors.textPrimary,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: -0.35,
    color: AppColors.textPrimary,
  },
  list: {
    gap: AppSpacing.sm,
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
});
