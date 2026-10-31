import { AllianceBadge, allianceColor, allianceFills, allianceOwnFills, allianceSecond, dayText } from '@/components/anniversary/anniversary-ui';
import { FLAG_GLOW_AVAILABLE, FlagGlow } from '@/components/anniversary/flag-surface';
import { GradientCard } from '@/components/anniversary/gradient-card';
import { ThemedText } from '@/components/themed-text';
import { CrownIcon } from '@/assets/animated-icons/crown';
import { AppColors, AppFlexFonts, AppPressed } from '@/constants/design-tokens';
import { anniversaryDay, daysTo, formatPoints, movements, standings } from '@/services/anniversary-service';
import type { Alliance, Anniversary, AnniversaryPhase, Standing } from '@/services/anniversary-service';
import { feedWhen } from '@/services/feed-service';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Rect, RadialGradient, Stop } from 'react-native-svg';

// The Home during alianza week: the top lit by the alianzas' colors and,
// under the banner, a carousel of two cards. The first is one's own alianza
// (place, points and the last movement) on its waving colors; swiping shows
// every alianza as a row of rings, which come in one after another with the
// finger. Either card opens the score sheet.

export const GLOW_HEIGHT = 262;
// While it runs the light waves and goes further down the page, but fainter.
const WAVING_REACH = 620;
// Room above the page, as far as an iOS bounce can pull it.
const OVERSCROLL = 600;
const CARD_HEIGHT = 138;
const SIDE = 16;

/** Seconds that tick, only while the countdown is on screen. */
function useTicking(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function two(value: number) {
  return String(value).padStart(2, '0');
}

/** "05:15:23:02": days, hours, minutes and seconds left. */
function countdown(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60].map(two).join(':');
}

/**
 * The top of the Home lit by every alianza's color, fading into the page.
 * `waving` (the anniversary days) makes it a flag with dots (on phones).
 */
