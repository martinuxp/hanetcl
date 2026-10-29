import { AllianceDot, PlaceMark, allianceFills, signedPoints } from '@/components/anniversary/anniversary-ui';
import { GradientCard } from '@/components/anniversary/gradient-card';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppDisplay, AppFlexFonts, AppSpacing, AppType } from '@/constants/design-tokens';
import { formatPoints, movements, standings, useAnniversaryState } from '@/services/anniversary-service';
import type { Alliance, Movement, Standing } from '@/services/anniversary-service';
import { feedWhen } from '@/services/feed-service';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PLACES = ['Primer lugar', 'Segundo lugar', 'Tercer lugar', 'Cuarto lugar', 'Quinto lugar', 'Sexto lugar', 'Séptimo lugar', 'Octavo lugar'];

type Filter = 'all' | 'mine' | 'plus' | 'minus';

/** A place of the grid: 1° and 2° big, the rest a step smaller. */
function PlaceCell({ standing, mine, right, hidden }: { standing: Standing; mine: boolean; right: boolean; hidden: boolean }) {
  const small = standing.place >= 2;
  const align = right ? styles.right : null;
  return (
    <View
      accessible
      accessibilityLabel={`${hidden ? '' : `${PLACES[standing.place] ?? `${standing.place + 1}° lugar`}, `}${standing.name}${mine ? ', tu alianza' : ''}${hidden ? '' : `: ${formatPoints(standing.total ?? 0)} puntos`}`}
      style={[styles.cell, right && styles.cellRight, small && styles.cellSmall]}
    >
      {!hidden && <ThemedText style={[styles.placeLabel, align]}>{PLACES[standing.place] ?? `${standing.place + 1}° lugar`}</ThemedText>}
      <ThemedText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.name, small && styles.nameSmall, align]}>{standing.name}</ThemedText>
      {mine && <ThemedText style={[styles.mine, align]}>Tu alianza</ThemedText>}
      {!hidden && <ThemedText style={[styles.points, small && styles.pointsSmall, align]}>{formatPoints(standing.total ?? 0)}</ThemedText>}
    </View>
  );
}

/**
 * "Registro de puntos" (Figma 10998:3868): opened from the Home's strips.
 * Every alianza by place on its colors, the gap between the first two, and
 * every movement in a table with filters.
 */
function ScoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = useAnniversaryState();
  const anniversary = state?.anniversary;
  const [filter, setFilter] = useState<Filter>('all');
  const [now] = useState(() => Date.now());

  const padding = { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl };

  if (!anniversary) {
    return (
      <View style={[styles.empty, padding]}>
        <ThemedText accessibilityRole="header" style={styles.title}>Registro de puntos</ThemedText>
        <ThemedText style={styles.updated}>No hay un aniversario en curso.</ThemedText>
        <HanetButton label="Listo" variant="surface" onPress={() => router.back()} />
      </View>
    );
  }

  const rows = standings(anniversary, now);
  const hidden = rows.some(alliance => alliance.total === null);
  const byId = new Map(anniversary.alliances.map(alliance => [alliance.id, alliance]));
  const all = movements(anniversary);
  const [latest] = all;
  const gap = !hidden && rows[1] ? (rows[0].total ?? 0) - (rows[1].total ?? 0) : null;
  const mineId = anniversary.myAllianceId;
  const shown = all.filter(movement => (
    filter === 'all' ? true
      : filter === 'mine' ? movement.allianceId === mineId
        : filter === 'plus' ? (movement.points ?? 1) > 0
          : (movement.points ?? 0) < 0
  ));
  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Todo' },
    ...(mineId ? [{ value: 'mine' as const, label: 'Tu alianza' }] : []),
    { value: 'plus', label: 'Sumas' },
    { value: 'minus', label: 'Descuentos' },
  ];
  const pairs: Standing[][] = [];
  for (let index = 0; index < rows.length; index += 2) pairs.push(rows.slice(index, index + 2));

  const openAnniversary = () => {
    router.back();
    router.push('/anniversary');
  };

  return (
    <GradientCard colors={allianceFills(rows)} style={styles.sheet}>
      <ScrollView contentContainerStyle={[styles.content, padding]} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <ThemedText accessibilityRole="header" style={styles.title}>Registro de puntos</ThemedText>
          <ThemedText style={styles.updated}>
            {hidden ? 'Marcador oculto hasta la premiación' : latest?.at ? `Actualizado ${feedWhen(latest.at, now).toLocaleLowerCase('es')}` : 'Todavía no hay puntos'}
          </ThemedText>
        </View>

        <View style={styles.grid}>
          {pairs.map((pair, index) => (
            <View key={index} style={styles.pair}>
              <PlaceCell standing={pair[0]} mine={pair[0].id === mineId} right={false} hidden={hidden} />
              {index === 0 && gap !== null && (
                <ThemedText style={styles.gap}>{gap === 0 ? 'Empatadas' : `${formatPoints(gap)} pts de diferencia`}</ThemedText>
              )}
              {pair[1] ? <PlaceCell standing={pair[1]} mine={pair[1].id === mineId} right hidden={hidden} /> : <View style={styles.cell} />}
            </View>
          ))}
        </View>
        {hidden && (
          <View style={styles.hiddenNote}>
            <Ionicons name="eye-off-outline" size={18} color={AppColors.textPrimary} />
            <ThemedText style={styles.hiddenText}>El CEE guarda los puntos para revelar a la ganadora en la premiación.</ThemedText>
          </View>
        )}

        <View style={styles.table}>
          <ThemedText accessibilityRole="header" style={styles.tableTitle}>Movimientos</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {filters.map(item => (
              <HanetChip key={item.value} label={item.label} compact selected={filter === item.value} onPress={() => setFilter(item.value)} />
            ))}
          </ScrollView>
          {shown.length ? shown.slice(0, 60).map((movement, index) => (
            <MovementRow key={movement.id} movement={movement} alliance={byId.get(movement.allianceId)} now={now} first={index === 0} />
          )) : (
            <ThemedText style={styles.tableEmpty}>{all.length ? 'Nada con este filtro.' : 'Los puntos aparecen aquí con cada resultado.'}</ThemedText>
          )}
        </View>

        <HanetButton label="Ver el aniversario" variant="accent" onPress={openAnniversary} />
        <HanetButton label="Listo" variant="surface" onPress={() => router.back()} />
      </ScrollView>
    </GradientCard>
  );
}

