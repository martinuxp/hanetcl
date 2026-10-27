import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { HALL_ICONS, TopBarButton } from '@/components/classhall/hall-ui';
import { ActivityRow, AllianceDot, AlliancePill, Scoreboard, SectionTitle, allianceColor, dayText, shortWhen, signedPoints, timeText } from '@/components/anniversary/anniversary-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { HanetDialog, HanetDialogActions } from '@/components/ui/hanet-dialog';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { ACTIVITY_GROUPS, addPresetActivities, daysTo, deleteScoreEntry, getAnniversary, phaseOf, ranking, todaysActivities, useAnniversaryState } from '@/services/anniversary-service';
import type { Anniversary, ScoreEntry } from '@/services/anniversary-service';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** "Faltan 23 días", "¡Es hoy!"… for the header. */
function countdown(anniversary: Anniversary, now: number) {
  const phase = phaseOf(anniversary, now);
  if (phase === 'after') {
    const winner = ranking(anniversary)[0];
    return winner && winner.total !== null ? `Terminó · ganó ${winner.name} 🏆` : 'Terminó';
  }
  if (phase === 'during') return '¡Estamos de aniversario!';
  const days = daysTo(anniversary.startsAt, now);
  return days <= 0 ? '¡Empieza hoy!' : days === 1 ? 'Empieza mañana' : `Faltan ${days} días`;
}

