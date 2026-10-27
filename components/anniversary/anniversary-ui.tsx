import { GradientCard } from '@/components/anniversary/gradient-card';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppDisplay, AppFlexFonts, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { BoltIcon, CrownIcon } from '@/assets/animated-icons/crown';
import { formatPoints, standings } from '@/services/anniversary-service';
import type { ActivityGroup, Alliance, AllianceColor, Anniversary, AnniversaryActivity, Standing } from '@/services/anniversary-service';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

// The alianzas' colors are data the CEE picks, so they live here and not in
// the design tokens. `ink` is the text that reads on each one.
export const ALLIANCE_COLORS: Record<AllianceColor, { fill: string; ink: string; label: string }> = {
  rosa: { fill: '#EF2274', ink: '#F9F9FA', label: 'Rosa' },
  rojo: { fill: '#E5393B', ink: '#F9F9FA', label: 'Rojo' },
  naranjo: { fill: '#FF8A1F', ink: '#282829', label: 'Naranjo' },
  amarillo: { fill: '#FFCC00', ink: '#282829', label: 'Amarillo' },
  verde: { fill: '#2EBD6B', ink: '#282829', label: 'Verde' },
  celeste: { fill: '#5AC8FA', ink: '#282829', label: 'Celeste' },
  azul: { fill: '#3A62E0', ink: '#F9F9FA', label: 'Azul' },
  morado: { fill: '#8E4FD8', ink: '#F9F9FA', label: 'Morado' },
  blanco: { fill: '#F9F9FA', ink: '#282829', label: 'Blanco' },
  negro: { fill: '#111113', ink: '#F9F9FA', label: 'Negro' },
};

export const ALLIANCE_COLOR_ORDER = Object.keys(ALLIANCE_COLORS) as AllianceColor[];

// Medals of the podium, as the places read in sport.
const MEDALS = [AppColors.accentYellow, '#C9CDD6', '#D98C4E'];

export function allianceColor(alliance: Pick<Alliance, 'color'> | null | undefined) {
  return ALLIANCE_COLORS[alliance?.color ?? 'rosa'] ?? ALLIANCE_COLORS.rosa;
}

