import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { EVENTS_DISCLAIMER, EventCard, EventsMarquee, FeaturedEventCard, HNE_ICONS, PageDots } from '@/components/events/event-ui';
import { useEventBar } from '@/components/events/event-bar-store';
import { EventsSkeleton } from '@/components/skeletons';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetSegmented } from '@/components/ui/hanet-auth-fields';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog } from '@/components/ui/hanet-dialog';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { JORNADA_LABELS, eventSoon, listEvents, toggleEventSignup } from '@/services/events-service';
import type { EventKind, EventList, HnEvent, Jornada } from '@/services/events-service';
import { functions } from '@/services/firebase';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCached } from '@/services/cache';
import { httpsCallable } from 'firebase/functions';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { t } from '@/i18n';
import { useDocumentScroll } from '@/hooks/use-document-scroll';

const TABS: { value: EventKind; label: string; accessibilityLabel: string }[] = [
  { value: 'regional', label: t('events.cercaDeMi'), accessibilityLabel: t('events.cercaDeMi') },
  { value: 'institution', label: t('events.enMiInstitucion'), accessibilityLabel: t('events.enMiInstitucion') },
];

// HaNet Eventos shows Temuco for now; more cities will come with more schools.
const CITY = { name: 'Temuco', region: 'Región de la Araucanía' }; // i18n-ignore

