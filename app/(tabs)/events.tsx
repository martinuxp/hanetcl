import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { formatRegionalEventDate, regionalEventsRepository } from '@/services/regional-events-service';
import { isDemoRegionalEvent } from '@/services/regional-events-fixtures';
import type { NearbyEventsQuery, RegionalEvent, RegionalEventCategory } from '@/types/regional-events';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetChip } from '@/components/ui/hanet-chip';
import { ThemedText } from '@/components/themed-text';

const CATEGORY_LABELS: { value: RegionalEventCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'music', label: 'Música' },
  { value: 'concert', label: 'Conciertos' },
  { value: 'exhibition', label: 'Expos' },
  { value: 'sports', label: 'Deportes' },
  { value: 'other', label: 'Otros' },
];

const defaultQuery: NearbyEventsQuery = {
  city: 'Temuco',
  region: 'La Araucanía',
  category: 'all',
  from: new Date(),
};

export default function EventsScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [events, setEvents] = useState<RegionalEvent[]>([]);
  const [category, setCategory] = useState<RegionalEventCategory | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  const loadEvents = useCallback(async () => {
    setError(false);
    try {
      setEvents(await regionalEventsRepository.listNearby({ ...defaultQuery, category }));
    } catch {
      setError(true);
      setEvents([]);
    }
  }, [category]);

  useEffect(() => {
    const task = setTimeout(() => { void loadEvents(); }, 0);
    return () => clearTimeout(task);
  }, [loadEvents]);

  const visibleEvents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return events;
    return events.filter(event => [event.title, event.location.venueName, event.location.city]
      .some(value => value.toLocaleLowerCase().includes(term)));
  }, [events, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  }, [loadEvents]);

  const header = useMemo(() => (
    <View>
      <View style={styles.topBar}>
        <Image source={require('@/headline HNE.svg')} style={styles.logo} contentFit="contain" accessibilityLabel="HaNet Eventos" />
        <HanetChip label="Temuco" icon={<CustomIcon name="map-pin" size={20} color={AppColors.textPrimary} />} onPress={() => Alert.alert('Ubicación', 'Pronto podrás elegir otra ciudad para tu cartelera.')} />
      </View>

      <View style={styles.segmented}>
        <View style={[styles.segment, styles.segmentActive]}>
          <ThemedText style={styles.segmentActiveText}>Cerca de mi</ThemedText>
        </View>
        <View style={styles.segment}>
          <ThemedText style={styles.segmentText}>En mi institución</ThemedText>
        </View>
      </View>

      <View style={styles.locationRow}>
        <View>
          <ThemedText style={styles.locationTitle}>En {defaultQuery.city}, Chile</ThemedText>
          <ThemedText style={styles.locationSubtitle}>{defaultQuery.region}</ThemedText>
        </View>
        <Pressable accessibilityLabel="Cambiar ubicación" onPress={() => Alert.alert('Ubicación', 'Pronto podrás cambiar la ciudad de tu cartelera.')} accessibilityRole="button" style={({ pressed }) => [styles.locationAction, pressed && styles.pressed]}>
          <ThemedText style={styles.changeLocation}>Cambiar ubicación</ThemedText>
        </Pressable>
      </View>

      {mode === 'search' && <View style={styles.searchField}>
        <CustomIcon name="search" size={19} color={AppColors.controlOnActive} />
        <TextInput
          autoFocus
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar eventos"
          placeholderTextColor={AppColors.controlOnActive}
          selectionColor={AppColors.accent}
          style={styles.searchInput}
          accessibilityLabel="Buscar eventos"
        />
        {search.length > 0 && <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Limpiar búsqueda"><ThemedText style={styles.clearSearch}>×</ThemedText></Pressable>}
      </View>}

      <FlatList
        horizontal
        data={CATEGORY_LABELS}
        keyExtractor={item => item.value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        renderItem={({ item }) => (
          <HanetChip label={item.label} selected={category === item.value} onPress={() => setCategory(item.value)} />
        )}
      />

      <ThemedText style={styles.sectionTitle}>Próximos eventos</ThemedText>
      {events.some(isDemoRegionalEvent) && <ThemedText style={styles.demoNote}>Cartelera de prueba · visible solo durante el desarrollo</ThemedText>}
      {error && <ThemedText style={styles.errorText}>No pudimos cargar los eventos. Intenta actualizar.</ThemedText>}
    </View>
  ), [category, error, events, mode, search]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={visibleEvents}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <EventCard event={item} onPress={() => router.push({ pathname: '/event-detail', params: { eventId: item.id } })} />}
        ListHeaderComponent={header}
        ListEmptyComponent={!error ? <EmptyState isSearch={Boolean(search)} /> : null}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.accent} />}
      />
    </SafeAreaView>
  );
}