/** The fills of a list of alianzas, for gradients and confetti. */
export function allianceFills(alliances: Pick<Alliance, 'color'>[]) {
  return alliances.map(alliance => allianceColor(alliance).fill);
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function two(value: number) {
  return String(value).padStart(2, '0');
}

/** "15 jul, 18:00" */
export function shortWhen(ms: number) {
  const date = new Date(ms);
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}, ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** "15 de julio" */
export function dayText(ms: number) {
  const date = new Date(ms);
  return `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

/** "18:00" */
export function timeText(ms: number) {
  const date = new Date(ms);
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** "1°" */
export function placeLabel(index: number) {
  return `${index + 1}°`;
}

export function signedPoints(points: number) {
  return `${points > 0 ? '+' : '−'}${formatPoints(Math.abs(points))}`;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const GROUP_ICONS: Record<Exclude<ActivityGroup, 'flash'>, keyof typeof Ionicons.glyphMap> = {
  previas: 'calendar-outline',
  deportes: 'football-outline',
  velada: 'musical-notes-outline',
  show: 'sparkles-outline',
  otras: 'star-outline',
};

/** The icon of an activity's group (a flash test's bolt flickers). */
export function GroupIcon({ group, size = 20, color = AppColors.textPrimary, animated = false }: { group: ActivityGroup; size?: number; color?: string; animated?: boolean }) {
  if (group === 'flash') return <BoltIcon size={size} color={color} animated={animated} />;
  return <Ionicons name={GROUP_ICONS[group]} size={size} color={color} />;
}

/** A medal in the color of the place (1°, 2°, 3°), or the place number after them. */
export function PlaceMark({ place, size = 22 }: { place: number; size?: number }) {
  if (place < MEDALS.length) return <Ionicons name="medal" size={size} color={MEDALS[place]} accessibilityLabel={placeLabel(place)} />;
  return <ThemedText style={[styles.placeText, { width: size }]}>{placeLabel(place)}</ThemedText>;
}

// ─── Alianzas ────────────────────────────────────────────────────────────────

/** A round badge in the alianza's color with its mascot (or its first letter). */
export function AllianceBadge({ alliance, size = 36 }: { alliance: Pick<Alliance, 'color' | 'emoji' | 'name'>; size?: number }) {
  const color = allianceColor(alliance);
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color.fill },
        alliance.color === 'negro' && styles.outline,
      ]}
    >
      <ThemedText
        maxFontSizeMultiplier={1}
        style={alliance.emoji
          ? { fontSize: size * 0.55, lineHeight: size * 0.72 }
          : [styles.badgeLetter, { color: color.ink, fontSize: size * 0.45, lineHeight: size * 0.6 }]}
      >
        {alliance.emoji || alliance.name.trim().charAt(0).toLocaleUpperCase('es')}
      </ThemedText>
    </View>
  );
}

/** A round dot in the alianza's color. */
export function AllianceDot({ alliance, size = 12 }: { alliance: Pick<Alliance, 'color'>; size?: number }) {
  const color = allianceColor(alliance);
  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color.fill },
        alliance.color === 'negro' && styles.outline,
      ]}
    />
  );
}

/** A pill with the alianza's name (and mascot), in its color. */
export function AlliancePill({ alliance, prefix, style }: { alliance: Pick<Alliance, 'color' | 'name' | 'emoji'>; prefix?: string; style?: StyleProp<ViewStyle> }) {
  const color = allianceColor(alliance);
  const name = alliance.emoji ? `${alliance.emoji} ${alliance.name}` : alliance.name;
  return (
    <View style={[styles.pill, { backgroundColor: color.fill }, alliance.color === 'negro' && styles.outline, style]}>
      <ThemedText numberOfLines={1} style={[styles.pillText, { color: color.ink }]}>
        {prefix ? `${prefix} ${name}` : name}
      </ThemedText>
    </View>
  );
}

/** Opens the alianza's Instagram (photos and videos live there, not in HaNet). */
export function InstagramButton({ handle, light = true }: { handle: string; light?: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Instagram de la alianza, @${handle}`}
      onPress={() => void Linking.openURL(`https://instagram.com/${handle}`)}
      hitSlop={6}
      style={({ pressed }) => [styles.instagram, light ? styles.instagramLight : styles.instagramDark, pressed && AppPressed]}
    >
      <Ionicons name="logo-instagram" size={16} color={light ? AppColors.textOnLight : AppColors.textPrimary} />
      <ThemedText numberOfLines={1} style={[styles.instagramText, !light && styles.instagramTextDark]}>@{handle}</ThemedText>
    </Pressable>
  );
}

/** An alianza as a lit card: mascot, name, theme, motto and its Instagram. */
export function AllianceCard({ alliance, standing, mine, lead, style }: {
  alliance: Alliance;
  standing?: Standing;
  mine?: boolean;
  lead?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const color = allianceColor(alliance);
  const scored = standing && standing.total !== null;
  return (
    <GradientCard colors={[color.fill]} style={[styles.allianceCard, style]}>
      <View style={styles.allianceTop}>
        <AllianceBadge alliance={alliance} size={52} />
        {scored && (
          <View style={styles.allianceScore}>
            <ThemedText style={styles.allianceScorePoints}>{formatPoints(standing.total ?? 0)}</ThemedText>
            <ThemedText style={styles.onColorSoft}>{placeLabel(standing.place)} lugar</ThemedText>
          </View>
        )}
      </View>
      <View style={styles.allianceText}>
        {mine && <ThemedText style={styles.kicker}>Tu alianza</ThemedText>}
        <ThemedText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.allianceName}>{alliance.name}</ThemedText>
        {!!alliance.theme && <ThemedText numberOfLines={2} style={styles.onColorSoft}>{alliance.theme}</ThemedText>}
        {!!alliance.motto && <ThemedText numberOfLines={3} style={styles.motto}>“{alliance.motto}”</ThemedText>}
      </View>
      {lead && (
        <View style={styles.leadBadge}>
          <CrownIcon size={14} color={AppColors.textOnLight} />
          <ThemedText style={styles.leadText}>Eres jefe de alianza</ThemedText>
        </View>
      )}
      {!!alliance.instagram && <InstagramButton handle={alliance.instagram} />}
    </GradientCard>
  );
}

// ─── Marcador ────────────────────────────────────────────────────────────────