export default function EventsScreen() {
  // On a phone's browser the page scrolls with it, so the browser's bars shrink.
  const pageScroll = useDocumentScroll();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();
  const { width } = useWindowDimensions();

  const [kind, setKind] = useState<EventKind>('regional');
  const [lists, setLists] = useState<Partial<Record<EventKind, EventList>>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { query: search } = useEventBar();
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'jornada' | 'city' | null>(null);
  const [savingJornada, setSavingJornada] = useState(false);
  const [now] = useState(() => Date.now());

  const load = useCallback(async (which: EventKind) => {
    try {
      const result = await listEvents(which);
      setLists(current => ({ ...current, [which]: result }));
      setError(null);
    } catch (loadError) {
      setError(describeAuthError(loadError, t('events.noPudimosCargarLosEventos')));
    }
  }, []);

  // Reloads on coming back from an event or the form.
  useFocusEffect(useCallback(() => {
    if (!user) return;
    void load(kind);
  }, [kind, load, user]));

  // What the phone kept shows until this visit's load answers.
  const kept = useCached<EventList>(user ? `events:${kind}` : null);
  const list = lists[kind] ?? kept;
  const events = useMemo(() => list?.events ?? [], [list]);
  const term = search.trim().toLocaleLowerCase('es');
  const visible = term
    ? events.filter(event => [event.title, event.venueName, event.city].some(value => value.toLocaleLowerCase('es').includes(term)))
    : events;
  // Featured: what is sponsored, else the next three.
  const featured = useMemo(() => {
    if (kind !== 'regional') return [];
    const sponsored = events.filter(event => event.sponsored);
    return (sponsored.length ? sponsored : events).slice(0, 5);
  }, [events, kind]);
  const soonest = events.find(event => eventSoon(event.startsAt, now));
  const featuredWidth = Math.min(width, 480) - AppSpacing.md * 2;

  const onRefresh = async () => {
    setRefreshing(true);
    await load(kind);
    setRefreshing(false);
  };

  const openEvent = (event: HnEvent) => router.push({ pathname: '/event-detail', params: { id: event.id } });

  const signup = async (event: HnEvent) => {
    setBusyId(event.id);
    setActionError(null);
    try {
      const result = await toggleEventSignup(event.id);
      if (Platform.OS !== 'web') void Haptics.selectionAsync();
      setLists(current => {
        const institution = current.institution;
        if (!institution) return current;
        return { ...current, institution: { ...institution, events: institution.events.map(item => (item.id === event.id ? { ...item, ...result } : item)) } };
      });
    } catch (signupError) {
      setActionError(describeAuthError(signupError, t('events.noPudimosGuardarTuInscripcion')));
    } finally {
      setBusyId(null);
    }
  };

  const chooseJornada = async (jornada: Jornada) => {
    setSavingJornada(true);
    try {
      await httpsCallable(functions, 'updateMyProfile')({ jornada });
      setDialog(null);
      await load('institution');
    } catch (saveError) {
      setActionError(describeAuthError(saveError, t('events.noPudimosCambiarTuJornada')));
      setDialog(null);
    } finally {
      setSavingJornada(false);
    }
  };

  // The dots follow the cards while they move, not only once they stop.
  const onFeaturedScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / (featuredWidth + AppSpacing.sm));
    setFeaturedIndex(Math.max(0, Math.min(featured.length - 1, page)));
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <ThemedText accessibilityRole="header" style={styles.title}>{t('common.hanetEventos')}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('events.cambiarCiudad')} onPress={() => setDialog('city')} style={({ pressed }) => [styles.globe, pressed && AppPressed]}>
          <Image source={HNE_ICONS.globe} style={styles.icon24} contentFit="contain" tintColor={AppColors.textPrimary} />
        </Pressable>
      </View>
      {kind === 'regional' && soonest && <EventsMarquee event={soonest} now={now} />}

      <HanetSegmented options={TABS} value={kind} onChange={value => { setKind(value); setFeaturedIndex(0); }} accessibilityLabel={t('events.tipoDeEventos')} background={AppColors.surface} />

      <View style={styles.placeRow}>
        <View style={styles.placeText}>
          {kind === 'regional' ? (
            <>
              <ThemedText style={styles.placeTitle}>{t('events.enNameChile', { name: CITY.name })}</ThemedText>
              <ThemedText style={styles.placeSubtitle}>{CITY.region}.</ThemedText>
            </>
          ) : (
            <>
              <ThemedText numberOfLines={1} style={styles.placeTitle}>{list?.institutionName ? `${list.institutionName}.` : t('events.tuInstitucion')}</ThemedText>
              <ThemedText style={styles.placeSubtitle}>{list?.jornada ? `${JORNADA_LABELS[list.jornada]}.` : t('events.eligeTuJornadaParaVer')}</ThemedText>
            </>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDialog(kind === 'regional' ? 'city' : 'jornada')}
          style={({ pressed }) => [styles.outlinePill, pressed && AppPressed]}
        >
          <ThemedText style={styles.outlinePillText}>{kind === 'regional' ? t('events.cambiarUbicacion') : list?.jornada ? t('events.cambiarJornada') : t('events.elegirJornada')}</ThemedText>
        </Pressable>
      </View>

      {!term && featured.length > 0 && (
        <View style={styles.featuredWrap}>
          {/* The cards behind are only depth, as in the design. */}
          {featured.length > 1 && <View style={[styles.stackCard, styles.stackCard2]} />}
          {featured.length > 2 && <View style={[styles.stackCard, styles.stackCard3]} />}
          <FlatList
            horizontal
            data={featured}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <FeaturedEventCard event={item} now={now} width={featuredWidth} onPress={() => openEvent(item)} />}
            showsHorizontalScrollIndicator={false}
            snapToInterval={featuredWidth + AppSpacing.sm}
            decelerationRate="fast"
            ItemSeparatorComponent={() => <View style={{ width: AppSpacing.sm }} />}
            onScroll={onFeaturedScroll}
            scrollEventThrottle={32}
            style={styles.featuredList}
          />
        </View>
      )}
      {!term && <PageDots count={featured.length} index={featuredIndex} />}

      {list?.canPublish && (
        <HanetButton
          label={kind === 'regional' ? t('events.publicarEventoDeLaCiudad') : t('events.publicarEventoDelLiceo')}
          variant="surface"
          onPress={() => router.push({ pathname: '/event-form', params: { kind } })}
        />
      )}
      {!!error && <ThemedText accessibilityLiveRegion="polite" style={styles.error}>{error}</ThemedText>}
      {!!actionError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{actionError}</ThemedText>}
    </View>
  );

  const empty = !list ? (
    !error ? <EventsSkeleton featured={kind === 'regional' && !term} /> : null
  ) : (
    <View style={styles.empty}>
      <CustomIcon name="calendar" size={40} color={AppColors.textSecondary} />
      <ThemedText style={styles.emptyTitle}>
        {term ? t('events.noEncontramosCoincidencias') : kind === 'regional' ? t('events.todaviaNoHayEventosEn') : t('events.tuLiceoNoTieneEventos')}
      </ThemedText>
      <ThemedText style={styles.emptyText}>
        {term
          ? t('events.pruebaConOtroNombreO')
          : kind === 'regional'
            ? t('events.estamosArmandoLaCarteleraDe', { name: CITY.name })
            : t('events.cuandoElCeeOLa')}
      </ThemedText>
    </View>
  );

  return (
    <FrostedScreen style={styles.container}>
      <FlatList
        ref={pageScroll}
        data={visible}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => openEvent(item)}
            action={item.kind === 'institution' && item.signupMode !== 'none'
              ? {
                label: item.signedUp ? (item.signupMode === 'list' ? t('events.inscrito') : t('events.voy')) : item.signupMode === 'list' ? t('events.inscribirme') : t('events.participo'),
                onPress: () => void signup(item),
                busy: busyId === item.id,
                active: item.signedUp,
              }
              : undefined}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty ?? undefined}
        ListFooterComponent={<ThemedText style={styles.disclaimer}>{EVENTS_DISCLAIMER}</ThemedText>}
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing.lg }} />}
        contentContainerStyle={withTopInset(styles.content, insets.top)}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.accent} progressViewOffset={insets.top} />}
      />

      <HanetDialog
        visible={dialog === 'city'}
        onRequestClose={() => setDialog(null)}
        dismissOnBackdrop
        title={t('events.ciudad')}
        body={t('events.porAhoraHanetEventosMuestra', { name: CITY.name })}
      >
        <HanetButton label={t('events.entendido')} variant="surface" onPress={() => setDialog(null)} />
      </HanetDialog>

      <HanetDialog
        visible={dialog === 'jornada'}
        onRequestClose={() => !savingJornada && setDialog(null)}
        dismissOnBackdrop={!savingJornada}
        title={t('events.enQueJornadaEstas')}
        body={t('events.verasLosEventosDeTu')}
      >
        <View style={styles.dialogButtons}>
          <HanetButton label={t('common.jornadaManana')} variant={list?.jornada === 'manana' ? 'primary' : 'surface'} disabled={savingJornada} onPress={() => void chooseJornada('manana')} />
          <HanetButton label={t('common.jornadaTarde')} variant={list?.jornada === 'tarde' ? 'primary' : 'surface'} disabled={savingJornada} onPress={() => void chooseJornada('tarde')} />
        </View>
      </HanetDialog>
    </FrostedScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.md,
    paddingBottom: TAB_BAR_CLEARANCE + AppSpacing.xl,
  },
  header: {
    gap: AppSpacing.md,
    marginBottom: AppSpacing.lg,
  },
  topBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingLeft: AppSpacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  globe: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  icon24: {
    width: 24,
    height: 24,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.md,
  },
  placeText: {
    flex: 1,
  },
  placeTitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: -0.63,
    color: AppColors.textPrimary,
  },
  placeSubtitle: {
    opacity: 0.5,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: -0.24,
    color: AppColors.textPrimary,
  },
  outlinePill: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.md,
    borderWidth: 1,
    borderColor: AppColors.textSecondary,
    borderRadius: AppRadii.pill,
  },
  outlinePillText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.35,
    color: AppColors.textPrimary,
  },
  featuredWrap: {
    height: 258,
    alignItems: 'center',
  },
  featuredList: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  stackCard: {
    position: 'absolute',
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
  },
  stackCard2: {
    top: 20,
    width: '82%',
    height: 220,
    backgroundColor: AppColors.surfaceMuted,
  },
  stackCard3: {
    top: 38,
    width: '68%',
    height: 220,
    backgroundColor: AppColors.surface,
  },
  empty: {
    alignItems: 'center',
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.xl,
    paddingVertical: AppSpacing.xxl,
  },
  emptyTitle: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 19,
    lineHeight: 25,
    color: AppColors.textPrimary,
  },
  emptyText: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: AppColors.textSecondary,
  },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  disclaimer: {
    marginTop: AppSpacing.xl,
    paddingHorizontal: AppSpacing.xl,
    textAlign: 'center',
    opacity: 0.6,
    fontFamily: 'DMSans_300Light',
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: -0.44,
    color: AppColors.textPrimary,
  },
  dialogButtons: {
    gap: AppSpacing.sm,
  },
});
