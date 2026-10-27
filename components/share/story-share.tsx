import { AllianceBadge, allianceColor } from '@/components/anniversary/anniversary-ui';
import { SpaceAvatar, OfficialSeal } from '@/components/feed/feed-ui';
import { markdownToPlain } from '@/components/feed/feed-markdown';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppDisplay, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { JORNADA_LABELS, eventWhen } from '@/services/events-service';
import type { HnEvent } from '@/services/events-service';
import type { FeedPost } from '@/services/feed-service';
import { formatPoints, phaseOf, ranking } from '@/services/anniversary-service';
import type { Anniversary } from '@/services/anniversary-service';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, View, useWindowDimensions, type ViewInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

// "Compartir como historia": an event, a post of the school's or the CEE's
// Espacio, or the Aniversario's score (only while it is shown), drawn as a
// 9:16 image ready for Instagram or WhatsApp stories. The sheet shows it
// first; "Compartir" captures that same card (360×640 points, 1080×1920
// pixels on a 3x phone) and opens the system's share sheet. Not on the web, where there is nothing to share it to.

export type StoryItem = { kind: 'event'; event: HnEvent } | { kind: 'post'; post: FeedPost } | { kind: 'anniversary'; anniversary: Anniversary };

const STORY_WIDTH = 360;
const STORY_HEIGHT = 640;
const LOGO = require('@/assets/icons/auth/logo-mark.svg');

export const storyShareAvailable = Platform.OS !== 'web';

/** Two soft lights behind the card, from the cover's colors or HaNet's rose. */
function Glow({ colors }: { colors: string[] }) {
  const first = colors[0] ?? AppColors.accent;
  const second = colors[1] ?? AppColors.surfaceRaised;
  return (
    <Svg width={STORY_WIDTH} height={STORY_HEIGHT} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="storyA" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={first} stopOpacity={0.75} />
          <Stop offset="1" stopColor={first} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="storyB" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={second} stopOpacity={0.6} />
          <Stop offset="1" stopColor={second} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={STORY_WIDTH * 0.2} cy={STORY_HEIGHT * 0.12} rx={260} ry={220} fill="url(#storyA)" />
      <Ellipse cx={STORY_WIDTH * 0.95} cy={STORY_HEIGHT * 0.9} rx={240} ry={260} fill="url(#storyB)" />
    </Svg>
  );
}

function Brand({ label }: { label: string }) {
  return (
    <View style={styles.brand}>
      <Image source={LOGO} style={styles.brandMark} contentFit="contain" />
      <ThemedText maxFontSizeMultiplier={1} style={styles.brandText}>{label}</ThemedText>
    </View>
  );
}