/** "Va ganando": the leader on its own colors, with what it added today. */
export function LeaderCard({ anniversary, now }: { anniversary: Anniversary; now: number }) {
  const rows = standings(anniversary, now);
  const [leader, second] = rows;
  if (!leader || leader.total === null || leader.total <= 0) return null;
  const gap = second && second.total !== null ? leader.total - second.total : null;
  return (
    <GradientCard colors={[allianceColor(leader).fill, ...(second ? [allianceColor(second).fill] : [])]} style={styles.leader}>
      <View style={styles.leaderHead}>
        <CrownIcon size={22} color={MEDALS[0]} animated />
        <ThemedText style={styles.kicker}>Va ganando</ThemedText>
      </View>
      <View style={styles.leaderRow}>
        <AllianceBadge alliance={leader} size={56} />
        <View style={styles.leaderText}>
          <ThemedText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.leaderName}>{leader.name}</ThemedText>
          <ThemedText style={styles.onColorSoft}>
            {gap !== null && gap > 0 ? `${formatPoints(gap)} sobre ${second?.name}` : gap === 0 ? `Empatada con ${second?.name}` : 'Primer lugar'}
          </ThemedText>
        </View>
      </View>
      <View style={styles.leaderNumbers}>
        <ThemedText accessibilityLabel={`${formatPoints(leader.total)} puntos`} style={styles.leaderPoints}>{formatPoints(leader.total)}</ThemedText>
        {leader.today > 0 && <ThemedText style={styles.leaderToday}>+{formatPoints(leader.today)} hoy</ThemedText>}
      </View>
    </GradientCard>
  );
}

