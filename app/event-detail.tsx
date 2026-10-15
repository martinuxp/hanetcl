import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { EVENTS_DISCLAIMER, HNE_ICONS, priceLabel } from '@/components/events/event-ui';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { JORNADA_LABELS, deleteEvent, eventSoon, eventWhen, getEvent, getLoadedEvent, toggleEventSignup } from '@/services/events-service';
import type { HnEvent } from '@/services/events-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function openLink(url: string) {
  if (url) void WebBrowser.openBrowserAsync(url);
}

function openMaps(event: HnEvent) {
  const query = encodeURIComponent([event.venueName, event.address, event.city].filter(Boolean).join(', '));
  void Linking.openURL(Platform.OS === 'ios' ? `https://maps.apple.com/?q=${query}` : `https://www.google.com/maps/search/?api=1&query=${query}`);
}

function shareEvent(event: HnEvent) {
  const link = event.ticketUrl || event.sourceUrl;
  const message = [event.title, [eventWhen(event), event.venueName].filter(Boolean).join(' - '), link].filter(Boolean).join('\n');
  void Share.share(Platform.OS === 'ios' && link ? { message: [event.title, eventWhen(event)].join('\n'), url: link } : { message }).catch(() => {});
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, initializing } = useSession();
  const scroll = useRef<ScrollView>(null);

  const [event, setEvent] = useState<HnEvent | null>(() => (id ? getLoadedEvent(id) : null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!initializing && !user) router.replace('/onboarding');
  }, [initializing, router, user]);

  useFocusEffect(useCallback(() => {
    if (!user || !id) return;
    let active = true;
    getEvent(id)
      .then(result => { if (active) { setEvent(result); setError(null); } })
      .catch(loadError => { if (active) setError(describeAuthError(loadError, 'No pudimos abrir este evento.')); });
    return () => { active = false; };
  }, [id, user]));

  const signup = async () => {
    if (!event || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await toggleEventSignup(event.id);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEvent(current => current && { ...current, ...result });
    } catch (signupError) {
      setActionError(describeAuthError(signupError, 'No pudimos guardar tu inscripción.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!event || busy) return;
    setBusy(true);
    try {
      await deleteEvent(event.id);
      setConfirmDelete(false);
      router.back();
    } catch (removeError) {
      setActionError(describeAuthError(removeError, 'No pudimos eliminar el evento.'));
      setBusy(false);
    }
  };

  if (!event) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        {error ? (
          <>
            <ThemedText style={styles.emptyTitle}>{error}</ThemedText>
            <HanetButton label="Volver" variant="surface" onPress={() => router.back()} />
          </>
        ) : <ActivityIndicator color={AppColors.textSecondary} />}
      </SafeAreaView>
    );
  }

  const institution = event.kind === 'institution';
  const price = institution ? null : priceLabel(event);
  const sourceHost = hostOf(event.ticketUrl || event.sourceUrl);
  const past = (event.endsAt ?? event.startsAt) < now;
  const soon = past ? null : eventSoon(event.startsAt, now);
  const wikipedia = /wikipedia/i.test(event.editorial?.sourceName ?? '') || /wikipedia\.org/.test(event.editorial?.sourceUrl ?? '');
  const hasPlace = !!event.venueName || !!event.address;
  const full = !!event.capacity && (event.signupCount ?? 0) >= event.capacity && !event.signedUp;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView ref={scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <ThemedText style={styles.brand}>HaNet Eventos</ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/events'))} style={({ pressed }) => [styles.roundButton, pressed && AppPressed]}>
            <Image source={require('@/assets/icons/event/arrow-left-long.svg')} style={styles.icon24} contentFit="contain" tintColor={AppColors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.hero}>
          {event.imageUrl ? (
            <Image source={{ uri: event.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityLabel={event.title} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.heroFallback]}><CustomIcon name="calendar" size={48} color={AppColors.textSecondary} /></View>
          )}
          {event.sponsored && <ThemedText style={styles.sponsored}>[Patrocinado]</ThemedText>}
          {(!!soon || past) && <ThemedText style={[styles.badge, past && styles.badgePast]}>{past ? 'Ya pasó' : soon}</ThemedText>}
        </View>

        <View style={styles.heading}>
          <ThemedText accessibilityRole="header" style={styles.title}>{event.title}</ThemedText>
          <ThemedText style={styles.when}>{[eventWhen(event), event.venueName].filter(Boolean).join(' - ')}</ThemedText>
          {institution && <ThemedText style={styles.whenSmall}>{JORNADA_LABELS[event.jornada]}</ThemedText>}
          {!institution && !!sourceHost && (
            <Pressable accessibilityRole="link" onPress={() => openLink(event.sourceUrl || event.ticketUrl)}>
              <ThemedText style={styles.sourceLink}>{sourceHost}</ThemedText>
            </Pressable>
          )}
        </View>

        {!!price && <ThemedText style={styles.price}>{price}</ThemedText>}
        {!!event.perk && <ThemedText style={styles.perk}>{event.perk}</ThemedText>}

        {past && <ThemedText style={styles.pastNote}>Este evento ya pasó.</ThemedText>}

        {!institution && !!event.ticketUrl && !past && (
          <HanetButton label={`Comprar en ${event.sourceName || sourceHost}`} variant="accent" onPress={() => openLink(event.ticketUrl)} style={styles.wide} />
        )}

        {institution && event.signupMode !== 'none' && !past && (
          <View style={styles.signup}>
            <HanetButton
              label={busy ? 'Guardando…' : event.signedUp
                ? (event.signupMode === 'list' ? 'Estás inscrito · Cancelar' : 'Vas · Ya no voy')
                : full ? 'Sin cupos' : event.signupMode === 'list' ? 'Inscribirme' : '¡Participo!'}
              variant={event.signedUp ? 'surface' : 'accent'}
              disabled={busy || full}
              onPress={() => void signup()}
              style={styles.wide}
            />
            <ThemedText style={styles.signupCount}>
              {event.signupMode === 'list'
                ? `${event.signupCount ?? 0} ${event.signupCount === 1 ? 'inscrito' : 'inscritos'}${event.capacity ? ` de ${event.capacity} cupos` : ''}`
                : `${event.signupCount ?? 0} ${event.signupCount === 1 ? 'persona va' : 'personas van'}`}
            </ThemedText>
          </View>
        )}
        {!!actionError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{actionError}</ThemedText>}

        {event.gallery.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll} contentContainerStyle={styles.gallery}>
            {event.gallery.map((uri, index) => (
              <Pressable key={uri} accessibilityRole="imagebutton" accessibilityLabel={`Foto ${index + 1} de ${event.gallery.length}`} onPress={() => openLink(uri)} style={({ pressed }) => [index % 2 === 0 ? styles.galleryWide : styles.galleryNarrow, pressed && AppPressed]}>
                <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.options}>
          <Pressable accessibilityRole="button" onPress={() => shareEvent(event)} style={({ pressed }) => [styles.option, pressed && AppPressed]}>
            <Image source={HNE_ICONS.arrowUpRight} style={styles.icon18} contentFit="contain" tintColor={AppColors.textPrimary} />
            <ThemedText style={styles.optionLabel}>Compartir</ThemedText>
          </Pressable>
          {hasPlace && (
            <Pressable accessibilityRole="button" accessibilityHint="Abre la ubicación en mapas" onPress={() => openMaps(event)} style={({ pressed }) => [styles.option, pressed && AppPressed]}>
              <Image source={HNE_ICONS.location} style={styles.icon18} contentFit="contain" tintColor={AppColors.textPrimary} />
              <ThemedText style={styles.optionLabel}>Cómo llegar</ThemedText>
            </Pressable>
          )}
        </View>

        {hasPlace && (
          <Pressable accessibilityRole="button" accessibilityHint="Abre la ubicación en mapas" onPress={() => openMaps(event)} style={({ pressed }) => [styles.venue, pressed && AppPressed]}>
            <View style={styles.venueIcon}><CustomIcon name="map-pin" size={22} color={AppColors.textPrimary} /></View>
            <View style={styles.venueText}>
              <ThemedText numberOfLines={1} style={styles.venueName}>{event.venueName || 'Ubicación'}</ThemedText>
              {!!(event.address || event.city) && <ThemedText numberOfLines={2} style={styles.venueAddress}>{[event.address, event.city].filter(Boolean).join(', ')}</ThemedText>}
            </View>
          </Pressable>
        )}

        <View style={styles.divider} />

        <View style={styles.sectionHeader}>
          <Image source={HNE_ICONS.location} style={styles.icon24} contentFit="contain" tintColor={AppColors.textPrimary} />
          <ThemedText style={styles.sectionTitle}>Información del evento</ThemedText>
          <ThemedText style={styles.sectionNote}>
            {institution ? `Publicado por ${event.authorName || 'tu institución'}.` : `Información proporcionada por ${event.sourceName || 'la ticketera'}.`}
          </ThemedText>
        </View>
        <ThemedText selectable style={styles.body}>{event.description || 'El organizador no agregó más detalles.'}</ThemedText>

        {!!event.editorial && (
          <>
            <View style={styles.divider} />
            <View style={styles.editorial}>
              <Image source={HNE_ICONS.album} style={styles.icon24} contentFit="contain" tintColor={AppColors.textPrimary} />
              <ThemedText style={styles.editorialTitle}>Sobre {event.editorial.subject}</ThemedText>
              <ThemedText selectable style={styles.body}>{event.editorial.summary}</ThemedText>
              {!!event.editorial.sourceName && (
                <Pressable onPress={() => openLink(event.editorial?.sourceUrl ?? '')} disabled={!event.editorial.sourceUrl}>
                  <ThemedText style={styles.attribution}>Información proporcionada por {event.editorial.sourceName}{wikipedia ? ' (CC BY-SA 4.0)' : ''}</ThemedText>
                </Pressable>
              )}
            </View>
          </>
        )}

        {!!event.signups && (
          <>
            <View style={styles.divider} />
            <View style={styles.editorial}>
              <ThemedText style={styles.editorialTitle}>Inscritos ({event.signups.length})</ThemedText>
              <ThemedText style={styles.sectionNote}>Solo lo ven quienes organizan.</ThemedText>
              {event.signups.length === 0
                ? <ThemedText style={styles.body}>Todavía nadie se inscribe.</ThemedText>
                : event.signups.map((person, index) => (
                  <ThemedText key={index} style={styles.body}>{index + 1}. {person.name}{person.courseId ? ` · ${person.courseId}` : ''}</ThemedText>
                ))}
            </View>
          </>
        )}

        {event.canEdit && (
          <View style={styles.editRow}>
            <HanetButton label="Editar" variant="surface" onPress={() => router.push({ pathname: '/event-form', params: { kind: event.kind, id: event.id } })} style={dialogStyles.action} />
            <HanetButton label="Eliminar" variant="surface" onPress={() => setConfirmDelete(true)} style={dialogStyles.action} />
          </View>
        )}

        <Pressable accessibilityRole="button" accessibilityLabel="Volver arriba" onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })} style={({ pressed }) => [styles.toTop, pressed && AppPressed]}>
          <Image source={require('@/assets/icons/event/arrow-left-long.svg')} style={[styles.icon24, styles.arrowUp]} contentFit="contain" tintColor={AppColors.textPrimary} />
        </Pressable>
        <ThemedText style={styles.disclaimer}>{EVENTS_DISCLAIMER}</ThemedText>
      </ScrollView>

      <HanetDialog
        visible={confirmDelete}
        onRequestClose={() => !busy && setConfirmDelete(false)}
        dismissOnBackdrop={!busy}
        title="¿Eliminar este evento?"
        body={institution && event.signupMode !== 'none' ? 'También se borran las inscripciones. No se puede deshacer.' : 'Deja de aparecer en HaNet Eventos. No se puede deshacer.'}
      >
        <HanetDialogActions>
          <HanetButton label="Cancelar" variant="surface" disabled={busy} onPress={() => setConfirmDelete(false)} style={dialogStyles.action} />
          <HanetButton label={busy ? 'Eliminando…' : 'Eliminar'} variant="accent" disabled={busy} onPress={() => void remove()} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.lg,
    padding: AppSpacing.xl,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.md,
    paddingBottom: TAB_BAR_CLEARANCE + AppSpacing.xl,
  },
  topBar: {
    alignSelf: 'stretch',
    height: 64,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: AppSpacing.sm,
  },
  brand: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  roundButton: {
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
  icon18: {
    width: 18,
    height: 18,
  },
  badge: {
    position: 'absolute',
    left: 11,
    bottom: 11,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: 4,
    borderRadius: AppRadii.pill,
    overflow: 'hidden',
    backgroundColor: AppColors.accent,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textPrimary,
  },
  badgePast: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  pastNote: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  galleryScroll: {
    alignSelf: 'stretch',
    marginHorizontal: -AppSpacing.md,
  },
  gallery: {
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.md,
  },
  galleryWide: {
    width: 240,
    height: 160,
    overflow: 'hidden',
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceRaised,
  },
  galleryNarrow: {
    width: 120,
    height: 160,
    overflow: 'hidden',
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceRaised,
  },
  options: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: AppSpacing.sm,
  },
  option: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xs,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  optionLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  hero: {
    alignSelf: 'stretch',
    height: 208,
    overflow: 'hidden',
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceRaised,
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sponsored: {
    position: 'absolute',
    top: 7,
    right: 11,
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 10,
    lineHeight: 15,
    color: AppColors.textPrimary,
  },
  heading: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
  },
  title: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 22,
    lineHeight: 31,
    letterSpacing: -0.88,
    color: AppColors.textPrimary,
  },
  when: {
    textAlign: 'center',
    opacity: 0.7,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  whenSmall: {
    textAlign: 'center',
    opacity: 0.5,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textPrimary,
  },
  sourceLink: {
    opacity: 0.5,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
    textDecorationLine: 'underline',
  },
  price: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 24,
    lineHeight: 34,
    letterSpacing: -0.96,
    color: AppColors.accent,
  },
  perk: {
    marginTop: -AppSpacing.sm,
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.accentMint,
  },
  wide: {
    alignSelf: 'stretch',
    marginHorizontal: AppSpacing.lg,
  },
  signup: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: AppSpacing.xs,
  },
  signupCount: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  venue: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    padding: AppSpacing.md,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  venueIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.md,
    backgroundColor: AppColors.surfaceRaised,
  },
  venueText: {
    flex: 1,
  },
  venueName: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: AppColors.textPrimary,
  },
  venueAddress: {
    opacity: 0.7,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  divider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    marginHorizontal: AppSpacing.lg,
    marginVertical: AppSpacing.sm,
    backgroundColor: AppColors.textSecondary,
    opacity: 0.4,
  },
  sectionHeader: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: AppSpacing.lg,
  },
  sectionTitle: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.88,
    color: AppColors.textPrimary,
  },
  sectionNote: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  body: {
    alignSelf: 'stretch',
    paddingHorizontal: AppSpacing.lg,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.42,
    color: AppColors.textPrimary,
  },
  editorial: {
    alignSelf: 'stretch',
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
  },
  editorialTitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.48,
    color: AppColors.textPrimary,
  },
  attribution: {
    textAlign: 'right',
    opacity: 0.5,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  editRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.md,
  },
  toTop: {
    width: 293,
    maxWidth: '100%',
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AppSpacing.md,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  arrowUp: {
    transform: [{ rotate: '90deg' }],
  },
  disclaimer: {
    paddingHorizontal: AppSpacing.xl,
    textAlign: 'center',
    opacity: 0.6,
    fontFamily: 'DMSans_300Light',
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: -0.44,
    color: AppColors.textPrimary,
  },
  emptyTitle: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 18,
    lineHeight: 24,
    color: AppColors.textPrimary,
  },
  error: {
    alignSelf: 'stretch',
    paddingHorizontal: AppSpacing.lg,
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
});