export function AnniversaryGlow({ alliances, width, waving }: { alliances: Pick<Alliance, 'color'>[]; width: number; waving?: boolean }) {
  const fills = allianceFills(alliances).slice(0, 4);
  const colors = fills.length ? fills : [AppColors.accent];
  if (waving && FLAG_GLOW_AVAILABLE) {
    return (
      <View pointerEvents="none" style={[styles.glow, { top: -OVERSCROLL, height: OVERSCROLL + WAVING_REACH }]}>
        <FlagGlow colors={colors} width={width} top={OVERSCROLL} reach={WAVING_REACH} />
      </View>
    );
  }
  const height = GLOW_HEIGHT;
  // The light goes on above the page (like the events' glow), so pulling the
  // Home past its top on iOS shows more color instead of a cut.
  const extra = OVERSCROLL;
  const center = extra + height * 0.12;
  const column = (index: number) => (colors.length === 1 ? 0.5 : (index + 0.5) / colors.length);
  return (
    <View pointerEvents="none" style={[styles.glow, { top: -extra, height: height + extra }]}>
      <Svg width={width} height={height + extra}>
        <Defs>
          {colors.map((color, index) => (
            <RadialGradient key={index} id={`home-glow-${index}`} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={color} stopOpacity={0.75} />
              <Stop offset="0.55" stopColor={color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          ))}
          <LinearGradient id="home-glow-above" x1="0" y1="0" x2="1" y2="0">
            {colors.map((color, index) => <Stop key={index} offset={column(index)} stopColor={color} stopOpacity={0.45} />)}
          </LinearGradient>
          <LinearGradient id="home-glow-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={AppColors.textOnLight} stopOpacity={0} />
            <Stop offset="0.6" stopColor={AppColors.textOnLight} stopOpacity={0.35} />
            <Stop offset="1" stopColor={AppColors.textOnLight} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={center} fill="url(#home-glow-above)" />
        {colors.map((_, index) => (
          <Ellipse key={index} cx={width * column(index)} cy={center} rx={width * 0.55} ry={height * 0.7} fill={`url(#home-glow-${index})`} />
        ))}
        <Rect x={0} y={extra} width={width} height={height} fill="url(#home-glow-fade)" />
      </Svg>
    </View>
  );
}

/** The card's bottom line: when it starts, the last movement while it runs, the winner after. */
function liveLine(anniversary: Anniversary, phase: AnniversaryPhase, rows: Standing[], now: number) {
  if (phase === 'before') {
    return { text: `${anniversary.alliances.length} alianzas · Empieza el ${dayText(anniversary.startsAt)}`, live: false };
  }
  if (phase === 'after') {
    const [leader] = rows;
    if (leader && leader.total !== null && leader.total > 0) return { text: `¡Ganó ${leader.name}!`, live: false };
    return { text: '¡Gracias por este aniversario!', live: false };
  }
  const [last] = movements(anniversary);
  const alliance = last ? anniversary.alliances.find(item => item.id === last.allianceId) : undefined;
  if (last && alliance) {
    const when = last.at ? ` · ${feedWhen(last.at, now).toLocaleLowerCase('es')}` : '';
    const won = last.kind === 'result' && (last.place === 0 || last.place === null);
    const what = won ? `${alliance.name} ganó ${last.reason}`
      : last.points === null ? `${alliance.name}: ${(last.place ?? 0) + 1}° en ${last.reason}`
        : last.points > 0 ? `${alliance.name} +${formatPoints(last.points)} · ${last.reason}`
          : `${alliance.name} −${formatPoints(-last.points)} · ${last.reason}`;
    return { text: `${what}${when}`, live: true };
  }
  const { day, total } = anniversaryDay(anniversary, now);
  return { text: `Día ${day} de ${total} · Todavía no hay puntos`, live: false };
}

/** A mascot inside a ring in the alianza's two colors. */
function MascotRing({ alliance, size, id }: { alliance: Alliance; size: number; id: string }) {
  const from = allianceColor(alliance).fill;
  const to = allianceSecond(alliance)?.fill ?? AppColors.textPrimary;
  const stroke = Math.max(2.5, size * 0.05);
  return (
    <View style={[styles.ring, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - stroke / 2} stroke={`url(#${id})`} strokeWidth={stroke} fill="none" />
      </Svg>
      <AllianceBadge alliance={alliance} size={size - stroke * 2 - 4} />
    </View>
  );
}

type CardProps = { anniversary: Anniversary; phase: AnniversaryPhase; rows: Standing[]; scored: boolean; hidden: boolean; onOpen: () => void };

/** First card: one's own alianza (or who leads, for those without one) on its colors. */
function MineCard({ anniversary, phase, rows, scored, hidden, onOpen }: CardProps) {
  const now = useTicking(phase === 'before');
  // When the countdown reaches zero the card moves on by itself.
  if (phase === 'before' && now >= anniversary.startsAt) phase = 'during';
  const mine = rows.find(alliance => alliance.id === anniversary.myAllianceId) ?? null;
  const shown = mine ?? (scored ? rows[0] : null);
  const line = liveLine(anniversary, phase, rows, now);
  const kicker = mine
    ? `Tu alianza${scored && phase !== 'before' ? ` · ${mine.place + 1}° lugar` : ''}`
    : shown ? (phase === 'after' ? 'Ganadora' : 'Va ganando') : anniversary.title;
  const name = shown?.name ?? `${anniversary.alliances.length} alianzas`;
  const points = scored && shown && phase !== 'before' ? formatPoints(shown.total ?? 0) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kicker}, ${name}${points ? `, ${points} puntos` : ''}. ${line.text}. Ver el registro de puntos`}
      onPress={onOpen}
      style={({ pressed }) => [styles.page, pressed && styles.pressed]}
    >
      <GradientCard colors={shown ? allianceOwnFills(shown) : allianceFills(anniversary.alliances)} style={styles.card}>
        <View style={styles.cardTop}>
          {shown && <MascotRing alliance={shown} size={56} id={`mine-ring-${shown.id}`} />}
          <View style={styles.cardName}>
            <ThemedText numberOfLines={1} style={styles.kicker}>{kicker}</ThemedText>
            <ThemedText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.name}>{name}</ThemedText>
          </View>
          {phase === 'before' ? (
            <View style={styles.cardRight}>
              <ThemedText style={styles.countdown}>{countdown(anniversary.startsAt - now)}</ThemedText>
              <ThemedText style={styles.unit}>para empezar</ThemedText>
            </View>
          ) : points ? (
            <View style={styles.cardRight}>
              <ThemedText style={styles.points}>{points}</ThemedText>
              <ThemedText style={styles.unit}>puntos</ThemedText>
            </View>
          ) : hidden ? (
            <View style={styles.cardRight}>
              <Ionicons name="eye-off-outline" size={22} color={AppColors.textPrimary} />
              <ThemedText style={styles.unit}>Marcador oculto</ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.divider} />
        <View style={styles.liveRow}>
          {line.live && <View style={styles.liveDot} />}
          <ThemedText numberOfLines={1} style={styles.liveText}>{line.text}</ThemedText>
          <Ionicons name="chevron-forward" size={16} color={AppColors.textSecondary} />
        </View>
      </GradientCard>
    </Pressable>
  );
}

/** One alianza of the second card: it rises in as the card slides into view. */
function RingItem({ standing, index, count, size, mine, leader, scored, progress, still }: {
  standing: Standing; index: number; count: number; size: number; mine: boolean; leader: boolean; scored: boolean; progress: SharedValue<number>; still: boolean;
}) {
  // Each one starts a little after the one before, so they come in as a wave
  // that follows the finger (and goes back if the swipe does).
  const from = 0.2 + (index / Math.max(1, count)) * 0.4;
  const style = useAnimatedStyle(() => {
    const t = still ? 1 : interpolate(progress.value, [from, from + 0.4], [0, 1], Extrapolation.CLAMP);
    const eased = t * t * (3 - 2 * t);
    return { opacity: eased, transform: [{ translateY: (1 - eased) * 14 }, { scale: 0.7 + 0.3 * eased }] };
  });
  const crown = useAnimatedStyle(() => {
    const t = still ? 1 : interpolate(progress.value, [0.75, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 6 }, { rotate: `${(1 - t) * -20}deg` }] };
  });
  return (
    <Animated.View style={[styles.ringItem, style]}>
      <View>
        <MascotRing alliance={standing} size={size} id={`ring-${standing.id}`} />
        {leader && (
          <Animated.View style={[styles.crown, crown]}>
            <CrownIcon size={18} color={AppColors.accentYellow} />
          </Animated.View>
        )}
        {mine && (
          <View style={styles.you}>
            <ThemedText maxFontSizeMultiplier={1} style={styles.youText}>Tú</ThemedText>
          </View>
        )}
      </View>
      <ThemedText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.ringName}>{standing.name}</ThemedText>
      {scored && <ThemedText style={styles.ringPoints}>{formatPoints(standing.total ?? 0)}</ThemedText>}
    </Animated.View>
  );
}

/** Second card: every alianza as a ring, by place (by name while hidden or before it starts). */
function RingsCard({ anniversary, phase, rows, scored, hidden, onOpen, progress, width }: CardProps & { progress: SharedValue<number>; width: number }) {
  const reduceMotion = useReducedMotion();
  const showPoints = scored && phase !== 'before';
  const ordered = showPoints ? rows : [...rows].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const leaderId = showPoints && !hidden ? rows[0]?.id : null;
  const inner = width - SIDE * 2 - 24;
  const size = Math.max(40, Math.min(62, (inner - (ordered.length - 1) * 10) / ordered.length - 6));
  const label = ordered.map(alliance => `${alliance.name}${showPoints ? ` ${formatPoints(alliance.total ?? 0)}` : ''}`).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Alianzas: ${label}. Ver el registro de puntos`}
      onPress={onOpen}
      style={({ pressed }) => [styles.page, pressed && styles.pressed]}
    >
      <View style={[styles.card, styles.glass]}>
        <View style={styles.rings}>
          {ordered.map((standing, index) => (
            <RingItem
              key={standing.id}
              standing={standing}
              index={index}
              count={ordered.length}
              size={size}
              mine={standing.id === anniversary.myAllianceId}
              leader={standing.id === leaderId}
              scored={showPoints}
              progress={progress}
              still={reduceMotion}
            />
          ))}
        </View>
      </View>
    </Pressable>
  );
}

