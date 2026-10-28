import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { ActivityList, AllianceBadge, AllianceCard, LeaderCard, Scoreboard, SectionTitle, allianceColor, allianceFills, dayText, shortWhen, signedPoints, timeText } from '@/components/anniversary/anniversary-ui';
import { Confetti } from '@/components/anniversary/confetti';
import { FlexText } from '@/components/anniversary/flex-text';
import { GradientCard } from '@/components/anniversary/gradient-card';
import { NoticesPreview } from '@/components/anniversary/notices-preview';
import { EventGlow } from '@/components/events/event-glow';
import { MarqueeBanner } from '@/components/events/event-ui';
import { StoryShareSheet, storyShareAvailable } from '@/components/share/story-share';
import type { StoryItem } from '@/components/share/story-share';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions } from '@/components/ui/hanet-dialog';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { AppColors, AppDisplay, AppFlexFonts, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { CrownIcon } from '@/assets/animated-icons/crown';
import { describeAuthError, useSession } from '@/services/auth-service';
import { hasSeenWelcome } from '@/services/anniversary-welcome';
import { addPresetActivities, anniversaryDay, daysTo, deleteScoreEntry, formatPoints, getAnniversary, phaseOf, standings, todaysActivities, useAnniversaryState } from '@/services/anniversary-service';
import type { Alliance, Anniversary, AnniversaryActivity, ScoreEntry } from '@/services/anniversary-service';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The countdown number grows in weight on a narrow cut, so it stays a number.
const NUMBER_STEPS = ['GoogleSansFlex_300Light_ExtraCondensed', 'GoogleSansFlex_500Medium_Condensed', AppFlexFonts.numbers] as const;

// The page shows a few of each; the rest is one tap away.
const FEATURED = 3;
const MOVES_SHOWN = 4;

/**
 * The few activities the page shows: today's, else the next ones, else the
 * latest results. The whole list lives in app/anniversary/activities.tsx.
 */
function featuredOf(anniversary: Anniversary, now: number): { title: string; list: AnniversaryActivity[] } {
  const today = todaysActivities(anniversary, now);
  if (today.length) return { title: 'Hoy', list: today.slice(0, FEATURED + 2) };
  const next = anniversary.activities
    .filter(activity => activity.startsAt !== null && activity.startsAt > now)
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));
  if (next.length) return { title: 'Lo que viene', list: next.slice(0, FEATURED) };
  const done = anniversary.activities
    .filter(activity => activity.resultAt !== null)
    .sort((a, b) => (b.resultAt ?? 0) - (a.resultAt ?? 0));
  if (done.length) return { title: 'Últimos resultados', list: done.slice(0, FEATURED) };
  return { title: 'Actividades', list: anniversary.activities.slice(0, FEATURED) };
}

/** The big line under the title: days to go, the day it is, or nothing once it ended. */
function countdownOf(anniversary: Anniversary, now: number) {
  const phase = phaseOf(anniversary, now);
  if (phase === 'before') {
    const days = daysTo(anniversary.startsAt, now);
    if (days <= 0) return { number: null, label: '¡Hoy empieza!' };
    return { number: String(days), label: days === 1 ? 'día para\nempezar' : 'días para\nempezar' };
  }
  if (phase === 'during') {
    const { day, total } = anniversaryDay(anniversary, now);
    return { number: String(day), label: `de ${total} días\n¡de aniversario!` };
  }
  return null;
}

/** What the tilted strip says: today's program, the countdown, or the winner. */
function bannerOf(anniversary: Anniversary, now: number, mine: Alliance | null) {
  const upper = (text: string) => text.toLocaleUpperCase('es');
  const rows = standings(anniversary, now);
  const [leader] = rows;
  const scored = !!leader && leader.total !== null && leader.total > 0;
  const color = mine ? allianceColor(mine) : null;
  const fill = color?.fill ?? AppColors.accent;
  const ink = color?.ink ?? AppColors.textPrimary;
  const phase = phaseOf(anniversary, now);
  const today = todaysActivities(anniversary, now);

  if (phase === 'after') {
    const main = scored ? `¡GANÓ ${upper(leader.name)}! -` : '¡GRACIAS POR PARTICIPAR! -';
    return { main, secondary: `${anniversary.title} -`, label: scored ? `Ganó ${leader.name}` : 'Terminó el aniversario', fill, ink };
  }
  if (today.length) {
    const program = today.map(activity => `${upper(activity.name)} ${timeText(activity.startsAt ?? now)}`).join(' - ');
    const places = [...new Set(today.map(activity => activity.place).filter(Boolean))];
    const secondary = places.length ? `${places.join(' - ')} -` : scored ? `Va ganando ${leader.name} -` : `${anniversary.title} -`;
    return { main: `¡HOY! - ${program} -`, secondary, label: `Hoy: ${today.map(activity => activity.name).join(', ')}`, fill, ink };
  }
  if (phase === 'during') {
    return { main: '¡ESTAMOS DE ANIVERSARIO! -', secondary: scored ? `Va ganando ${leader.name} -` : `${anniversary.title} -`, label: 'Estamos de aniversario', fill, ink };
  }
  const days = daysTo(anniversary.startsAt, now);
  const when = days <= 0 ? '¡HOY EMPIEZA!' : days === 1 ? '¡MAÑANA EMPIEZA!' : `¡FALTAN ${days} DÍAS!`;
  return { main: `${when} - ${upper(anniversary.title)} -`, secondary: `${dayText(anniversary.startsAt)} -`, label: when, fill, ink };
}