export default function AnniversaryScreen() {
  const router = useRouter();
  const { user, initializing } = useSession();
  const state = useAnniversaryState();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ScoreEntry | null>(null);

  useEffect(() => {
    if (!initializing && !user) router.replace('/onboarding');
  }, [initializing, router, user]);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    let active = true;
    getAnniversary()
      .then(() => { if (active) setError(null); })
      .catch(loadError => { if (active) setError(describeAuthError(loadError, 'No pudimos cargar el aniversario. Inténtalo nuevamente.')); });
    return () => { active = false; };
    // `attempt` re-runs the load from the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, attempt]));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const anniversary = state?.anniversary ?? null;
  const organizer = !!state?.canOrganize;

  const loadPresets = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await addPresetActivities();
    } catch (presetError) {
      setError(describeAuthError(presetError, 'No pudimos cargar las actividades. Inténtalo nuevamente.'));
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try {
      await deleteScoreEntry(removing.id);
      setRemoving(null);
    } catch (removeError) {
      setError(describeAuthError(removeError, 'No pudimos borrar el movimiento. Inténtalo nuevamente.'));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  const content = () => {
    if (!state) {
      if (error) {
        return (
          <View style={styles.empty}>
            <ThemedText style={styles.emptyText}>{error}</ThemedText>
            <HanetButton label="Reintentar" variant="surface" onPress={() => setAttempt(value => value + 1)} />
          </View>
        );
      }
      return (
        <SkeletonGroup style={styles.skeleton} label="Cargando el aniversario">
          <Skeleton height={34} width="70%" />
          <Skeleton height={96} radius={AppRadii.lg} />
          <Skeleton height={220} radius={AppRadii.lg} />
        </SkeletonGroup>
      );
    }

    if (!anniversary) {
      return (
        <View style={styles.empty}>
          <ThemedText accessibilityRole="header" style={styles.title}>Aniversario</ThemedText>
          <ThemedText style={styles.emptyText}>
            {organizer
              ? 'Arma las alianzas con sus cursos y colores. Después cargas las actividades y el marcador se suma solo.'
              : 'El CEE todavía no arma el aniversario. Cuando lo haga, aquí vas a ver tu alianza, el marcador y lo que viene.'}
          </ThemedText>
          {organizer && <HanetButton label="Armar el aniversario" variant="accent" onPress={() => router.push('/anniversary/setup')} />}
        </View>
      );
    }

    const mine = anniversary.alliances.find(alliance => alliance.id === anniversary.myAllianceId) ?? null;
    const today = todaysActivities(anniversary, now);
    const byId = new Map(anniversary.alliances.map(alliance => [alliance.id, alliance]));
    const activityName = new Map(anniversary.activities.map(activity => [activity.id, activity.name]));
    const upcomingDeadlines = anniversary.deadlines.filter(deadline => deadline.dueAt >= now);
    const mineColor = allianceColor(mine);

    return (
      <>
        <View style={styles.hero}>
          <ThemedText accessibilityRole="header" style={styles.title}>{anniversary.title}</ThemedText>
          <ThemedText style={styles.subtitle}>
            {dayText(anniversary.startsAt)} al {dayText(anniversary.endsAt)} · {countdown(anniversary, now)}
          </ThemedText>
        </View>

        {mine && (
          <View style={[styles.mine, { backgroundColor: mineColor.fill }, mine.color === 'negro' && styles.outline]}>
            <ThemedText style={[styles.mineLabel, { color: mineColor.ink }]}>Tu alianza</ThemedText>
            <ThemedText style={[styles.mineName, { color: mineColor.ink }]}>{mine.name}</ThemedText>
            {!!mine.theme && <ThemedText style={[styles.mineTheme, { color: mineColor.ink }]}>{mine.theme}</ThemedText>}
            {anniversary.isLead && <ThemedText style={[styles.mineTheme, { color: mineColor.ink }]}>Eres jefe de alianza: te llegan las pruebas flash y los plazos.</ThemedText>}
          </View>
        )}

        {organizer && (
          <View style={styles.tools}>
            <ThemedText style={styles.toolsTitle}>Organizar</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolsScroll} contentContainerStyle={styles.toolsRow}>
              <HanetChip label="⚡ Prueba flash" onPress={() => router.push('/anniversary/flash')} />
              <HanetChip label="Sumar o descontar" onPress={() => router.push('/anniversary/points')} />
              <HanetChip label="Actividad" onPress={() => router.push('/anniversary/activity')} />
              <HanetChip label="Plazo" onPress={() => router.push('/anniversary/deadline')} />
              <HanetChip label="Jefes de alianza" onPress={() => router.push('/anniversary/leads')} />
              <HanetChip label="Alianzas y fechas" onPress={() => router.push('/anniversary/setup')} />
            </ScrollView>
          </View>
        )}

        <SectionTitle title="Marcador" detail={anniversary.scoreHidden && organizer ? 'Oculto para los demás' : undefined} />
        <Scoreboard anniversary={anniversary} />

        {today.length > 0 && (
          <>
            <SectionTitle title="Hoy" />
            {today.map(activity => (
              <ActivityRow
                key={activity.id}
                anniversary={anniversary}
                activity={activity}
                onPress={organizer ? () => router.push({ pathname: '/anniversary/result', params: { id: activity.id } }) : undefined}
              />
            ))}
          </>
        )}

        {upcomingDeadlines.length > 0 && (
          <>
            <SectionTitle title="Plazos" />
            <View style={styles.card}>
              {upcomingDeadlines.map((deadline, index) => {
                const days = daysTo(deadline.dueAt, now);
                const when = days === 0 ? `Hoy, ${timeText(deadline.dueAt)}` : days === 1 ? `Mañana, ${timeText(deadline.dueAt)}` : shortWhen(deadline.dueAt);
                return (
                  <Pressable
                    key={deadline.id}
                    accessibilityRole={organizer ? 'button' : undefined}
                    accessibilityHint={organizer ? 'Editar el plazo' : undefined}
                    disabled={!organizer}
                    onPress={() => router.push({ pathname: '/anniversary/deadline', params: { id: deadline.id } })}
                    style={({ pressed }) => [styles.line, index > 0 && styles.lineBorder, pressed && AppPressed]}
                  >
                    <ThemedText style={styles.lineTitle}>{deadline.title}</ThemedText>
                    <ThemedText style={[styles.lineDetail, days <= 1 && styles.soon]}>
                      {when}{organizer ? ` · ${deadline.audience === 'leads' ? 'Jefes' : 'Toda la alianza'}` : ''}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {anniversary.activities.length === 0 && organizer && (
          <View style={styles.card}>
            <ThemedText style={styles.lineTitle}>Todavía no hay actividades</ThemedText>
            <ThemedText style={styles.lineDetail}>Carga las típicas de un aniversario (bailes, velada, show, alianza solidaria…) con sus puntajes. Después las editas o borras.</ThemedText>
            <View style={styles.cardActions}>
              <HanetButton label={busy ? 'Cargando…' : 'Cargar actividades típicas'} variant="accent" disabled={busy} onPress={loadPresets} />
              <HanetButton label="Crear una" variant="surface" onPress={() => router.push('/anniversary/activity')} />
            </View>
          </View>
        )}

        {ACTIVITY_GROUPS.map(group => {
          const list = anniversary.activities
            .filter(activity => activity.group === group.value)
            .sort((a, b) => (a.startsAt ?? Number.MAX_SAFE_INTEGER) - (b.startsAt ?? Number.MAX_SAFE_INTEGER));
          if (!list.length) return null;
          return (
            <View key={group.value} style={styles.group}>
              <SectionTitle title={group.label} />
              {list.map(activity => (
                <ActivityRow
                  key={activity.id}
                  anniversary={anniversary}
                  activity={activity}
                  onPress={organizer ? () => router.push({ pathname: '/anniversary/result', params: { id: activity.id } }) : undefined}
                />
              ))}
            </View>
          );
        })}

        {anniversary.activities.length > 0 && organizer && (
          <HanetButton label={busy ? 'Cargando…' : 'Agregar las actividades típicas que falten'} variant="surface" disabled={busy} onPress={loadPresets} />
        )}

        {anniversary.history.length > 0 && (
          <>
            <SectionTitle title="Movimientos de puntos" />
            <View style={styles.card}>
              {anniversary.history.map((entry, index) => {
                const alliance = byId.get(entry.allianceId);
                const reason = entry.kind === 'result' ? (activityName.get(entry.activityId ?? '') ?? entry.reason) : entry.reason;
                return (
                  <View key={entry.id} style={[styles.entry, index > 0 && styles.lineBorder]}>
                    {alliance && <AllianceDot alliance={alliance} />}
                    <View style={styles.entryText}>
                      <ThemedText style={styles.lineTitle}>{reason}</ThemedText>
                      <ThemedText style={styles.lineDetail}>
                        {alliance?.name ?? 'Alianza'}{entry.createdAt ? ` · ${shortWhen(entry.createdAt)}` : ''}
                      </ThemedText>
                    </View>
                    <ThemedText style={[styles.entryPoints, entry.points < 0 && styles.negative]}>{signedPoints(entry.points)}</ThemedText>
                    {organizer && entry.kind === 'adjust' && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Borrar el movimiento: ${reason}`}
                        onPress={() => setRemoving(entry)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.remove, pressed && AppPressed]}
                      >
                        <ThemedText style={styles.removeText}>Borrar</ThemedText>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {!!anniversary.rulesUrl && (
          <HanetButton label="Leer las bases" variant="surface" onPress={() => void Linking.openURL(anniversary.rulesUrl)} />
        )}

        {anniversary.alliances.length > 0 && (
          <>
            <SectionTitle title="Alianzas" />
            <View style={styles.card}>
              {anniversary.alliances.map((alliance, index) => (
                <View key={alliance.id} style={[styles.line, index > 0 && styles.lineBorder]}>
                  <AlliancePill alliance={alliance} style={styles.alliancePill} />
                  {!!alliance.theme && <ThemedText style={styles.lineDetail}>{alliance.theme}</ThemedText>}
                  <ThemedText style={styles.lineDetail}>{alliance.courseIds.length ? alliance.courseIds.join(', ') : 'Sin cursos todavía'}</ThemedText>
                </View>
              ))}
            </View>
          </>
        )}

        {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TopBarButton icon={HALL_ICONS.back} label="Volver" onPress={back} />
        </View>
        {content()}
      </ScrollView>
      <HanetDialog
        visible={!!removing}
        onRequestClose={() => setRemoving(null)}
        title="¿Borrar este movimiento?"
        body={removing ? `${removing.reason} (${signedPoints(removing.points)}). El marcador se recalcula.` : undefined}
      >
        <HanetDialogActions>
          <HanetButton label="Cancelar" variant="surface" onPress={() => setRemoving(null)} style={styles.dialogButton} />
          <HanetButton label={busy ? 'Borrando…' : 'Borrar'} variant="accent" disabled={busy} onPress={removeEntry} style={styles.dialogButton} />
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
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.lg,
    paddingBottom: TAB_BAR_CLEARANCE + AppSpacing.xl,
    gap: AppSpacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: AppSpacing.md,
  },
  skeleton: {
    gap: AppSpacing.lg,
  },
  hero: {
    gap: AppSpacing.xs,
  },
  title: {
    ...AppType.title1,
    color: AppColors.textPrimary,
  },
  subtitle: {
    ...AppType.callout,
    color: AppColors.textSecondary,
  },
  mine: {
    gap: 2,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
  },
  outline: {
    borderWidth: 1,
    borderColor: AppColors.surfaceMuted,
  },
  mineLabel: {
    ...AppType.caption,
    opacity: 0.8,
  },
  mineName: {
    ...AppType.title2,
  },
  mineTheme: {
    ...AppType.footnote,
  },
  tools: {
    gap: AppSpacing.sm,
  },
  toolsTitle: {
    ...AppType.caption,
    color: AppColors.textSecondary,
  },
  toolsScroll: {
    marginHorizontal: -AppSpacing.lg,
  },
  toolsRow: {
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
  },
  group: {
    gap: AppSpacing.md,
  },
  card: {
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  cardActions: {
    gap: AppSpacing.sm,
  },
  line: {
    gap: 2,
  },
  lineBorder: {
    paddingTop: AppSpacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.surfaceMuted,
  },
  lineTitle: {
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  lineDetail: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
  soon: {
    color: AppColors.errorText,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  entryText: {
    flex: 1,
    gap: 2,
  },
  entryPoints: {
    ...AppType.headline,
    fontVariant: ['tabular-nums'],
    color: AppColors.textPrimary,
  },
  negative: {
    color: AppColors.errorText,
  },
  remove: {
    paddingHorizontal: AppSpacing.sm,
    paddingVertical: AppSpacing.xs,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  removeText: {
    ...AppType.caption,
    color: AppColors.textPrimary,
  },
  alliancePill: {
    alignSelf: 'flex-start',
  },
  empty: {
    gap: AppSpacing.lg,
    paddingTop: AppSpacing.xl,
  },
  emptyText: {
    ...AppType.body,
    color: AppColors.textSecondary,
  },
  error: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.errorText,
  },
  dialogButton: {
    flex: 1,
  },
});