function EventStory({ event, onReady }: { event: HnEvent; onReady: () => void }) {
  useEffect(() => {
    if (!event.imageUrl) onReady();
  }, [event.imageUrl, onReady]);
  const place = [event.venueName, event.city].filter(Boolean).join(', ');
  return (
    <>
      <Glow colors={event.palette} />
      <Brand label="HaNet Eventos" />
      <View style={styles.middle}>
        <View style={styles.cover}>
          {event.imageUrl
            ? <Image source={{ uri: event.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" onLoadEnd={onReady} />
            : <Image source={LOGO} style={styles.coverMark} contentFit="contain" tintColor={AppColors.textSecondary} />}
        </View>
        {event.kind === 'institution' && <ThemedText maxFontSizeMultiplier={1} style={styles.kicker}>Evento del liceo · {JORNADA_LABELS[event.jornada]}</ThemedText>}
        <ThemedText maxFontSizeMultiplier={1} numberOfLines={3} style={styles.eventTitle}>{event.title}</ThemedText>
        <ThemedText maxFontSizeMultiplier={1} style={styles.eventWhen}>{eventWhen(event)}</ThemedText>
        {!!place && <ThemedText maxFontSizeMultiplier={1} numberOfLines={2} style={styles.eventPlace}>{place}</ThemedText>}
      </View>
      <ThemedText maxFontSizeMultiplier={1} style={styles.footer}>Míralo en la app HaNet</ThemedText>
    </>
  );
}

function PostStory({ post, onReady }: { post: FeedPost; onReady: () => void }) {
  const image = post.images[0] ?? (post.event && !post.event.missing ? post.event.imageUrl : null);
  useEffect(() => {
    if (!image) onReady();
  }, [image, onReady]);
  const plain = markdownToPlain(post.body);
  const body = plain.length > 300 ? `${plain.slice(0, 299).trimEnd()}…` : plain;
  return (
    <>
      <Glow colors={[AppColors.accent, AppColors.surfaceRaised]} />
      <Brand label="Feed y comunidad" />
      <View style={styles.middle}>
        <View style={styles.space}>
          <SpaceAvatar space={post.space} size={44} />
          <View style={styles.spaceText}>
            <View style={styles.spaceRow}>
              <ThemedText maxFontSizeMultiplier={1} numberOfLines={1} style={styles.spaceName}>{post.space.name}</ThemedText>
              {post.space.official && <OfficialSeal size={16} />}
            </View>
            <ThemedText maxFontSizeMultiplier={1} style={styles.spaceKind}>{post.space.kind}</ThemedText>
          </View>
        </View>
        {!!body && <ThemedText maxFontSizeMultiplier={1} numberOfLines={image ? 6 : 12} style={[styles.postBody, !image && styles.postBodyLarge]}>{body}</ThemedText>}
        {!!post.event && !post.event.missing && !body && <ThemedText maxFontSizeMultiplier={1} style={styles.eventTitle}>{post.event.title}</ThemedText>}
        {!!image && (
          <View style={styles.postImage}>
            <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" onLoadEnd={onReady} />
          </View>
        )}
        {post.tags.length > 0 && <ThemedText maxFontSizeMultiplier={1} style={styles.tags}>{post.tags.map(tag => `#${tag}`).join('  ')}</ThemedText>}
      </View>
      <ThemedText maxFontSizeMultiplier={1} style={styles.footer}>Míralo en la app HaNet</ThemedText>
    </>
  );
}

function AnniversaryStory({ anniversary, onReady }: { anniversary: Anniversary; onReady: () => void }) {
  useEffect(() => { onReady(); }, [onReady]);
  const rows = ranking(anniversary).slice(0, 6);
  const [winner] = rows;
  const finished = phaseOf(anniversary) === 'after';
  return (
    <>
      <Glow colors={rows.slice(0, 2).map(alliance => allianceColor(alliance).fill)} />
      <Brand label="Aniversario" />
      <View style={styles.middle}>
        <ThemedText maxFontSizeMultiplier={1} style={styles.kicker}>{finished ? '¡Ganó!' : 'Así va el marcador'}</ThemedText>
        <ThemedText maxFontSizeMultiplier={1} numberOfLines={2} style={styles.anniversaryTitle}>{finished && winner ? winner.name : anniversary.title}</ThemedText>
        <View style={styles.standings}>
          {rows.map((alliance, place) => (
            <View key={alliance.id} style={styles.standing}>
              <ThemedText maxFontSizeMultiplier={1} style={styles.standingPlace}>{place + 1}</ThemedText>
              <AllianceBadge alliance={alliance} size={34} />
              <ThemedText maxFontSizeMultiplier={1} numberOfLines={1} style={styles.standingName}>{alliance.name}</ThemedText>
              <ThemedText maxFontSizeMultiplier={1} style={styles.standingPoints}>{formatPoints(alliance.total ?? 0)}</ThemedText>
            </View>
          ))}
        </View>
      </View>
      <ThemedText maxFontSizeMultiplier={1} style={styles.footer}>Míralo en la app HaNet</ThemedText>
    </>
  );
}

/** The preview sheet; `item` null keeps it closed. */
export function StoryShareSheet({ item, onClose }: { item: StoryItem | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const card = useRef<ViewInstance>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new card starts over (the object itself is rebuilt on every render).
  const itemKey = item ? `${item.kind}:${item.kind === 'event' ? item.event.id : item.kind === 'post' ? item.post.id : item.anniversary.id}` : null;
  const [shownKey, setShownKey] = useState(itemKey);
  if (shownKey !== itemKey) {
    setShownKey(itemKey);
    setReady(false);
    setError(null);
  }

  useEffect(() => {
    if (!itemKey) return;
    // A cover that never loads must not hold the button forever.
    const timer = setTimeout(() => setReady(true), 4000);
    return () => clearTimeout(timer);
  }, [itemKey]);

  const markReady = React.useCallback(() => setReady(true), []);
  const scale = Math.min(1, (width - AppSpacing.xl * 2) / STORY_WIDTH, (height - 220) / STORY_HEIGHT);

  const share = async () => {
    if (!card.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) throw new Error('unavailable');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Compartir historia' });
      onClose();
    } catch {
      setError('No pudimos preparar la imagen. Inténtalo nuevamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={styles.overlay}>
        {!!item && (
          <View style={{ width: STORY_WIDTH * scale, height: STORY_HEIGHT * scale }}>
            <View style={{ width: STORY_WIDTH, height: STORY_HEIGHT, transform: [{ scale }], transformOrigin: 'top left' }}>
              <View ref={card} collapsable={false} style={styles.story} accessible accessibilityLabel="Vista previa de la historia">
                {item.kind === 'event'
                  ? <EventStory event={item.event} onReady={markReady} />
                  : item.kind === 'post'
                    ? <PostStory post={item.post} onReady={markReady} />
                    : <AnniversaryStory anniversary={item.anniversary} onReady={markReady} />}
              </View>
            </View>
          </View>
        )}
        {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
        <View style={styles.buttons}>
          <HanetButton label="Cancelar" variant="surface" disabled={busy} onPress={onClose} style={styles.button} />
          <HanetButton label={busy ? 'Preparando…' : 'Compartir'} variant="accent" disabled={busy || !ready} onPress={() => void share()} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.lg,
    padding: AppSpacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
  },
  story: {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 36,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  brandMark: {
    width: 22,
    height: 32,
  },
  brandText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  middle: {
    gap: AppSpacing.md,
  },
  cover: {
    width: '100%',
    aspectRatio: 16 / 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: AppSpacing.sm,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceRaised,
  },
  coverMark: {
    width: 44,
    height: 64,
  },
  kicker: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: AppColors.accent,
  },
  eventTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1.3,
    color: AppColors.textPrimary,
  },
  anniversaryTitle: {
    ...AppDisplay.title,
    fontSize: 34,
    lineHeight: 38,
    color: AppColors.textPrimary,
  },
  standings: {
    gap: AppSpacing.sm,
    marginTop: AppSpacing.sm,
  },
  standing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    padding: AppSpacing.sm,
    borderRadius: AppRadii.md,
    backgroundColor: 'rgba(40, 40, 41, 0.55)',
  },
  standingPlace: {
    width: 22,
    textAlign: 'center',
    ...AppDisplay.score,
    fontSize: 22,
    color: AppColors.textPrimary,
  },
  standingName: {
    flex: 1,
    ...AppDisplay.name,
    color: AppColors.textPrimary,
  },
  standingPoints: {
    ...AppDisplay.score,
    fontSize: 20,
    color: AppColors.textPrimary,
  },
  eventWhen: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 19,
    lineHeight: 25,
    color: AppColors.textPrimary,
  },
  eventPlace: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textSecondary,
  },
  space: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  spaceText: {
    flex: 1,
  },
  spaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spaceName: {
    flexShrink: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  spaceKind: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  postBody: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 18,
    lineHeight: 25,
    color: AppColors.textPrimary,
  },
  postBodyLarge: {
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    overflow: 'hidden',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  tags: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  footer: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.accent,
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  error: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  buttons: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    width: '100%',
    maxWidth: 360,
  },
  button: {
    flex: 1,
  },
});
