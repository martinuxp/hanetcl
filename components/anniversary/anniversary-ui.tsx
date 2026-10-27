import { ThemedText } from '@/components/themed-text';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { formatPoints, ranking } from '@/services/anniversary-service';
import type { Alliance, AllianceColor, Anniversary, AnniversaryActivity } from '@/services/anniversary-service';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

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

export function allianceColor(alliance: Pick<Alliance, 'color'> | null | undefined) {
  return ALLIANCE_COLORS[alliance?.color ?? 'rosa'] ?? ALLIANCE_COLORS.rosa;
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

/** A round dot in the alianza's color. */
export function AllianceDot({ alliance, size = 12 }: { alliance: Pick<Alliance, 'color'>; size?: number }) {
  const color = allianceColor(alliance);
  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color.fill },
        alliance.color === 'negro' && styles.dotOutline,
      ]}
    />
  );
}

/** A pill with the alianza's name, in its color. */
export function AlliancePill({ alliance, prefix, style }: { alliance: Pick<Alliance, 'color' | 'name'>; prefix?: string; style?: StyleProp<ViewStyle> }) {
  const color = allianceColor(alliance);
  return (
    <View style={[styles.pill, { backgroundColor: color.fill }, alliance.color === 'negro' && styles.dotOutline, style]}>
      <ThemedText numberOfLines={1} style={[styles.pillText, { color: color.ink }]}>
        {prefix ? `${prefix} ${alliance.name}` : alliance.name}
      </ThemedText>
    </View>
  );
}

/** The score: one bar per alianza, as long as its points next to the leader's. */
export function Scoreboard({ anniversary, onPressAlliance }: { anniversary: Anniversary; onPressAlliance?: (alliance: Alliance) => void }) {
  const rows = ranking(anniversary);
  const hidden = rows.some(alliance => alliance.total === null);
  const top = Math.max(1, ...rows.map(alliance => Math.max(0, alliance.total ?? 0)));

  return (
    <View style={styles.scoreboard} accessibilityLabel={hidden ? 'Marcador oculto' : 'Marcador'}>
      {rows.map((alliance, index) => {
        const color = allianceColor(alliance);
        const mine = alliance.id === anniversary.myAllianceId;
        const share = hidden ? 0 : Math.max(0.04, Math.max(0, alliance.total ?? 0) / top);
        const label = hidden
          ? `${alliance.name}${mine ? ', tu alianza' : ''}`
          : `${index + 1}° lugar, ${alliance.name}${mine ? ', tu alianza' : ''}: ${formatPoints(alliance.total ?? 0)} puntos`;
        return (
          <Pressable
            key={alliance.id}
            accessibilityRole={onPressAlliance ? 'button' : undefined}
            accessibilityLabel={label}
            disabled={!onPressAlliance}
            onPress={() => onPressAlliance?.(alliance)}
            style={({ pressed }) => [styles.scoreRow, pressed && AppPressed]}
          >
            <View style={styles.scoreHead}>
              {!hidden && <ThemedText style={styles.scorePlace}>{placeLabel(index)}</ThemedText>}
              <AllianceDot alliance={alliance} />
              <ThemedText numberOfLines={1} style={styles.scoreName}>{alliance.name}</ThemedText>
              {mine && <ThemedText style={styles.mine}>Tu alianza</ThemedText>}
              <ThemedText style={styles.scorePoints}>{hidden ? '—' : formatPoints(alliance.total ?? 0)}</ThemedText>
            </View>
            {!hidden && (
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${share * 100}%`, backgroundColor: color.fill }]} />
              </View>
            )}
          </Pressable>
        );
      })}
      {hidden && (
        <ThemedText style={styles.hiddenNote}>El CEE ocultó el marcador para revelar la alianza ganadora en la premiación.</ThemedText>
      )}
    </View>
  );
}

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

/** A row of the activities list: name, when, and the podium once it has one. */
export function ActivityRow({ anniversary, activity, onPress }: { anniversary: Anniversary; activity: AnniversaryActivity; onPress?: () => void }) {
  const summary = resultSummary(anniversary, activity);
  const when = activity.startsAt ? shortWhen(activity.startsAt) : null;
  const detail = [when, activity.place].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Poner o cambiar el resultado' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.activity, pressed && AppPressed]}
    >
      <View style={styles.activityHead}>
        <ThemedText style={styles.activityName}>{activity.flash ? `⚡ ${activity.name}` : activity.name}</ThemedText>
        {!!detail && <ThemedText style={styles.activityDetail}>{detail}</ThemedText>}
        {!!activity.text && <ThemedText numberOfLines={3} style={styles.activityText}>{activity.text}</ThemedText>}
      </View>
      {summary.length ? (
        <View style={styles.podium}>
          {summary.slice(0, 4).map(item => (
            <AlliancePill
              key={item.alliance.id}
              alliance={item.alliance}
              prefix={item.place >= 0 ? placeLabel(item.place) : item.points !== null ? signedPoints(item.points) : undefined}
            />
          ))}
        </View>
      ) : (
        <ThemedText style={styles.pending}>{onPress ? 'Poner resultado' : 'Sin resultado todavía'}</ThemedText>
      )}
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
  dotOutline: {
    borderWidth: 1,
    borderColor: AppColors.surfaceMuted,
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
  scoreboard: {
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  scoreRow: {
    gap: AppSpacing.sm,
  },
  scoreHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  scorePlace: {
    width: 26,
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
  },
  scoreName: {
    flexShrink: 1,
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  mine: {
    ...AppType.caption,
    color: AppColors.textSecondary,
  },
  scorePoints: {
    marginLeft: 'auto',
    ...AppType.headline,
    fontVariant: ['tabular-nums'],
    color: AppColors.textPrimary,
  },
  track: {
    height: 10,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.canvas,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: AppRadii.pill,
  },
  hiddenNote: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
  activity: {
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  activityHead: {
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
  activityText: {
    marginTop: AppSpacing.xs,
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
  podium: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  pending: {
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
    ...AppType.title3,
    color: AppColors.textPrimary,
  },
  sectionDetail: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
});
