import { AllianceBadge, PlaceMark, allianceColor, allianceFills, allianceSecond } from '@/components/anniversary/anniversary-ui';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppFlexFonts, AppPressed } from '@/constants/design-tokens';
import { anniversaryDay, daysTo, formatPoints, movements, standings } from '@/services/anniversary-service';
import type { Alliance, Anniversary, AnniversaryPhase, Standing } from '@/services/anniversary-service';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Rect, RadialGradient, Stop } from 'react-native-svg';

// The Home during alianza week (Figma "Home aniversario", before and during):
// the top lit by the alianzas' colors, a strip with the countdown or the last
// movement, and the leader's and one's own alianza's strips under the banner.
// Tapping the top strip or one's own opens the score sheet.

export const GLOW_HEIGHT = 262;

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

/** The top of the Home lit by every alianza's color, fading into the page. */
export function AnniversaryGlow({ alliances, width }: { alliances: Pick<Alliance, 'color'>[]; width: number }) {
  const fills = allianceFills(alliances).slice(0, 4);
  const colors = fills.length ? fills : [AppColors.accent];
  const height = GLOW_HEIGHT;
  return (
    <View pointerEvents="none" style={[styles.glow, { height }]}>
      <Svg width={width} height={height}>
        <Defs>
          {colors.map((color, index) => (
            <RadialGradient key={index} id={`home-glow-${index}`} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={color} stopOpacity={0.75} />
              <Stop offset="0.55" stopColor={color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          ))}
          <LinearGradient id="home-glow-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={AppColors.textOnLight} stopOpacity={0} />
            <Stop offset="0.6" stopColor={AppColors.textOnLight} stopOpacity={0.35} />
            <Stop offset="1" stopColor={AppColors.textOnLight} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        {colors.map((_, index) => {
          const x = colors.length === 1 ? width / 2 : (width * (index + 0.5)) / colors.length;
          return <Ellipse key={index} cx={x} cy={height * 0.12} rx={width * 0.55} ry={height * 0.7} fill={`url(#home-glow-${index})`} />;
        })}
        <Rect x={0} y={0} width={width} height={height} fill="url(#home-glow-fade)" />
      </Svg>
    </View>
  );
}

/** A full-width strip in an alianza's colors: its main fill into its second one (or a lighter self). */
function StripFill({ alliance, height, style, children }: { alliance: Pick<Alliance, 'color' | 'color2'> | null; height: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const [width, setWidth] = useState(0);
  const color = alliance ? allianceColor(alliance) : null;
  const from = color?.fill ?? AppColors.accent;
  const to = (alliance && allianceSecond(alliance)?.fill) ?? from;
  return (
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[styles.strip, { height, backgroundColor: from }, style]}>
      {width > 0 && to !== from && (
        <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`strip-${alliance?.color}-${alliance?.color2}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0.35" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill={`url(#strip-${alliance?.color}-${alliance?.color2})`} />
        </Svg>
      )}
      {children}
    </View>
  );
}

/** What the top strip says, and in whose colors. */
function topLine(anniversary: Anniversary, phase: AnniversaryPhase, now: number) {
  const byId = new Map(anniversary.alliances.map(alliance => [alliance.id, alliance]));
  const mine = anniversary.myAllianceId ? byId.get(anniversary.myAllianceId) ?? null : null;
  if (phase === 'after') {
    const [leader] = standings(anniversary, now);
    if (leader && leader.total !== null && leader.total > 0) return { text: `¡Ganó ${leader.name}!`, alliance: leader as Alliance };
    return { text: '¡Gracias por este aniversario!', alliance: mine };
  }
  const [last] = movements(anniversary);
  const alliance = last ? byId.get(last.allianceId) : undefined;
  if (last && alliance) {
    if (last.points === null) {
      return { text: last.place === 0 || last.place === null ? `¡${alliance.name} ganó ${last.reason}!` : `${alliance.name}: ${last.place + 1}° en ${last.reason}`, alliance };
    }
    return last.points > 0
      ? { text: `¡${alliance.name} ganó ${formatPoints(last.points)} puntos!`, alliance }
      : { text: `${alliance.name} perdió ${formatPoints(-last.points)} puntos`, alliance };
  }
  const { day, total } = anniversaryDay(anniversary, now);
  return { text: `¡Día ${day} de ${total} del aniversario!`, alliance: mine };
}

function Arrow({ color, size = 21 }: { color: string; size?: number }) {
  return <Ionicons name="arrow-up-outline" size={size} color={color} style={styles.arrow} />;
}

/**
 * Under the title: the countdown before it starts (static copies at the
 * sides), the last movement while it runs, the winner after. Opens the score.
 */
export function AnniversaryTopStrip({ anniversary, phase, onPress }: { anniversary: Anniversary; phase: AnniversaryPhase; onPress: () => void }) {
  const now = useTicking(phase === 'before');
  const mine = anniversary.alliances.find(alliance => alliance.id === anniversary.myAllianceId) ?? null;

  if (phase === 'before') {
    const time = countdown(anniversary.startsAt - now);
    const ink = mine ? allianceColor(mine).ink : AppColors.textPrimary;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Faltan ${daysTo(anniversary.startsAt, now)} días para ${anniversary.title}. Ver las alianzas`}
        onPress={onPress}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <StripFill alliance={mine} height={35}>
          <View style={styles.countdownRow}>
            <ThemedText numberOfLines={1} style={[styles.countdown, styles.countdownSide, { color: ink }]}>{time}</ThemedText>
            <ThemedText numberOfLines={1} style={[styles.countdown, { color: ink }]}>{time}</ThemedText>
            <ThemedText numberOfLines={1} style={[styles.countdown, styles.countdownSide, { color: ink }]}>{time}</ThemedText>
          </View>
        </StripFill>
      </Pressable>
    );
  }

  const line = topLine(anniversary, phase, now);
  const ink = line.alliance ? allianceColor(line.alliance).ink : AppColors.textPrimary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${line.text} Ver el registro de puntos`} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <StripFill alliance={line.alliance} height={35} style={styles.stripRow}>
        <ThemedText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.topText, { color: ink }]}>{line.text}</ThemedText>
        <Arrow color={ink} />
      </StripFill>
    </Pressable>
  );
}

