import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { HallSkeleton } from '@/components/skeletons';
import { DocumentTile, HALL_ICONS, HallPill, TopBarButton, hallDay, hallLongDate, hallStyles } from '@/components/classhall/hall-ui';
import { StatusPill, SubmissionItemRow, dueLabel } from '@/components/classhall/task-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetAvatar } from '@/components/ui/hanet-avatar';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { deleteHallTask, getHallTask, getLoadedTask, openHallDocument, taskStatus, withdrawHallSubmission } from '@/services/classhall-service';
import type { HallSubmission, HallTaskDetail, SubmissionItem } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function openItem(item: SubmissionItem) {
  void openHallDocument({ url: item.url });
}

/** "lunes 27 de abril, 10:15" of a submission, or "Ahora" right after handing it in. */
function submittedLabel(submission: HallSubmission) {
  return submission.submittedAt ? hallLongDate(submission.submittedAt) : 'Ahora';
}

export default function TaskScreen() {
  const router = useRouter();
  const { hallId, id } = useLocalSearchParams<{ hallId: string; id: string }>();
  const { user, initializing } = useSession();

  const [detail, setDetail] = useState<HallTaskDetail | null>(() => (hallId && id ? getLoadedTask(hallId, id) : null));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState<'delete' | 'withdraw' | null>(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!initializing && !user) router.replace('/onboarding');
  }, [initializing, router, user]);

  // Reloads on coming back from the submission or the form.
  useFocusEffect(useCallback(() => {
    if (!user || !hallId || !id) return;
    let active = true;
    getHallTask(hallId, id)
      .then(result => { if (active) { setDetail(result); setError(null); } })
      .catch(loadError => { if (active) setError(describeAuthError(loadError, 'No pudimos abrir esta tarea. Inténtalo nuevamente.')); });
    return () => { active = false; };
    // `attempt` re-runs the load from the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hallId, id, attempt]));

  const task = detail?.task;
  const isTeacher = !!detail?.isTeacher;
  const mine = detail?.mySubmission ?? null;
  const closed = !!task && task.dueAt < now;
  const canSubmit = !!task && (!closed || task.acceptLate);
  const status = task ? taskStatus(task, mine, now) : null;

  const submissions = detail?.submissions ?? [];
  const reviewedCount = submissions.filter(item => item.reviewed).length;
  const lateCount = submissions.filter(item => item.late).length;
  const expected = detail?.expectedSubmissions ?? 0;

  const openSubmit = () => router.push({ pathname: '/classhall/submit', params: { hallId, taskId: id } });
  const openSubmission = (submission: HallSubmission) =>
    router.push({ pathname: '/classhall/submission', params: { hallId, taskId: id, uid: submission.uid } });

  const confirmAction = async () => {
    if (!confirming || working || !hallId || !id) return;
    setWorking(true);
    setActionError(null);
    try {
      if (confirming === 'delete') {
        await deleteHallTask(hallId, id);
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setConfirming(null);
        router.back();
        return;
      }
      await withdrawHallSubmission(hallId, id);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDetail(current => current && { ...current, mySubmission: null });
      setConfirming(null);
    } catch (actionFailure) {
      setActionError(describeAuthError(actionFailure, confirming === 'delete' ? 'No pudimos eliminar la tarea.' : 'No pudimos retirar la entrega.'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={hallStyles.topBar}>
          <TopBarButton icon={HALL_ICONS.back} label="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/classhall/tasks', params: { hallId } }))} />
          <Image source={HALL_ICONS.logotype} style={hallStyles.logotype} contentFit="contain" contentPosition="left" accessibilityLabel="HaNet ClassHall" />
          <TopBarButton icon={HALL_ICONS.calendar} label="Abrir el Calendar del curso" wide onPress={() => router.navigate('/calendar')} />
        </View>

        {!detail && !error && <HallSkeleton />}
        {!!error && !detail && (
          <View style={styles.card}>
            <ThemedText accessibilityLiveRegion="polite" style={styles.body}>{error}</ThemedText>
            <HanetButton label="Reintentar" variant="surface" onPress={() => { setError(null); setAttempt(count => count + 1); }} />
          </View>
        )}

        {!!detail && !!task && (
          <>
            <View style={styles.hero}>
              <ThemedText style={styles.kicker}>Tarea · {detail.subject}</ThemedText>
              <ThemedText accessibilityRole="header" style={styles.title}>{task.title}</ThemedText>
              <View style={styles.dueRow}>
                <View style={styles.dueText}>
                  <ThemedText style={styles.dueLabel}>{dueLabel(task.dueAt, now)}</ThemedText>
                  <ThemedText style={styles.dueDate}>Hasta el {hallLongDate(task.dueAt)}</ThemedText>
                </View>
                {!isTeacher && status && <StatusPill label={status.label} tone={status.tone} />}
              </View>
              {task.acceptLate && <ThemedText style={styles.heroNote}>Acepta entregas atrasadas.</ThemedText>}
            </View>

            {(!!task.instructions || !!detail.attachment) && (
              <View style={styles.card}>
                <ThemedText style={styles.cardTitle}>Instrucciones</ThemedText>
                {!!task.instructions && <ThemedText selectable style={styles.body}>{task.instructions}</ThemedText>}
                {!!detail.attachment && <DocumentTile document={detail.attachment} tone="accent" label="Material de la tarea" />}
                <ThemedText style={styles.byline}>Publicada por {task.authorName}{task.createdAt ? ` el ${hallDay(task.createdAt)}` : ''}</ThemedText>
              </View>
            )}

            {!isTeacher && (
              <View style={styles.card}>
                <ThemedText style={styles.cardTitle}>Tu entrega</ThemedText>
                {mine ? (
                  <>
                    <ThemedText style={styles.meta}>
                      Entregada el {submittedLabel(mine)}{mine.late ? ' · con atraso' : ''}
                    </ThemedText>
                    <View style={styles.items}>
                      {mine.items.map(item => <SubmissionItemRow key={item.id} item={item} onOpen={() => openItem(item)} />)}
                    </View>
                    {!!mine.note && (
                      <View style={styles.note}>
                        <ThemedText style={styles.noteLabel}>Tu comentario</ThemedText>
                        <ThemedText selectable style={styles.body}>{mine.note}</ThemedText>
                      </View>
                    )}
                    {mine.reviewed && (
                      <View style={styles.feedback}>
                        <ThemedText style={styles.feedbackLabel}>Revisada por tu docente</ThemedText>
                        {!!mine.feedback && <ThemedText selectable style={styles.feedbackText}>{mine.feedback}</ThemedText>}
                      </View>
                    )}
                    {canSubmit && <HanetButton label="Editar entrega" variant="surface" onPress={openSubmit} />}
                    {!mine.reviewed && canSubmit && (
                      <Pressable accessibilityRole="button" onPress={() => { setActionError(null); setConfirming('withdraw'); }} style={({ pressed }) => [styles.textButton, pressed && AppPressed]}>
                        <ThemedText style={styles.textButtonLabel}>Retirar entrega</ThemedText>
                      </Pressable>
                    )}
                  </>
                ) : canSubmit ? (
                  <>
                    <ThemedText style={styles.body}>
                      {closed
                        ? 'El plazo terminó, pero tu docente todavía recibe esta tarea. Quedará marcada como atrasada.'
                        : 'Sube archivos, fotos o vínculos. Puedes cambiar tu entrega hasta que venza el plazo.'}
                    </ThemedText>
                    <HanetButton label="Entregar tarea" variant="accent" onPress={openSubmit} />
                  </>
                ) : (
                  <ThemedText style={styles.body}>El plazo terminó y esta tarea ya no recibe entregas. Si tuviste un problema, habla con tu docente.</ThemedText>
                )}
              </View>
            )}

            {isTeacher && (
              <>
                <View style={styles.stats}>
                  <View style={styles.stat}>
                    <ThemedText style={styles.statValue}>{submissions.length}{expected ? <ThemedText style={styles.statOf}>/{expected}</ThemedText> : null}</ThemedText>
                    <ThemedText style={styles.statLabel}>Entregaron</ThemedText>
                  </View>
                  <View style={styles.stat}>
                    <ThemedText style={styles.statValue}>{reviewedCount}</ThemedText>
                    <ThemedText style={styles.statLabel}>Revisadas</ThemedText>
                  </View>
                  <View style={styles.stat}>
                    <ThemedText style={styles.statValue}>{lateCount}</ThemedText>
                    <ThemedText style={styles.statLabel}>Atrasadas</ThemedText>
                  </View>
                </View>

                <ThemedText style={styles.sectionLabel}>Entregas</ThemedText>
                {submissions.length === 0 ? (
                  <View style={styles.card}>
                    <ThemedText style={styles.body}>Nadie ha entregado esta tarea todavía.</ThemedText>
                  </View>
                ) : (
                  <View style={styles.list}>
                    {/* Not yet reviewed first, oldest first, as a queue. */}
                    {[...submissions.filter(item => !item.reviewed).reverse(), ...submissions.filter(item => item.reviewed)].map(item => (
                      <Pressable
                        key={item.uid}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.studentName}, ${submittedLabel(item)}${item.late ? ', atrasada' : ''}${item.reviewed ? ', revisada' : ', por revisar'}`}
                        onPress={() => openSubmission(item)}
                        style={({ pressed }) => [styles.submission, pressed && AppPressed]}
                      >
                        <HanetAvatar seed={item.avatarSeed} fallback={item.studentName.slice(0, 1).toLocaleUpperCase('es')} width={36} height={44} />
                        <View style={styles.submissionText}>
                          <ThemedText numberOfLines={1} style={styles.submissionName}>{item.studentName}</ThemedText>
                          <ThemedText numberOfLines={1} style={styles.meta}>
                            {[item.courseId, submittedLabel(item), `${item.items.length} ${item.items.length === 1 ? 'archivo' : 'archivos'}`].filter(Boolean).join(' · ')}
                          </ThemedText>
                        </View>
                        {item.reviewed
                          ? <StatusPill label="Revisada" tone="done" />
                          : <StatusPill label={item.late ? 'Atrasada' : 'Por revisar'} tone={item.late ? 'late' : 'pending'} />}
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={styles.teacherRow}>
                  <HallPill label="Editar tarea" tone="light" onPress={() => router.push({ pathname: '/classhall/task-form', params: { hallId, id } })} />
                  <HallPill label="Eliminar" onPress={() => { setActionError(null); setConfirming('delete'); }} />
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <HanetDialog
        visible={!!confirming}
        onRequestClose={() => !working && setConfirming(null)}
        dismissOnBackdrop={!working}
        title={confirming === 'delete' ? '¿Eliminar esta tarea?' : '¿Retirar tu entrega?'}
        body={confirming === 'delete'
          ? `Se borran también las ${submissions.length === 1 ? 'entrega' : `${submissions.length} entregas`} y sus archivos, y sale del Calendar del curso. No se puede deshacer.`
          : 'Tus archivos se borran y la tarea vuelve a quedar pendiente. Puedes entregarla de nuevo mientras esté abierta.'}
      >
        {!!actionError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{actionError}</ThemedText>}
        <HanetDialogActions>
          <HanetButton label="Cancelar" variant="surface" disabled={working} onPress={() => setConfirming(null)} style={dialogStyles.action} />
          <HanetButton
            label={working ? (confirming === 'delete' ? 'Eliminando…' : 'Retirando…') : confirming === 'delete' ? 'Eliminar' : 'Retirar'}
            variant="accent"
            disabled={working}
            onPress={confirmAction}
            style={dialogStyles.action}
          />
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
  hero: {
    gap: AppSpacing.sm,
    padding: AppSpacing.xxl,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.primary,
  },
  kicker: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textPrimary,
    opacity: 0.8,
  },
  title: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -1,
    color: AppColors.textPrimary,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    marginTop: AppSpacing.xs,
  },
  dueText: {
    flex: 1,
  },
  dueLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    lineHeight: 21,
    color: AppColors.textPrimary,
  },
  dueDate: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textPrimary,
    opacity: 0.8,
  },
  heroNote: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
    opacity: 0.8,
  },
  card: {
    gap: AppSpacing.lg,
    padding: AppSpacing.xxl,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  cardTitle: {
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
  byline: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  meta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  items: {
    gap: AppSpacing.sm,
  },
  note: {
    gap: 4,
  },
  noteLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  feedback: {
    gap: 4,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.controlActive,
  },
  feedbackLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textOnLight,
  },
  feedbackText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: AppColors.textOnLight,
  },
  textButton: {
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.pill,
  },
  textButtonLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  stats: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  statValue: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: AppColors.textPrimary,
  },
  statOf: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    color: AppColors.textSecondary,
  },
  statLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
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
  list: {
    gap: AppSpacing.sm,
  },
  submission: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  submissionText: {
    flex: 1,
    gap: 2,
  },
  submissionName: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  teacherRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.sm,
  },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
});
