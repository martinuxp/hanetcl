import { formStyles } from '@/components/anniversary/anniversary-form';
import { AllianceBadge, GroupIcon, PlaceMark, allianceColor, resultSummary, shortWhen, signedPoints } from '@/components/anniversary/anniversary-ui';
import { FlexText } from '@/components/anniversary/flex-text';
import { GradientCard } from '@/components/anniversary/gradient-card';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppDisplay, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { ACTIVITY_GROUPS, formatPoints, useAnniversaryState } from '@/services/anniversary-service';
import type { Alliance } from '@/services/anniversary-service';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PODIUM_HEIGHT = 120;

/** One activity: what it is, its point table as a podium, and how it went. */
function DetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useAnniversaryState();
  const anniversary = state?.anniversary;
  const organizer = !!state?.canOrganize;
  const activity = anniversary?.activities.find(item => item.id === id);

  const padding = { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl };

  if (!anniversary || !activity) {
    return (
      <ScrollView style={formStyles.sheet} contentContainerStyle={[formStyles.content, padding]}>
        <ThemedText accessibilityRole="header" style={styles.missingTitle}>Actividad</ThemedText>
        <ThemedText style={formStyles.hint}>Esta actividad ya no existe.</ThemedText>
        <HanetButton label="Listo" variant="surface" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  const summary = resultSummary(anniversary, activity);
  const winner = summary[0]?.alliance;
  const hidden = anniversary.alliances.some(alliance => alliance.total === null);
  const group = ACTIVITY_GROUPS.find(item => item.value === activity.group)?.label ?? 'Actividad';
  const colors = winner ? [allianceColor(winner).fill, ...(summary[1] ? [allianceColor(summary[1].alliance).fill] : [])] : [AppColors.accent, AppColors.surfaceRaised];
  const podium = activity.mode === 'podium' ? activity.points.filter(points => points > 0) : [];
  const top = Math.max(1, ...podium);
  const byPlace = Array.isArray(activity.result) ? activity.result.map(allianceId => anniversary.alliances.find(alliance => alliance.id === allianceId)) : [];

  return (
    <ScrollView style={formStyles.sheet} contentContainerStyle={[formStyles.content, padding]}>
      <GradientCard colors={colors} style={styles.header}>
        <View style={styles.groupRow}>
          <View style={styles.groupTile}>
            <GroupIcon group={activity.group} color={AppColors.textOnLight} animated={activity.flash} />
          </View>
          <ThemedText style={styles.kicker}>{activity.flash ? 'Prueba flash' : group}</ThemedText>
        </View>
        <FlexText key={activity.id} accessibilityRole="header" style={styles.name}>{activity.name}</FlexText>
        {(!!activity.startsAt || !!activity.place) && (
          <View style={styles.facts}>
            {!!activity.startsAt && (
              <View style={styles.fact}>
                <Ionicons name="time-outline" size={16} color={AppColors.textPrimary} />
                <ThemedText style={styles.factText}>{shortWhen(activity.startsAt)}</ThemedText>
              </View>
            )}
            {!!activity.place && (
              <View style={styles.fact}>
                <Ionicons name="location-outline" size={16} color={AppColors.textPrimary} />
                <ThemedText style={styles.factText}>{activity.place}</ThemedText>
              </View>
            )}
          </View>
        )}
      </GradientCard>

      {!!activity.text && <ThemedText style={styles.text}>{activity.text}</ThemedText>}

      <View style={styles.block}>
        <ThemedText accessibilityRole="header" style={styles.blockTitle}>Puntos</ThemedText>
        {activity.mode === 'manual' ? (
          <ThemedText style={formStyles.hint}>Se ponen a mano según lo que logre cada alianza, como dicen las bases.</ThemedText>
        ) : podium.length === 0 ? (
          <ThemedText style={formStyles.hint}>{hidden ? 'Los puntajes se ven en la premiación.' : 'Esta actividad todavía no tiene puntajes.'}</ThemedText>
        ) : (
          <View style={styles.podium} accessibilityLabel={podium.map((points, place) => `${place + 1}° lugar, ${formatPoints(points)} puntos`).join('. ')}>
            {podium.map((points, place) => {
              const alliance: Alliance | undefined = byPlace[place];
              const color = alliance ? allianceColor(alliance) : null;
              return (
                <View key={place} style={styles.podiumColumn}>
                  {alliance ? <AllianceBadge alliance={alliance} size={30} /> : <PlaceMark place={place} size={26} />}
                  <ThemedText style={styles.podiumPoints}>{formatPoints(points)}</ThemedText>
                  <View style={[styles.podiumBlock, { height: 28 + (PODIUM_HEIGHT - 28) * (points / top) }, color && { backgroundColor: color.fill }]}>
                    <ThemedText style={[styles.podiumPlace, color && { color: color.ink }]}>{place + 1}°</ThemedText>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.block}>
        <ThemedText accessibilityRole="header" style={styles.blockTitle}>Resultado</ThemedText>
        {summary.length ? (
          <View style={styles.results}>
            {summary.map(item => (
              <View key={item.alliance.id} style={styles.resultRow}>
                {item.place >= 0 ? <PlaceMark place={item.place} size={24} /> : <Ionicons name="add-circle-outline" size={22} color={AppColors.textSecondary} />}
                <AllianceBadge alliance={item.alliance} size={32} />
                <ThemedText numberOfLines={1} style={styles.resultName}>{item.alliance.name}</ThemedText>
                {item.points !== null && <ThemedText style={styles.resultPoints}>{signedPoints(item.points)}</ThemedText>}
              </View>
            ))}
          </View>
        ) : (
          <ThemedText style={formStyles.hint}>Todavía no hay resultado.</ThemedText>
        )}
      </View>

      {organizer && (
        <View style={styles.actions}>
          <HanetButton
            label={summary.length ? 'Cambiar el resultado' : 'Poner el resultado'}
            variant="accent"
            onPress={() => router.push({ pathname: '/anniversary/result', params: { id: activity.id } })}
          />
          <HanetButton label="Editar la actividad" variant="surface" onPress={() => router.push({ pathname: '/anniversary/activity', params: { id: activity.id } })} />
        </View>
      )}
      <HanetButton label="Listo" variant="surface" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  missingTitle: {
    ...AppDisplay.title,
    color: AppColors.textPrimary,
  },
  header: {
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.xl,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  groupTile: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.controlActive,
  },
  kicker: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: AppColors.textPrimary,
  },
  name: {
    ...AppDisplay.title,
    fontSize: 30,
    lineHeight: 34,
    color: AppColors.textPrimary,
  },
  facts: {
    gap: AppSpacing.xs,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xs,
  },
  factText: {
    ...AppType.callout,
    color: AppColors.textPrimary,
  },
  text: {
    ...AppType.body,
    color: AppColors.textSecondary,
  },
  block: {
    gap: AppSpacing.md,
  },
  blockTitle: {
    ...AppDisplay.section,
    color: AppColors.textPrimary,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: AppSpacing.sm,
  },
  podiumColumn: {
    flex: 1,
    alignItems: 'center',
    gap: AppSpacing.xs,
  },
  podiumPoints: {
    ...AppDisplay.score,
    fontSize: 16,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  podiumBlock: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: AppSpacing.xs,
    borderTopLeftRadius: AppRadii.md,
    borderTopRightRadius: AppRadii.md,
    backgroundColor: AppColors.surfaceMuted,
  },
  podiumPlace: {
    ...AppDisplay.score,
    fontSize: 18,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  results: {
    gap: AppSpacing.sm,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    padding: AppSpacing.sm,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  resultName: {
    flex: 1,
    ...AppDisplay.name,
    color: AppColors.textPrimary,
  },
  resultPoints: {
    ...AppDisplay.score,
    fontSize: 18,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  actions: {
    gap: AppSpacing.sm,
  },
});

export default withSheetFrame(DetailScreen, AppColors.surface);