function EventCard({ event, onPress }: { event: RegionalEvent; onPress: () => void }) {
  const image = event.images[0];
  const hanetOffer = event.offers.find(offer => offer.type === 'hanet' && offer.verification === 'verified');
  const studentOffer = event.offers.find(offer => offer.type === 'student' && offer.verification === 'verified');
  const benefitLabel = hanetOffer ? 'Descuento HaNet disponible' : studentOffer ? 'Descuento estudiante' : undefined;
  const priceLabel = event.price?.isFree ? 'Gratis' : event.price?.label || formatPrice(event.price?.min, event.price?.max);

  return (
    <Pressable accessibilityLabel={`${event.title}. ${priceLabel}`} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress} accessibilityRole="button">
      <View style={styles.cardImageWrap}>
        {image ? <Image source={image.url} style={styles.cardImage} contentFit="cover" accessibilityLabel={image.alt || event.title} /> : <View style={styles.cardImageFallback}><CustomIcon name="calendar" size={36} color={AppColors.textSecondary} /></View>}
        <View style={styles.moreChip}><ThemedText style={styles.moreChipText}>Ver más</ThemedText></View>
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardInfo}>
          <ThemedText style={styles.cardTitle} numberOfLines={1}>{event.title}</ThemedText>
          <ThemedText style={styles.cardMeta} numberOfLines={1}>{formatRegionalEventDate(event.startsAt)} · {event.location.venueName}</ThemedText>
          {benefitLabel && <ThemedText style={styles.offerText} numberOfLines={1}>{benefitLabel}</ThemedText>}
        </View>
        <View style={styles.priceChip}><ThemedText style={styles.priceText}>{priceLabel}</ThemedText></View>
      </View>
    </Pressable>
  );
}

function EmptyState({ isSearch = false }: { isSearch?: boolean }) {
  return (
    <View style={styles.empty}>
      <CustomIcon name="calendar" size={42} color={AppColors.primary} />
      <ThemedText style={styles.emptyTitle}>{isSearch ? 'No encontramos coincidencias' : 'Aún no hay eventos publicados'}</ThemedText>
      <ThemedText style={styles.emptyText}>{isSearch ? 'Prueba con otro nombre, lugar o categoría.' : 'Estamos preparando la cartelera de Temuco. Vuelve a revisar más tarde.'}</ThemedText>
      {!isSearch && <ThemedText style={styles.sourceNote}>Información recopilada desde fuentes públicas y validada por HaNet.</ThemedText>}
    </View>
  );
}