function PageDot({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const near = interpolate(Math.abs(progress.value - index), [0, 1], [1, 0], Extrapolation.CLAMP);
    return { width: 6 + 10 * near, opacity: 0.35 + 0.65 * near };
  });
  return <Animated.View style={[styles.pageDot, style]} />;
}

/**
 * Under the banner: one's alianza and, swiping, all of them. With the score
 * hidden or before it starts no points show, and the rings go by name.
 */
export function AnniversaryCarousel({ anniversary, phase, onOpen }: { anniversary: Anniversary; phase: AnniversaryPhase; onOpen: () => void }) {
  const [width, setWidth] = useState(0);
  const [now] = useState(() => Date.now());
  const progress = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(event => {
    progress.value = width ? event.contentOffset.x / width : 0;
  }, [width]);
  const rows = standings(anniversary, now);
  if (!rows.length) return null;
  const hidden = rows.some(alliance => alliance.total === null);
  const scored = !hidden && rows.some(alliance => (alliance.total ?? 0) > 0);
  const props = { anniversary, phase, rows, scored, hidden, onOpen };

  return (
    <View style={styles.carousel} onLayout={event => setWidth(Math.round(event.nativeEvent.layout.width))}>
      {width > 0 && (
        <>
          <Animated.ScrollView
            horizontal
            pagingEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
          >
            <View style={{ width }}><MineCard {...props} /></View>
            <View style={{ width }}><RingsCard {...props} progress={progress} width={width} /></View>
          </Animated.ScrollView>
          <View style={styles.pageDots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <PageDot index={0} progress={progress} />
            <PageDot index={1} progress={progress} />
          </View>
        </>
      )}
    </View>
  );
}

/** The banner's small line over the institution's name. */
export function anniversaryKicker(anniversary: Anniversary, phase: AnniversaryPhase, now = Date.now()) {
  if (phase === 'during') return '¡Estamos de aniversario!';
  if (phase === 'after') return anniversary.title;
  const days = daysTo(anniversary.startsAt, now);
  return days <= 0 ? `Hoy empieza ${anniversary.title}` : days === 1 ? `Mañana empieza ${anniversary.title}` : `Faltan ${days} días para ${anniversary.title}`;
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  carousel: {
    marginBottom: 24,
    minHeight: CARD_HEIGHT + 16,
  },
  page: {
    paddingHorizontal: SIDE,
  },
  pressed: {
    opacity: AppPressed.opacity,
  },
  card: {
    height: CARD_HEIGHT,
    padding: 16,
    gap: 12,
    borderRadius: 24,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  glass: {
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: 'rgba(60,59,62,0.55)',
  },
  cardTop: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardName: {
    flex: 1,
    gap: 2,
  },
  kicker: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 15,
    color: AppColors.textSecondary,
  },
  name: {
    fontFamily: AppFlexFonts.wide,
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  points: {
    fontFamily: AppFlexFonts.numbers,
    fontSize: 34,
    lineHeight: 38,
    color: AppColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  countdown: {
    fontFamily: AppFlexFonts.numbers,
    fontSize: 22,
    lineHeight: 26,
    color: AppColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 15,
    color: AppColors.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.accentMint,
  },
  liveText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 17,
    color: AppColors.textPrimary,
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rings: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
  },
  ringItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  crown: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
  },
  you: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: AppColors.canvas,
    backgroundColor: AppColors.textPrimary,
  },
  youText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 10,
    lineHeight: 13,
    color: AppColors.textOnLight,
  },
  ringName: {
    marginTop: 4,
    fontFamily: AppFlexFonts.wide,
    fontSize: 13,
    lineHeight: 17,
    color: AppColors.textPrimary,
  },
  ringPoints: {
    marginTop: -3,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 15,
    color: AppColors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  pageDot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.textPrimary,
  },
});