function RaceBar({ share, color, delay }: { share: number; color: string; delay: number }) {
  const reduceMotion = useReducedMotion();
  const grow = useSharedValue(reduceMotion ? share : 0);
  useEffect(() => {
    grow.value = reduceMotion ? share : withDelay(delay, withTiming(share, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [delay, grow, reduceMotion, share]);
  const style = useAnimatedStyle(() => ({ width: `${grow.value * 100}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />
    </View>
  );
}

function Movement({ moved }: { moved: number }) {
  if (!moved) return null;
  const up = moved > 0;
  return (
    <View accessibilityLabel={up ? `Subió ${moved} hoy` : `Bajó ${-moved} hoy`} style={styles.moved}>
      <Ionicons name={up ? 'caret-up' : 'caret-down'} size={12} color={up ? AppColors.accentMint : AppColors.errorText} />
      <ThemedText style={[styles.movedText, { color: up ? AppColors.accentMint : AppColors.errorText }]}>{Math.abs(moved)}</ThemedText>
    </View>
  );
}

/** The race: one bar per alianza, as long as its points next to the leader's. */
export function Scoreboard({ anniversary, now }: { anniversary: Anniversary; now: number }) {
  const rows = standings(anniversary, now);
  const hidden = rows.some(alliance => alliance.total === null);
  const top = Math.max(1, ...rows.map(alliance => Math.max(0, alliance.total ?? 0)));
  const anyPoints = rows.some(alliance => (alliance.total ?? 0) !== 0);

  if (hidden) {
    return (
      <GradientCard colors={allianceFills(anniversary.alliances)} style={styles.hiddenCard}>
        <Ionicons name="eye-off-outline" size={28} color={AppColors.textPrimary} />
        <ThemedText style={styles.hiddenTitle}>Marcador oculto</ThemedText>
        <ThemedText style={styles.onColorSoft}>El CEE lo guarda para revelar la alianza ganadora en la premiación.</ThemedText>
        <View style={styles.hiddenBadges}>
          {rows.map(alliance => <AllianceBadge key={alliance.id} alliance={alliance} size={32} />)}
        </View>
      </GradientCard>
    );
  }

  return (
    <View style={styles.scoreboard} accessibilityLabel="Marcador">
      {rows.map((alliance, index) => {
        const color = allianceColor(alliance);
        const mine = alliance.id === anniversary.myAllianceId;
        const share = Math.max(0.03, Math.max(0, alliance.total ?? 0) / top);
        return (
          <View
            key={alliance.id}
            accessible
            accessibilityLabel={`${index + 1}° lugar, ${alliance.name}${mine ? ', tu alianza' : ''}: ${formatPoints(alliance.total ?? 0)} puntos`}
            style={[styles.scoreRow, mine && styles.scoreRowMine]}
          >
            <View style={styles.scoreHead}>
              <ThemedText style={[styles.scorePlace, index === 0 && anyPoints && { color: MEDALS[0] }]}>{index + 1}</ThemedText>
              <AllianceBadge alliance={alliance} size={34} />
              <View style={styles.scoreNameBox}>
                <View style={styles.scoreNameRow}>
                  <ThemedText numberOfLines={1} style={styles.scoreName}>{alliance.name}</ThemedText>
                  {index === 0 && anyPoints && <CrownIcon size={16} color={MEDALS[0]} />}
                </View>
                {(mine || alliance.today !== 0) && (
                  <ThemedText style={styles.scoreDetail}>
                    {[mine ? 'Tu alianza' : null, alliance.today ? `${signedPoints(alliance.today)} hoy` : null].filter(Boolean).join(' · ')}
                  </ThemedText>
                )}
              </View>
              <Movement moved={alliance.moved} />
              <ThemedText style={styles.scorePoints}>{formatPoints(alliance.total ?? 0)}</ThemedText>
            </View>
            <RaceBar share={anyPoints ? share : 0} color={color.fill} delay={index * 80} />
          </View>
        );
      })}
      {!anyPoints && <ThemedText style={styles.scoreEmpty}>Todavía no hay puntos. Se suman solos con cada resultado.</ThemedText>}
    </View>
  );
}

// ─── Actividades ─────────────────────────────────────────────────────────────

/** How an activity went: the podium, the points by hand, or nothing yet. */
export function resultSummary(anniversary: Anniversary, activity: AnniversaryActivity) {
  const byId = new Map(anniversary.alliances.map(alliance => [alliance.id, alliance]));
  if (Array.isArray(activity.result)) {
    return activity.result.map((id, index) => ({ alliance: byId.get(id), place: index, points: activity.points[index] ?? null }))
      .filter(item => !!item.alliance) as { alliance: Alliance; place: number; points: number | null }[];
  }
  if (activity.result && typeof activity.result === 'object') {
    const points = activity.result as Record<string, number>;
    return anniversary.alliances
      .map(alliance => ({ alliance, place: -1, points: points[alliance.id] ?? 0 }))
      .filter(item => item.points !== 0)
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  }
  return [];
}

/** A row of the activities list: its group's icon, name, when, and who won. */
export function ActivityRow({ anniversary, activity, onPress }: { anniversary: Anniversary; activity: AnniversaryActivity; onPress: () => void }) {
  const summary = resultSummary(anniversary, activity);
  const when = activity.startsAt ? shortWhen(activity.startsAt) : null;
  const detail = [when, activity.place].filter(Boolean).join(' · ');
  const winner = summary[0]?.alliance;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Ver la actividad"
      onPress={onPress}
      style={({ pressed }) => [styles.activity, pressed && AppPressed]}
    >
      {winner && <View style={[styles.activityStripe, { backgroundColor: allianceColor(winner).fill }]} />}
      <View style={[styles.groupTile, activity.flash && styles.groupTileFlash]}>
        <GroupIcon group={activity.group} color={activity.flash ? AppColors.textOnLight : AppColors.textPrimary} animated={activity.flash && !summary.length} />
      </View>
      <View style={styles.activityText}>
        <ThemedText numberOfLines={2} style={styles.activityName}>{activity.name}</ThemedText>
        {!!detail && <ThemedText numberOfLines={1} style={styles.activityDetail}>{detail}</ThemedText>}
        {summary.length ? (
          <View style={styles.activityResult}>
            {summary.slice(0, 3).map(item => (
              <View key={item.alliance.id} style={styles.resultItem}>
                {item.place >= 0 ? <PlaceMark place={item.place} size={14} /> : <ThemedText style={styles.resultPoints}>{signedPoints(item.points ?? 0)}</ThemedText>}
                <AllianceBadge alliance={item.alliance} size={20} />
              </View>
            ))}
          </View>
        ) : (
          <ThemedText style={styles.pending}>Sin resultado todavía</ThemedText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={AppColors.textSecondary} />
    </Pressable>
  );
}

/** Title of a block of the page. */
export function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <ThemedText accessibilityRole="header" style={styles.sectionText}>{title}</ThemedText>
      {!!detail && <ThemedText style={styles.sectionDetail}>{detail}</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    flexShrink: 0,
  },
  outline: {
    borderWidth: 1,
    borderColor: AppColors.surfaceMuted,
  },
  badge: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLetter: {
    ...AppDisplay.name,
  },
  placeText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    textAlign: 'center',
    color: AppColors.textSecondary,
  },
  pill: {
    maxWidth: '100%',
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.xs,
    borderRadius: AppRadii.pill,
  },
  pillText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
  },
  instagram: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xs,
    maxWidth: '100%',
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.pill,
  },
  instagramLight: {
    backgroundColor: AppColors.controlActive,
  },
  instagramDark: {
    backgroundColor: AppColors.surfaceMuted,
  },
  instagramText: {
    flexShrink: 1,
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textOnLight,
  },
  instagramTextDark: {
    color: AppColors.textPrimary,
  },
  kicker: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: AppColors.textPrimary,
  },
  onColorSoft: {
    ...AppType.footnote,
    color: AppColors.textPrimary,
    opacity: 0.78,
  },
  allianceCard: {
    gap: AppSpacing.md,
  },
  allianceTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  allianceScore: {
    alignItems: 'flex-end',
  },
  allianceScorePoints: {
    ...AppDisplay.score,
    color: AppColors.textPrimary,
  },
  allianceText: {
    gap: 2,
  },
  allianceName: {
    ...AppDisplay.title,
    // One cut narrower than the titles: alianza names run long.
    fontFamily: AppFlexFonts.ramp[3],
    color: AppColors.textPrimary,
  },
  motto: {
    marginTop: AppSpacing.xs,
    ...AppType.callout,
    fontFamily: 'DMSans_400Regular_Italic',
    color: AppColors.textPrimary,
  },
  leadBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xs,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.xs,
    borderRadius: AppRadii.pill,
    backgroundColor: MEDALS[0],
  },
  leadText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textOnLight,
  },
  leader: {
    gap: AppSpacing.md,
  },
  leaderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  leaderText: {
    flex: 1,
    gap: 2,
  },
  leaderName: {
    ...AppDisplay.title,
    fontFamily: AppFlexFonts.ramp[3],
    color: AppColors.textPrimary,
  },
  leaderNumbers: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: AppSpacing.md,
  },
  leaderPoints: {
    ...AppDisplay.number,
    color: AppColors.textPrimary,
  },
  leaderToday: {
    marginBottom: AppSpacing.sm,
    ...AppType.headline,
    color: AppColors.textPrimary,
    opacity: 0.85,
  },
  hiddenCard: {
    gap: AppSpacing.sm,
  },
  hiddenTitle: {
    ...AppDisplay.title,
    color: AppColors.textPrimary,
  },
  hiddenBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.sm,
  },
  scoreboard: {
    gap: AppSpacing.xs,
    padding: AppSpacing.sm,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  scoreRow: {
    gap: AppSpacing.sm,
    padding: AppSpacing.sm,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
  },
  scoreRowMine: {
    backgroundColor: AppColors.surfaceMuted,
  },
  scoreHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  scorePlace: {
    width: 24,
    ...AppDisplay.score,
    fontSize: 22,
    textAlign: 'center',
    color: AppColors.textSecondary,
  },
  scoreNameBox: {
    flex: 1,
    gap: 1,
  },
  scoreNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xs,
  },
  scoreName: {
    flexShrink: 1,
    ...AppDisplay.name,
    color: AppColors.textPrimary,
  },
  scoreDetail: {
    ...AppType.caption,
    color: AppColors.textSecondary,
  },
  scorePoints: {
    ...AppDisplay.score,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    color: AppColors.textPrimary,
  },
  scoreEmpty: {
    padding: AppSpacing.sm,
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
  moved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  movedText: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
  },
  track: {
    height: 8,
    marginLeft: 24 + AppSpacing.sm,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.canvas,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: AppRadii.pill,
  },
  activity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    overflow: 'hidden',
    padding: AppSpacing.md,
    paddingLeft: AppSpacing.md + 4,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  activityStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  groupTile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  groupTileFlash: {
    backgroundColor: MEDALS[0],
  },
  activityText: {
    flex: 1,
    gap: 2,
  },
  activityName: {
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  activityDetail: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
  activityResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    marginTop: AppSpacing.xs,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultPoints: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
  },
  pending: {
    marginTop: AppSpacing.xs,
    ...AppType.caption,
    color: AppColors.textSecondary,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
    marginTop: AppSpacing.lg,
  },
  sectionText: {
    ...AppDisplay.section,
    color: AppColors.textPrimary,
  },
  sectionDetail: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
});
