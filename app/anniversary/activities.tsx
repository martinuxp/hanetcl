import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { ActivityList, GroupIcon, SectionTitle } from '@/components/anniversary/anniversary-ui';
import { FlexText } from '@/components/anniversary/flex-text';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { AppColors, AppDisplay, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { ACTIVITY_GROUPS, addPresetActivities, getAnniversary, useAnniversaryState } from '@/services/anniversary-service';
import type { ActivityGroup, AnniversaryActivity } from '@/services/anniversary-service';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Sooner first; those without a date go last, by name.
const byWhen = (a: AnniversaryActivity, b: AnniversaryActivity) =>
  (a.startsAt ?? Number.MAX_SAFE_INTEGER) - (b.startsAt ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, 'es');

/** Every activity of the anniversary, by group, with a filter on top. */
export default function AnniversaryActivities() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const state = useAnniversaryState();
  const [group, setGroup] = useState<ActivityGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opened on its own (a link, a reload), it loads what the page would have.
  useEffect(() => {
    if (user && !state) getAnniversary().catch(loadError => setError(describeAuthError(loadError, 'No pudimos cargar las actividades.')));
  }, [state, user]);

  const anniversary = state?.anniversary ?? null;
  const organizer = !!state?.canOrganize;
  const activities = anniversary?.activities ?? [];
  const groups = ACTIVITY_GROUPS.filter(item => activities.some(activity => activity.group === item.value));
  const withResult = activities.filter(activity => activity.resultAt !== null).length;
  const openActivity = (id: string) => router.push({ pathname: '/anniversary/detail', params: { id } });

  const choose = (value: ActivityGroup | null) => {
    if (Platform.OS === 'ios') void Haptics.selectionAsync();
    setGroup(value);
  };

  const loadPresets = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await addPresetActivities();
    } catch (presetError) {
      setError(describeAuthError(presetError, 'No pudimos cargar las actividades. Inténtalo nuevamente.'));
    } finally {
      setBusy(false);
    }
  };

  const shown = group ? groups.filter(item => item.value === group) : groups;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + AppSpacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {!!anniversary && <ThemedText style={styles.kicker}>{anniversary.title}</ThemedText>}
          <FlexText accessibilityRole="header" style={styles.title}>Actividades</FlexText>
          {!!anniversary && (
            <ThemedText style={styles.summary}>
              {activities.length === 1 ? '1 actividad' : `${activities.length} actividades`}
              {withResult ? ` · ${withResult} con resultado` : ''}
            </ThemedText>
          )}
        </View>

        {!state ? (
          error ? <ThemedText style={styles.error}>{error}</ThemedText> : (
            <SkeletonGroup style={styles.skeleton} label="Cargando las actividades">
              <Skeleton height={36} width="70%" radius={AppRadii.pill} />
              <Skeleton height={240} radius={AppRadii.lg} />
            </SkeletonGroup>
          )
        ) : (
          <>
            {groups.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.filters}>
                <HanetChip label="Todas" selected={!group} onPress={() => choose(null)} />
                {groups.map(item => (
                  <HanetChip
                    key={item.value}
                    label={item.label}
                    selected={group === item.value}
                    icon={<GroupIcon group={item.value} size={16} color={AppColors.textPrimary} />}
                    onPress={() => choose(group === item.value ? null : item.value)}
                  />
                ))}
              </ScrollView>
            )}

            {anniversary && shown.map(item => {
              const list = activities.filter(activity => activity.group === item.value).sort(byWhen);
              return (
                <View key={item.value} style={styles.group}>
                  {!group && <SectionTitle title={item.label} detail={String(list.length)} />}
                  <ActivityList anniversary={anniversary} activities={list} onOpen={openActivity} />
                </View>
              );
            })}

            {anniversary && activities.length === 0 && (
              <ThemedText style={styles.emptyText}>
                {organizer ? 'Todavía no hay actividades. Carga las típicas o crea una.' : 'El CEE todavía no ha cargado las actividades.'}
              </ThemedText>
            )}

            {organizer && anniversary && (
              <View style={styles.actions}>
                <HanetButton label="Nueva actividad" variant="accent" onPress={() => router.push('/anniversary/activity')} />
                <HanetButton
                  label={busy ? 'Cargando…' : activities.length ? 'Agregar las típicas que falten' : 'Cargar actividades típicas'}
                  variant="surface"
                  disabled={busy}
                  onPress={loadPresets}
                />
              </View>
            )}
            {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
          </>
        )}
      </ScrollView>
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
  hero: {
    gap: AppSpacing.xs,
    paddingBottom: AppSpacing.sm,
  },
  kicker: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: AppColors.textSecondary,
  },
  title: {
    ...AppDisplay.hero,
    fontSize: 34,
    lineHeight: 38,
    color: AppColors.textPrimary,
  },
  summary: {
    ...AppType.callout,
    color: AppColors.textSecondary,
  },
  skeleton: {
    gap: AppSpacing.lg,
  },
  bleed: {
    marginHorizontal: -AppSpacing.lg,
  },
  filters: {
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
  },
  group: {
    gap: AppSpacing.md,
  },
  actions: {
    gap: AppSpacing.sm,
    marginTop: AppSpacing.lg,
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
});