// The winner's confetti falls once per app session, not on every visit.
const celebrated = new Set<string>();

function WinnerCard({ anniversary, now, onShare }: { anniversary: Anniversary; now: number; onShare?: () => void }) {
  const [winner, second] = standings(anniversary, now);
  const [party] = useState(() => !celebrated.has(anniversary.id));
  useEffect(() => { celebrated.add(anniversary.id); }, [anniversary.id]);
  if (!winner || winner.total === null || winner.total <= 0) return null;
  return (
    <GradientCard colors={[allianceColor(winner).fill, ...(second ? [allianceColor(second).fill] : [])]} style={styles.winner}>
      {party && <Confetti colors={allianceFills(anniversary.alliances)} />}
      <View style={styles.winnerHead}>
        <CrownIcon size={26} color={AppColors.accentYellow} animated />
        <ThemedText style={styles.kicker}>¡Ganó!</ThemedText>
      </View>
      <AllianceBadge alliance={winner} size={72} />
      <FlexText accessibilityRole="header" numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.winnerName}>{winner.name}</FlexText>
      <ThemedText style={styles.winnerPoints}>{formatPoints(winner.total)} puntos</ThemedText>
      {onShare && <HanetButton label="Compartir como historia" variant="surface" onPress={onShare} />}
    </GradientCard>
  );
}