function MovementRow({ movement, alliance, now, first }: { movement: Movement; alliance: Alliance | undefined; now: number; first: boolean }) {
  const points = movement.points;
  return (
    <View
      accessible
      accessibilityLabel={`${alliance?.name ?? 'Alianza'}, ${movement.reason}${points !== null ? `, ${signedPoints(points)} puntos` : movement.place !== null ? `, ${movement.place + 1}° lugar` : ''}`}
      style={[styles.row, !first && styles.rowBorder]}
    >
      {alliance ? <AllianceDot alliance={alliance} size={10} /> : <View style={styles.dotSpace} />}
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1} style={styles.rowName}>{alliance?.name ?? 'Alianza'}</ThemedText>
        <ThemedText numberOfLines={2} style={styles.rowReason}>
          {movement.reason}{movement.at ? ` · ${feedWhen(movement.at, now)}` : ''}
        </ThemedText>
      </View>
      {points !== null ? (
        <ThemedText style={[styles.rowPoints, points < 0 && styles.rowMinus]}>{signedPoints(points)}</ThemedText>
      ) : movement.place !== null ? (
        <PlaceMark place={movement.place} size={20} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    padding: 0,
    borderRadius: 0,
  },
  empty: {
    flex: 1,
    gap: AppSpacing.lg,
    paddingHorizontal: AppSpacing.xl,
    backgroundColor: AppColors.surface,
  },
  content: {
    gap: AppSpacing.xl,
    paddingHorizontal: AppSpacing.xl,
  },
  head: {
    alignItems: 'center',
    gap: 2,
  },
  title: {
    ...AppType.headline,
    fontSize: 17,
    textAlign: 'center',
    color: AppColors.textPrimary,
  },
  updated: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
    fontFamily: 'DMSans_500Medium',
    textAlign: 'center',
    color: AppColors.textPrimary,
  },
  grid: {
    gap: AppSpacing.xl,
  },
  pair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  cell: {
    flex: 1,
    gap: 2,
  },
  cellRight: {
    alignItems: 'flex-end',
  },
  cellSmall: {
    opacity: 0.8,
  },
  right: {
    textAlign: 'right',
  },
  placeLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 18,
    color: AppColors.textPrimary,
  },
  name: {
    fontFamily: AppFlexFonts.wide,
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  nameSmall: {
    fontSize: 17,
    lineHeight: 19,
  },
  mine: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  points: {
    ...AppDisplay.score,
    fontSize: 32,
    lineHeight: 36,
    marginTop: AppSpacing.xs,
    color: AppColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  pointsSmall: {
    fontSize: 26,
    lineHeight: 30,
  },
  gap: {
    maxWidth: 96,
    alignSelf: 'flex-end',
    marginBottom: AppSpacing.sm,
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
    color: AppColors.textPrimary,
  },
  hiddenNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  hiddenText: {
    flex: 1,
    ...AppType.callout,
    color: AppColors.textPrimary,
  },
  table: {
    gap: AppSpacing.sm,
    padding: AppSpacing.lg,
    borderRadius: 15,
    borderCurve: 'continuous',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  tableTitle: {
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  chips: {
    gap: AppSpacing.sm,
    paddingBottom: AppSpacing.xs,
  },
  tableEmpty: {
    ...AppType.callout,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.3)',
  },
  dotSpace: {
    width: 10,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowName: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  rowReason: {
    ...AppType.caption,
    fontFamily: 'DMSans_500Medium',
    letterSpacing: 0.2,
    color: AppColors.textPrimary,
  },
  rowPoints: {
    ...AppDisplay.score,
    fontSize: 18,
    lineHeight: 22,
    color: AppColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  rowMinus: {
    color: AppColors.errorText,
  },
});

export default withSheetFrame(ScoreScreen, AppColors.canvas);