/** "5.500 pts" in a frosted pill, with the place's medal. */
function PointsPill({ standing, ink, large }: { standing: Standing; ink: string; large?: boolean }) {
  return (
    <View style={[styles.pill, large ? styles.pillLarge : styles.pillSmall]}>
      <PlaceMark place={standing.place} size={large ? 16 : 12} />
      <ThemedText style={[styles.pillPoints, large && styles.pillPointsLarge, { color: ink }]}>
        {formatPoints(standing.total ?? 0)}
        <ThemedText style={[styles.pillUnit, large && styles.pillPointsLarge, { color: ink }]}>pts</ThemedText>
      </ThemedText>
    </View>
  );
}

/**
 * Under the banner: who leads (when it isn't one's own) and one's own
 * alianza, which opens the score. Before it starts, one's mascot instead of
 * points; with the score hidden, neither strip shows points.
 */
export function AnniversaryStandingStrips({ anniversary, phase, onOpen }: { anniversary: Anniversary; phase: AnniversaryPhase; onOpen: () => void }) {
  const [now] = useState(() => Date.now());
  const rows = standings(anniversary, now);
  const hidden = rows.some(alliance => alliance.total === null);
  const scored = !hidden && phase !== 'before' && rows.some(alliance => (alliance.total ?? 0) > 0);
  const leader = scored ? rows[0] : null;
  const mine = rows.find(alliance => alliance.id === anniversary.myAllianceId) ?? null;
  const showLeader = !!leader && leader.id !== mine?.id;
  if (!showLeader && !mine) return null;

  return (
    <View style={styles.standings}>
      {showLeader && leader && (
        <View accessible accessibilityLabel={`Va ganando ${leader.name}, ${formatPoints(leader.total ?? 0)} puntos`}>
          <StripFill alliance={leader} height={30} style={styles.stripRow}>
            <PointsPill standing={leader} ink={allianceColor(leader).ink} />
            <ThemedText numberOfLines={1} style={[styles.leaderName, { color: allianceColor(leader).ink }]}>{leader.name}</ThemedText>
          </StripFill>
        </View>
      )}
      {mine && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tu alianza, ${mine.name}${scored ? `, ${mine.place + 1}° lugar con ${formatPoints(mine.total ?? 0)} puntos` : ''}. Ver el registro de puntos`}
          onPress={onOpen}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <StripFill alliance={mine} height={47} style={styles.stripRow}>
            {scored ? <PointsPill standing={mine} ink={allianceColor(mine).ink} large /> : <AllianceBadge alliance={mine} size={31} />}
            <View style={styles.mineText}>
              <ThemedText style={[styles.mineKicker, { color: allianceColor(mine).ink }]}>Tu alianza</ThemedText>
              <ThemedText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.mineName, { color: allianceColor(mine).ink }]}>{mine.name}</ThemedText>
            </View>
            <Arrow color={allianceColor(mine).ink} />
          </StripFill>
        </Pressable>
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
  strip: {
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  pressed: {
    opacity: AppPressed.opacity,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    // The side copies run off both edges.
    marginHorizontal: -400,
  },
  countdown: {
    fontFamily: AppFlexFonts.wide,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  countdownSide: {
    opacity: 0.5,
  },
  topText: {
    flexShrink: 1,
    fontFamily: AppFlexFonts.name,
    fontSize: 16,
    lineHeight: 20,
  },
  arrow: {
    transform: [{ rotate: '45deg' }],
  },
  standings: {
    gap: 11,
    marginBottom: 28,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  pillSmall: {
    height: 17,
    paddingHorizontal: 8,
  },
  pillLarge: {
    height: 31,
    paddingHorizontal: 14,
  },
  pillPoints: {
    fontFamily: AppFlexFonts.numbers,
    fontSize: 10,
    lineHeight: 13,
    fontVariant: ['tabular-nums'],
  },
  pillPointsLarge: {
    fontSize: 13,
    lineHeight: 17,
  },
  pillUnit: {
    fontFamily: AppFlexFonts.ramp[0],
    fontSize: 10,
    lineHeight: 13,
  },
  leaderName: {
    flexShrink: 1,
    fontFamily: AppFlexFonts.wide,
    fontSize: 14,
    lineHeight: 18,
  },
  mineText: {
    flexShrink: 1,
  },
  mineKicker: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    lineHeight: 13,
  },
  mineName: {
    fontFamily: AppFlexFonts.wide,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
});
