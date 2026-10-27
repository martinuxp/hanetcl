import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { HALL_ICONS, TopBarButton } from '@/components/classhall/hall-ui';
import { ActivityRow, AllianceBadge, AllianceCard, GroupIcon, LeaderCard, Scoreboard, SectionTitle, allianceColor, allianceFills, dayText, shortWhen, signedPoints, timeText } from '@/components/anniversary/anniversary-ui';
import { Confetti } from '@/components/anniversary/confetti';
import { FlexText } from '@/components/anniversary/flex-text';
import { GradientCard } from '@/components/anniversary/gradient-card';
import { EventGlow } from '@/components/events/event-glow';
import { MarqueeBanner } from '@/components/events/event-ui';
import { StoryShareSheet, storyShareAvailable } from '@/components/share/story-share';
import type { StoryItem } from '@/components/share/story-share';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { HanetDialog, HanetDialogActions } from '@/components/ui/hanet-dialog';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { AppColors, AppDisplay, AppFlexFonts, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { BoltIcon, CrownIcon } from '@/assets/animated-icons/crown';
import { describeAuthError, useSession } from '@/services/auth-service';
import { ACTIVITY_GROUPS, addPresetActivities, daysTo, deleteScoreEntry, formatPoints, getAnniversary, phaseOf, standings, todaysActivities, useAnniversaryState } from '@/services/anniversary-service';
import type { Alliance, Anniversary, ScoreEntry } from '@/services/anniversary-service';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The countdown number grows in weight on a narrow cut, so it stays a number.
const NUMBER_STEPS = ['GoogleSansFlex_300Light_ExtraCondensed', 'GoogleSansFlex_500Medium_Condensed', AppFlexFonts.numbers] as const;

const DAY_MS = 86_400_000;

/** The big line under the title: days to go, the day it is, or nothing once it ended. */
function countdownOf(anniversary: Anniversary, now: number) {
  const phase = phaseOf(anniversary, now);
  if (phase === 'before') {
    const days = daysTo(anniversary.startsAt, now);
    if (days <= 0) return { number: null, label: '¡Hoy empieza!' };
    return { number: String(days), label: days === 1 ? 'día para\nempezar' : 'días para\nempezar' };
  }
  if (phase === 'during') {
    const day = 1 - daysTo(anniversary.startsAt, now);
    const total = 1 + Math.round((new Date(anniversary.endsAt).setHours(0, 0, 0, 0) - new Date(anniversary.startsAt).setHours(0, 0, 0, 0)) / DAY_MS);
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
              : 'El CEE todavía no arma el aniversario. Cuando lo haga, aquí vas a ver tu alianza, el marcador y lo que viene.'}
          </ThemedText>
          {organizer && <HanetButton label="Armar el aniversario" variant="accent" onPress={() => router.push('/anniversary/setup')} />}
        </View>
      );
    }

    const rows = standings(anniversary, now);
    const mine = anniversary.alliances.find(alliance => alliance.id === anniversary.myAllianceId) ?? null;
    const myStanding = rows.find(alliance => alliance.id === mine?.id);
    const today = todaysActivities(anniversary, now);
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
          <MarqueeBanner {...banner} fontFamily={AppFlexFonts.numbers} />
        </View>

        {phase === 'after' && scored && <WinnerCard anniversary={anniversary} now={now} onShare={share} />}

        {mine && <AllianceCard alliance={mine} standing={myStanding} mine lead={anniversary.isLead} />}

        {organizer && (
          <View style={styles.tools}>
            <ThemedText style={styles.toolsTitle}>Organizar</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.toolsRow}>
              <HanetChip label="Prueba flash" icon={<BoltIcon size={16} color={AppColors.textPrimary} animated />} onPress={() => router.push('/anniversary/flash')} />
              <HanetChip label="Sumar o descontar" icon={<Ionicons name="swap-vertical" size={16} color={AppColors.textPrimary} />} onPress={() => router.push('/anniversary/points')} />
              <HanetChip label="Actividad" icon={<Ionicons name="add" size={16} color={AppColors.textPrimary} />} onPress={() => router.push('/anniversary/activity')} />
              <HanetChip label="Plazo" icon={<Ionicons name="alarm-outline" size={16} color={AppColors.textPrimary} />} onPress={() => router.push('/anniversary/deadline')} />
              <HanetChip label="Jefes de alianza" icon={<CrownIcon size={16} color={AppColors.textPrimary} />} onPress={() => router.push('/anniversary/leads')} />
              <HanetChip label="Alianzas y fechas" icon={<Ionicons name="color-palette-outline" size={16} color={AppColors.textPrimary} />} onPress={() => router.push('/anniversary/setup')} />
            </ScrollView>
          </View>
        )}

        <SectionTitle title="Marcador" detail={hidden && organizer ? 'Oculto para los demás' : undefined} />
        {phase !== 'after' && scored && <LeaderCard anniversary={anniversary} now={now} />}
        <Scoreboard anniversary={anniversary} now={now} />
        {share && phase !== 'after' && (
          <HanetButton label="Compartir el marcador" variant="surface" onPress={share} />
        )}

        {today.length > 0 && (
          <>
            <SectionTitle title="Hoy" />
            {today.map(activity => <ActivityRow key={activity.id} anniversary={anniversary} activity={activity} onPress={() => openActivity(activity.id)} />)}
          </>
        )}

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
              <View style={styles.groupTitle}>
                <GroupIcon group={group.value} size={20} color={AppColors.textSecondary} />
                <SectionTitle title={group.label} />
              </View>
              {list.map(activity => <ActivityRow key={activity.id} anniversary={anniversary} activity={activity} onPress={() => openActivity(activity.id)} />)}
            </View>
          );
        })}

        {anniversary.activities.length > 0 && organizer && (
          <HanetButton label={busy ? 'Cargando…' : 'Agregar las actividades típicas que falten'} variant="surface" disabled={busy} onPress={loadPresets} />
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
              {anniversary.history.map((entry, index) => {
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
                        hitSlop={8}
                        style={({ pressed }) => [styles.remove, pressed && AppPressed]}
                      >
                        <Ionicons name="trash-outline" size={16} color={AppColors.textPrimary} />
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
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false}>
        {!!anniversary && <EventGlow position="top" colors={glow} />}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: AppSpacing.md,
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
  tools: {
    gap: AppSpacing.sm,
  },
  toolsTitle: {
    ...AppType.caption,
    color: AppColors.textSecondary,
  },
  bleed: {
    marginHorizontal: -AppSpacing.lg,
  },
  toolsRow: {
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
  },
  alliances: {
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
  },
  allianceCard: {
    width: 260,
  },
  group: {
    gap: AppSpacing.md,
  },
  groupTitle: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: AppSpacing.sm,
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
  dialogButton: {
    flex: 1,
  },
});
