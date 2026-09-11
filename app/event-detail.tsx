import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { formatRegionalEventDate, getEventOffer, regionalEventsRepository } from '@/services/regional-events-service';
import type { RegionalEvent } from '@/types/regional-events';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { ThemedText } from '@/components/themed-text';

export default function RegionalEventDetailScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const [event, setEvent] = useState<RegionalEvent | null>(null);
  const [loading, setLoading] = useState(Boolean(eventId));

  useEffect(() => {
    let active = true;
    if (!eventId) return;
    void regionalEventsRepository.getById(eventId).then(result => {
      if (active) { setEvent(result); setLoading(false); }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId]);

  if (loading) return <SafeAreaView style={styles.center}><ThemedText>Cargando evento...</ThemedText></SafeAreaView>;
  if (!event) return <SafeAreaView style={styles.center}><ThemedText style={styles.emptyTitle}>Evento no disponible</ThemedText><Pressable onPress={() => router.back()}><ThemedText style={styles.link}>Volver</ThemedText></Pressable></SafeAreaView>;

  const hanetOffer = getEventOffer(event, 'hanet');
  const studentOffer = getEventOffer(event, 'student');
  const image = event.images[0];

  const openUrl = async (url?: string, label = 'enlace') => {
    if (!url) return;
    try { await Linking.openURL(url); } catch { Alert.alert('No se pudo abrir el enlace', `Revisa el ${label} más tarde.`); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}><Pressable onPress={() => router.back()} style={styles.backButton}><CustomIcon name="chevron-left" size={24} color={AppColors.textPrimary} /></Pressable><Image source={require('@/headline HNE.svg')} style={styles.logo} contentFit="contain" accessibilityLabel="HaNet Eventos" /><View style={styles.backButton} /></View>
        {image ? <Image source={image.url} style={styles.hero} contentFit="cover" accessibilityLabel={image.alt || event.title} /> : <View style={styles.heroFallback}><CustomIcon name="calendar" size={48} color={AppColors.textSecondary} /></View>}
        <ThemedText style={styles.title}>{event.title}</ThemedText>
        <ThemedText style={styles.meta}>{formatRegionalEventDate(event.startsAt)} · {event.location.venueName}</ThemedText>
        <ThemedText style={styles.location}>{event.location.address || event.location.city}</ThemedText>
        {event.price && <ThemedText style={styles.price}>{event.price.isFree ? 'Entrada liberada' : event.price.label || formatPrice(event.price.min, event.price.max)}</ThemedText>}
        {hanetOffer && <HanetButton label={hanetOffer.label} variant="accent" onPress={() => openUrl(hanetOffer.redemptionUrl, 'beneficio HaNet')} style={styles.actionButton} />}
        {event.ticketUrl && <HanetButton label="Comprar entradas" variant="primary" onPress={() => openUrl(event.ticketUrl, 'sitio de compra')} style={styles.actionButton} />}
        {studentOffer && <View style={styles.offerCard}><CustomIcon name="graduationcap" size={22} color={AppColors.primary} /><View style={styles.offerText}><ThemedText style={styles.offerTitle}>{studentOffer.label}</ThemedText>{studentOffer.requirements && <ThemedText style={styles.offerDetail}>{studentOffer.requirements}</ThemedText>}</View></View>}
        <Section title="Información del evento"><ThemedText style={styles.body}>{event.description || event.summary || 'Información proporcionada por la fuente del evento.'}</ThemedText></Section>
        {event.editorial && <Section title={`Sobre ${event.editorial.subject}`}><ThemedText style={styles.body}>{event.editorial.summary || 'Información editorial complementaria.'}</ThemedText><ThemedText style={styles.source}>Información proporcionada por {event.editorial.source.name}. {event.editorial.attribution || ''}</ThemedText></Section>}
        <Section title="Fuente"><ThemedText style={styles.body}>{event.source.name}</ThemedText><Pressable onPress={() => openUrl(event.source.url, 'fuente')}><ThemedText style={styles.link}>Ver fuente original</ThemedText></Pressable></Section>
        <ThemedText style={styles.legal}>HaNet Eventos muestra información de distintas fuentes. La responsabilidad por organización, calidad, cancelaciones y devoluciones recae en sus respectivos organizadores.</ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><ThemedText style={styles.sectionTitle}>{title}</ThemedText>{children}</View>; }
function formatPrice(min?: number, max?: number) { if (min == null) return 'Precio por confirmar'; const value = max && max !== min ? `$${min.toLocaleString('es-CL')} - $${max.toLocaleString('es-CL')}` : `$${min.toLocaleString('es-CL')}`; return `Desde ${value}`; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.canvas },
  content: { padding: AppSpacing.lg, paddingBottom: 140 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.canvas, gap: 12 },
  topBar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 127, height: 15 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', height: 220, borderRadius: AppRadii.lg, backgroundColor: AppColors.primary },
  heroFallback: { width: '100%', height: 220, borderRadius: AppRadii.lg, backgroundColor: AppColors.primary, alignItems: 'center', justifyContent: 'center' },
  title: { color: AppColors.textPrimary, fontSize: 28, lineHeight: 34, fontFamily: 'DMSans_500Medium', marginTop: AppSpacing.xl },
  meta: { color: AppColors.textPrimary, fontSize: 15, lineHeight: 21, marginTop: 8 },
  location: { color: AppColors.textSecondary, fontSize: 14, lineHeight: 20 },
  price: { color: AppColors.primary, fontSize: 22, fontFamily: 'DMSans_500Medium', marginVertical: AppSpacing.lg },
  actionButton: { width: '100%', marginBottom: AppSpacing.sm },
  offerCard: { flexDirection: 'row', gap: 12, padding: AppSpacing.lg, backgroundColor: AppColors.surface, borderRadius: AppRadii.md, marginBottom: AppSpacing.xl },
  offerText: { flex: 1 },
  offerTitle: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold' },
  offerDetail: { color: AppColors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  section: { borderTopWidth: 1, borderTopColor: AppColors.surfaceMuted, paddingTop: AppSpacing.xl, marginTop: AppSpacing.lg },
  sectionTitle: { color: AppColors.textPrimary, fontSize: 21, lineHeight: 28, fontFamily: 'DMSans_500Medium', marginBottom: AppSpacing.sm },
  body: { color: AppColors.textPrimary, fontSize: 15, lineHeight: 23 },
  source: { color: AppColors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: AppSpacing.md },
  link: { color: AppColors.accent, fontFamily: 'DMSans_700Bold', marginTop: 8 },
  legal: { color: AppColors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 32 },
  emptyTitle: { color: AppColors.textPrimary, fontSize: 20, fontFamily: 'DMSans_500Medium' },
});