function formatPrice(min?: number, max?: number) {
  if (min == null) return 'Precio por confirmar';
  const range = max && max !== min
    ? `$${min.toLocaleString('es-CL')} - $${max.toLocaleString('es-CL')}`
    : `$${min.toLocaleString('es-CL')}`;
  return `Desde ${range}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingBottom: 140 },
  topBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 127, height: 15 },
  segmented: { height: 48, borderRadius: AppRadii.xl, padding: AppSpacing.sm, gap: AppSpacing.xs, backgroundColor: AppColors.controlContainer, flexDirection: 'row', marginBottom: AppSpacing.lg },
  segment: { flex: 1, borderRadius: AppRadii.sm, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: AppColors.controlActive, borderRadius: AppRadii.pill },
  segmentText: { color: AppColors.textSecondary, fontSize: 14, lineHeight: 21, fontFamily: 'DMSans_700Bold' },
  segmentActiveText: { color: AppColors.controlOnActive, fontSize: 14, lineHeight: 21, fontFamily: 'DMSans_700Bold' },
  locationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: AppSpacing.lg },
  locationTitle: { color: AppColors.textPrimary, fontSize: 19, lineHeight: 25, fontFamily: 'DMSans_500Medium' },
  locationSubtitle: { color: AppColors.textSecondary, fontSize: 14, lineHeight: 20 },
  changeLocation: { color: AppColors.accent, fontSize: 13, fontFamily: 'DMSans_700Bold' },
  locationAction: { minHeight: 44, justifyContent: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  filters: { gap: AppSpacing.sm, paddingBottom: AppSpacing.xl },
  searchField: { minHeight: 48, borderRadius: AppRadii.pill, paddingHorizontal: AppSpacing.md, flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm, backgroundColor: AppColors.controlActive, marginBottom: AppSpacing.md },
  searchInput: { flex: 1, color: AppColors.controlOnActive, fontFamily: 'DMSans_500Medium', fontSize: 15, paddingVertical: 0, outlineStyle: 'none' as any },
  clearSearch: { color: AppColors.controlOnActive, fontSize: 24, lineHeight: 24, fontFamily: 'DMSans_500Medium' },
  sectionTitle: { color: AppColors.textPrimary, fontSize: 22, lineHeight: 28, fontFamily: 'DMSans_500Medium', marginBottom: AppSpacing.md },
  demoNote: { color: AppColors.textSecondary, opacity: 0.76, fontSize: 12, lineHeight: 18, marginTop: -8, marginBottom: AppSpacing.md },
  errorText: { color: AppColors.accent, fontSize: 14, marginBottom: AppSpacing.md },
  card: { marginBottom: AppSpacing.xl },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.992 }] },
  cardImageWrap: { position: 'relative' },
  cardImage: { width: '100%', height: 208, borderRadius: AppRadii.lg, backgroundColor: AppColors.surfaceRaised },
  cardImageFallback: { height: 208, borderRadius: AppRadii.lg, backgroundColor: AppColors.primary, alignItems: 'center', justifyContent: 'center' },
  moreChip: { position: 'absolute', right: 8, bottom: 8, minHeight: 28, paddingHorizontal: AppSpacing.lg, borderRadius: AppRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.canvas },
  moreChipText: { color: AppColors.textPrimary, fontSize: 12, lineHeight: 18, fontFamily: 'DMSans_400Regular' },
  cardContent: { minHeight: 62, paddingHorizontal: AppSpacing.md, paddingTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: AppSpacing.sm },
  cardInfo: { flex: 1, minWidth: 0 },
  cardTitle: { color: AppColors.textPrimary, fontSize: 18, lineHeight: 25, fontFamily: 'DMSans_500Medium', letterSpacing: -0.5 },
  cardMeta: { color: AppColors.textPrimary, opacity: 0.5, fontSize: 12, lineHeight: 18, fontFamily: 'DMSans_400Regular', letterSpacing: -0.2 },
  offerText: { color: AppColors.accent, fontSize: 12, lineHeight: 18, fontFamily: 'DMSans_400Regular', letterSpacing: -0.2 },
  priceChip: { width: 112, minHeight: 43, borderWidth: 1, borderColor: AppColors.primary, borderRadius: AppRadii.pill, paddingHorizontal: AppSpacing.md, alignItems: 'center', justifyContent: 'center' },
  priceText: { color: AppColors.textPrimary, fontSize: 13, lineHeight: 20, fontFamily: 'DMSans_500Medium', letterSpacing: -0.3 },
  empty: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 48 },
  emptyTitle: { color: AppColors.textPrimary, fontSize: 20, fontFamily: 'DMSans_500Medium', textAlign: 'center', marginTop: 16 },
  emptyText: { color: AppColors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  sourceNote: { color: AppColors.textSecondary, opacity: 0.7, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 24 },
});