export default function AnniversaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, initializing } = useSession();
  const state = useAnniversaryState();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ScoreEntry | null>(null);
  const [story, setStory] = useState<StoryItem | null>(null);
  const [allMoves, setAllMoves] = useState(false);

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

  const anniversary = state?.anniversary ?? null;
  const organizer = !!state?.canOrganize;

  // The first visit of the week (before it ends) opens the welcome, once per device.
  const welcomed = useRef<string | null>(null);
  const welcomeId = anniversary && phaseOf(anniversary, now) !== 'after' ? anniversary.id : null;
  useEffect(() => {
    if (!welcomeId || welcomed.current === welcomeId) return;
    welcomed.current = welcomeId;
    let active = true;
    hasSeenWelcome(welcomeId).then(seen => { if (active && !seen) router.push('/anniversary/welcome'); });
    return () => { active = false; };
  }, [router, welcomeId]);
  const openActivity = (id: string) => router.push({ pathname: '/anniversary/detail', params: { id } });

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
          <Skeleton height={42} width="80%" />
          <Skeleton height={58} width="40%" />
          <Skeleton height={160} radius={AppRadii.lg} />
          <Skeleton height={220} radius={AppRadii.lg} />
        </SkeletonGroup>
      );
    }

    if (!anniversary) {
      return (
        <View style={styles.empty}>
          <CrownIcon size={40} color={AppColors.accentYellow} animated />
          <FlexText accessibilityRole="header" style={styles.heroTitle}>Aniversario</FlexText>
          <ThemedText style={styles.emptyText}>
            {organizer
              ? 'Arma las alianzas con sus cursos, colores y mascotas. Después cargas las actividades y el marcador se suma solo.'
              : 'El CEE todavía no ha armado el aniversario. Cuando lo haga, aquí verás tu alianza, el marcador y lo que viene.'}
          </ThemedText>
          {organizer && <HanetButton label="Armar el aniversario" variant="accent" onPress={() => router.push('/anniversary/setup')} />}
        </View>
      );
    }

    const rows = standings(anniversary, now);
    const mine = anniversary.alliances.find(alliance => alliance.id === anniversary.myAllianceId) ?? null;
    const myStanding = rows.find(alliance => alliance.id === mine?.id);
    const featured = featuredOf(anniversary, now);
    const byId = new Map(anniversary.alliances.map(alliance => [alliance.id, alliance]));
    const activityName = new Map(anniversary.activities.map(activity => [activity.id, activity.name]));
    const upcomingDeadlines = anniversary.deadlines.filter(deadline => deadline.dueAt >= now);
    const phase = phaseOf(anniversary, now);
    const hidden = rows.some(alliance => alliance.total === null);
    const scored = !hidden && rows.some(alliance => (alliance.total ?? 0) > 0);
    const countdown = countdownOf(anniversary, now);
    const banner = bannerOf(anniversary, now, mine);
    const share = storyShareAvailable && scored ? () => setStory({ kind: 'anniversary', anniversary }) : undefined;

    return (
      <>
        <View style={styles.hero}>
          <ThemedText style={styles.dates}>{dayText(anniversary.startsAt)} al {dayText(anniversary.endsAt)}</ThemedText>
          <FlexText accessibilityRole="header" style={styles.heroTitle}>{anniversary.title}</FlexText>
          {countdown && (
            <View style={styles.countdown}>
              {countdown.number && <FlexText steps={NUMBER_STEPS} delay={180} style={styles.countdownNumber}>{countdown.number}</FlexText>}
              <ThemedText style={[styles.countdownLabel, !countdown.number && styles.countdownOnly]}>{countdown.label}</ThemedText>
            </View>
          )}
        </View>

        <View style={styles.banner}>
          <MarqueeBanner {...banner} fontFamily={AppFlexFonts.bold} />
        </View>

        {phase === 'after' && scored && <WinnerCard anniversary={anniversary} now={now} onShare={share} />}

        {mine && <AllianceCard alliance={mine} standing={myStanding} mine lead={anniversary.isLead} />}

        <SectionTitle title="Marcador" detail={hidden && organizer ? 'Oculto para los demás' : undefined} />
        {phase !== 'after' && scored && <LeaderCard anniversary={anniversary} now={now} />}
        <Scoreboard anniversary={anniversary} now={now} />
        {share && phase !== 'after' && (
          <HanetButton label="Compartir el marcador" variant="surface" onPress={share} />
        )}

        <NoticesPreview now={now} />

        {upcomingDeadlines.length > 0 && (
          <>
            <SectionTitle title="Plazos" />
            <View style={styles.card}>
              {upcomingDeadlines.map((deadline, index) => {
                const days = daysTo(deadline.dueAt, now);
                const soon = days <= 1;
                const when = days === 0 ? `Hoy, ${timeText(deadline.dueAt)}` : days === 1 ? `Mañana, ${timeText(deadline.dueAt)}` : shortWhen(deadline.dueAt);
                return (
                  <Pressable
                    key={deadline.id}
                    accessibilityRole={organizer ? 'button' : undefined}
                    accessibilityHint={organizer ? 'Editar el plazo' : undefined}
                    disabled={!organizer}
                    onPress={() => router.push({ pathname: '/anniversary/deadline', params: { id: deadline.id } })}
                    style={({ pressed }) => [styles.deadline, index > 0 && styles.lineBorder, pressed && AppPressed]}
                  >
                    <View style={[styles.deadlineIcon, soon && styles.deadlineIconSoon]}>
                      <Ionicons name="alarm-outline" size={18} color={soon ? AppColors.textOnLight : AppColors.textPrimary} />
                    </View>
                    <View style={styles.deadlineText}>
                      <ThemedText style={styles.lineTitle}>{deadline.title}</ThemedText>
                      <ThemedText style={[styles.lineDetail, soon && styles.soon]}>
                        {when}{organizer ? ` · ${deadline.audience === 'leads' ? 'Jefes' : 'Toda la alianza'}` : ''}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {anniversary.activities.length === 0 ? (
          organizer && (
            <>
              <SectionTitle title="Actividades" />
              <View style={styles.card}>
                <ThemedText style={styles.lineTitle}>Todavía no hay actividades</ThemedText>
                <ThemedText style={styles.lineDetail}>Carga las típicas de un aniversario (bailes, velada, show, alianza solidaria…) con sus puntajes. Después las editas o borras.</ThemedText>
                <View style={styles.cardActions}>
                  <HanetButton label={busy ? 'Cargando…' : 'Cargar actividades típicas'} variant="accent" disabled={busy} onPress={loadPresets} />
                  <HanetButton label="Crear una" variant="surface" onPress={() => router.push('/anniversary/activity')} />
                </View>
              </View>
            </>
          )
        ) : (
          <>
            <SectionTitle title={featured.title} />
            <ActivityList
              anniversary={anniversary}
              activities={featured.list}
              onOpen={openActivity}
              footer={anniversary.activities.length > featured.list.length
                ? { label: `Todas las actividades (${anniversary.activities.length})`, onPress: () => router.push('/anniversary/activities') }
                : undefined}
            />
          </>
        )}

        {anniversary.alliances.length > 0 && (
          <>
            <SectionTitle title="Alianzas" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.alliances}>
              {anniversary.alliances.map(alliance => (
                <AllianceCard
                  key={alliance.id}
                  alliance={alliance}
                  standing={rows.find(row => row.id === alliance.id)}
                  mine={alliance.id === mine?.id}
                  style={styles.allianceCard}
                />
              ))}
            </ScrollView>
          </>
        )}

        {anniversary.history.length > 0 && (
          <>
            <SectionTitle title="Movimientos de puntos" />
            <View style={styles.card}>
              {(allMoves ? anniversary.history : anniversary.history.slice(0, MOVES_SHOWN)).map((entry, index) => {
                const alliance = byId.get(entry.allianceId);
                const reason = entry.kind === 'result' ? (activityName.get(entry.activityId ?? '') ?? entry.reason) : entry.reason;
                return (
                  <View key={entry.id} style={[styles.entry, index > 0 && styles.lineBorder]}>
                    {alliance && <AllianceBadge alliance={alliance} size={30} />}
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
                        hitSlop={6}
                        style={({ pressed }) => [styles.remove, pressed && AppPressed]}
                      >
                        <Ionicons name="trash-outline" size={16} color={AppColors.textPrimary} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {anniversary.history.length > MOVES_SHOWN && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: allMoves }}
                  onPress={() => setAllMoves(value => !value)}
                  style={({ pressed }) => [styles.moreRow, styles.lineBorder, pressed && AppPressed]}
                >
                  <ThemedText style={styles.moreText}>{allMoves ? 'Ver menos' : `Ver los ${anniversary.history.length} movimientos`}</ThemedText>
                  <Ionicons name={allMoves ? 'chevron-up' : 'chevron-down'} size={16} color={AppColors.textSecondary} />
                </Pressable>
              )}
            </View>
          </>
        )}

        {!!anniversary.rulesUrl && (
          <HanetButton label="Leer las bases" variant="surface" onPress={() => void Linking.openURL(anniversary.rulesUrl)} />
        )}
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/anniversary/welcome')} style={({ pressed }) => [styles.replay, pressed && AppPressed]}>
          <Ionicons name="sparkles-outline" size={16} color={AppColors.textSecondary} />
          <ThemedText style={styles.replayText}>Ver la bienvenida otra vez</ThemedText>
        </Pressable>

        {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
      </>
    );
  };

  const mine = anniversary?.alliances.find(alliance => alliance.id === anniversary.myAllianceId);
  // The light at the top: one's own alianza first, then the rest.
  const glow = anniversary
    ? allianceFills([...(mine ? [mine] : []), ...anniversary.alliances.filter(alliance => alliance.id !== mine?.id)])
    : [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + AppSpacing.xl }]} showsVerticalScrollIndicator={false}>
        {!!anniversary && <EventGlow position="top" colors={glow} />}
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
      <StoryShareSheet item={story} onClose={() => setStory(null)} />
    </View>
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
  skeleton: {
    gap: AppSpacing.lg,
  },
  hero: {
    gap: AppSpacing.sm,
    paddingBottom: AppSpacing.sm,
  },
  dates: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: AppColors.textPrimary,
  },
  heroTitle: {
    ...AppDisplay.hero,
    color: AppColors.textPrimary,
  },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  countdownNumber: {
    ...AppDisplay.number,
    fontSize: 72,
    lineHeight: 74,
    color: AppColors.textPrimary,
  },
  countdownLabel: {
    ...AppDisplay.name,
    color: AppColors.textPrimary,
  },
  countdownOnly: {
    ...AppDisplay.title,
  },
  banner: {
    marginHorizontal: -AppSpacing.md,
  },
  kicker: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: AppColors.textPrimary,
  },
  winner: {
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.xxl,
  },
  winnerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  winnerName: {
    ...AppDisplay.hero,
    textAlign: 'center',
    color: AppColors.textPrimary,
  },
  winnerPoints: {
    ...AppDisplay.score,
    color: AppColors.textPrimary,
  },
  bleed: {
    marginHorizontal: -AppSpacing.lg,
  },
  alliances: {
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
  },
  allianceCard: {
    width: 260,
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
  deadline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  deadlineIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: AppColors.surfaceMuted,
  },
  deadlineIconSoon: {
    backgroundColor: AppColors.errorText,
  },
  deadlineText: {
    flex: 1,
    gap: 2,
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
    ...AppDisplay.score,
    fontSize: 18,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
    color: AppColors.textPrimary,
  },
  negative: {
    color: AppColors.errorText,
  },
  moreRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moreText: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  remove: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: AppColors.surfaceMuted,
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
  replay: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xs,
    minHeight: 44,
    paddingHorizontal: AppSpacing.md,
  },
  replayText: {
    ...AppType.callout,
    color: AppColors.textSecondary,
  },
  dialogButton: {
    flex: 1,
  },
});
