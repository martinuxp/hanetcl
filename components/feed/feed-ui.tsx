import { FeedEventCard, FeedPollView } from '@/components/feed/feed-attachments';
import { FeedMarkdown } from '@/components/feed/feed-markdown';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { EMOJI_NAMES, feedWhen, spaceGroup } from '@/services/feed-service';
import type { FeedPost, FeedSpace } from '@/services/feed-service';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

// Feed y Comunidad, after Substack: Espacio tiles on top, posts without cards
// split by a dark band, image carousels and reaction chips.

const SPACE_TINTS: Record<string, string> = {
  school: AppColors.surfaceRaised,
  cee: AppColors.accent,
  course: AppColors.surfaceMuted,
  hanet: AppColors.primaryStrong,
};

function Isotipo({ size }: { size: number }) {
  return (
    <Svg width={size * (20 / 29)} height={size} viewBox="0 0 20 29" fill="none">
      <Path d="M0 0L6.87688 6.43605V13.1403L10.3153 13.5425V8.98366L19.3082 9.78816V19.1741L10.3153 19.9786V15.4197L6.87688 15.822V22.5262L0 28.9622V0Z" fill={AppColors.accent} />
    </Svg>
  );
}

/** The Espacio's round mark: its initials on its color, or the HaNet isotipo. */
export function SpaceAvatar({ space, size = 48 }: { space: FeedSpace; size?: number }) {
  const group = spaceGroup(space.key);
  return (
    <View accessible={false} style={[styles.avatar, { width: size, height: size, backgroundColor: SPACE_TINTS[group] ?? AppColors.surfaceMuted }]}>
      {group === 'hanet'
        ? <Isotipo size={size * 0.5} />
        : <ThemedText maxFontSizeMultiplier={1} style={[styles.avatarText, { fontSize: size * 0.27 }]}>{space.initials}</ThemedText>}
    </View>
  );
}

/** The pink seal of an official Espacio (the school and HaNet). */
export function OfficialSeal({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Espacio oficial">
      <Path fill={AppColors.accent} d="M12 1.8l2.6 2 3.2-.3 1 3.1 2.8 1.7-.9 3.1.9 3.1-2.8 1.7-1 3.1-3.2-.3-2.6 2-2.6-2-3.2.3-1-3.1-2.8-1.7.9-3.1-.9-3.1 2.8-1.7 1-3.1 3.2.3z" />
      <Path d="M8.2 12.2l2.6 2.6 5-5.2" fill="none" stroke={AppColors.textPrimary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** One Espacio in the row on top. Tapping the selected one again goes back to the whole feed. */
export function SpaceTile({ space, selected, onPress }: { space: FeedSpace; selected: boolean; onPress: () => void }) {
  const group = spaceGroup(space.key);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={selected ? `${space.name}, mostrando solo este Espacio` : `Ver solo ${space.name}`}
      accessibilityHint={selected ? 'Vuelve a mostrar todo el feed' : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && AppPressed]}
    >
      <View style={[styles.tileRing, selected && styles.tileRingSelected]}>
        <View style={[styles.tileFace, { backgroundColor: SPACE_TINTS[group] ?? AppColors.surfaceMuted }]}>
          {group === 'hanet'
            ? <Isotipo size={34} />
            : <ThemedText maxFontSizeMultiplier={1} style={styles.tileInitials}>{space.initials}</ThemedText>}
        </View>
      </View>
      <ThemedText numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.tileLabel, selected && styles.tileLabelSelected]}>
        {space.name.replace(/^Comunidad /, '')}
      </ThemedText>
    </Pressable>
  );
}

/** Images of a post: one fills the width (4:3), several slide as 4:5 cards. */
export function FeedCarousel({ images, width }: { images: string[]; width: number }) {
  if (!images.length) return null;
  const inner = width - AppSpacing.lg * 2;
  if (images.length === 1) {
    return (
      <View style={styles.carouselPad}>
        <Image source={{ uri: images[0] }} accessibilityLabel="Imagen de la publicación" style={[styles.slide, { width: inner, height: inner * 0.75 }]} contentFit="cover" transition={120} />
      </View>
    );
  }
  const card = Math.round(inner * 0.78);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={card + AppSpacing.sm}
      decelerationRate="fast"
      contentContainerStyle={styles.carouselRow}
    >
      {images.map((uri, index) => (
        <Image
          key={uri}
          source={{ uri }}
          accessibilityLabel={`Imagen ${index + 1} de ${images.length}`}
          style={[styles.slide, { width: card, height: card * 1.25 }]}
          contentFit="cover"
          transition={120}
        />
      ))}
    </ScrollView>
  );
}

type Reaction = { emoji: string; count: number; mine: boolean };

/** The reaction chips with their counts and the button that opens the picker. */
export function ReactionChips({ reactions, busyEmoji, open, onToggleOpen, onReact }: {
  reactions: Reaction[];
  busyEmoji?: string | null;
  open: boolean;
  onToggleOpen: () => void;
  onReact: (emoji: string) => void;
}) {
  return (
    <>
      {reactions.map(reaction => (
        <Pressable
          key={reaction.emoji}
          accessibilityRole="button"
          accessibilityState={{ selected: reaction.mine, busy: busyEmoji === reaction.emoji }}
          accessibilityLabel={`${EMOJI_NAMES[reaction.emoji] ?? reaction.emoji}, ${reaction.count}${reaction.mine ? ', reaccionaste' : ''}`}
          disabled={!!busyEmoji}
          onPress={() => onReact(reaction.emoji)}
          style={({ pressed }) => [styles.chip, reaction.mine && styles.chipMine, pressed && AppPressed]}
        >
          <ThemedText maxFontSizeMultiplier={1.2} style={styles.chipEmoji}>{reaction.emoji}</ThemedText>
          <ThemedText maxFontSizeMultiplier={1.2} style={[styles.chipCount, reaction.mine && styles.chipCountMine]}>{reaction.count}</ThemedText>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Cerrar las reacciones' : 'Agregar una reacción'}
        accessibilityState={{ expanded: open }}
        onPress={onToggleOpen}
        style={({ pressed }) => [styles.iconButton, open && styles.iconButtonOpen, pressed && AppPressed]}
      >
        <CustomIcon name="smile-plus" size={23} color={AppColors.textSecondary} />
      </Pressable>
    </>
  );
}

/** The closed set of emojis, under the chips while it is open. */
export function ReactionPicker({ emojis, reactions, busyEmoji, onReact }: {
  emojis: string[];
  reactions: Reaction[];
  busyEmoji?: string | null;
  onReact: (emoji: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(120)}
        exiting={reduceMotion ? undefined : FadeOut.duration(100)}
        style={styles.picker}
      >
        {emojis.map(emoji => {
          const mine = reactions.some(reaction => reaction.emoji === emoji && reaction.mine);
          return (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityState={{ selected: mine }}
              accessibilityLabel={`${EMOJI_NAMES[emoji] ?? emoji}${mine ? ', quitar tu reacción' : ''}`}
              disabled={!!busyEmoji}
              onPress={() => onReact(emoji)}
              style={({ pressed }) => [styles.pickerItem, mine && styles.pickerItemMine, pressed && AppPressed]}
            >
              <ThemedText maxFontSizeMultiplier={1} style={styles.pickerEmoji}>{emoji}</ThemedText>
            </Pressable>
          );
        })}
      </Animated.View>
  );
}

// Long posts open folded, as in Substack's notes.
const FOLD_CHARS = 360;

/** The start of a long post, cut at a paragraph or a word. */
function folded(body: string) {
  const head = body.slice(0, FOLD_CHARS);
  const line = head.lastIndexOf('\n');
  const cut = line > FOLD_CHARS / 2 ? line : head.lastIndexOf(' ');
  return `${head.slice(0, cut > 0 ? cut : FOLD_CHARS).trimEnd()}…`;
}

type PostProps = {
  post: FeedPost;
  emojis: string[];
  width: number;
  now: number;
  busyEmoji?: string | null;
  votingPoll?: boolean;
  onReact: (emoji: string) => void;
  onVote: (option: string) => void;
  onOpenEvent: (id: string) => void;
  onMore: () => void;
  onShare: () => void;
};

export function FeedPostView({ post, emojis, width, now, busyEmoji, votingPoll = false, onReact, onVote, onOpenEvent, onMore, onShare }: PostProps) {
  const [picker, setPicker] = useState(false);
  const long = post.body.length > FOLD_CHARS;
  const [expanded, setExpanded] = useState(false);

  const react = (emoji: string) => {
    setPicker(false);
    onReact(emoji);
  };

  return (
    <View style={styles.post}>
      <View style={styles.postHeader}>
        <SpaceAvatar space={post.space} />
        <View style={styles.postHeaderText}>
          <View style={styles.nameRow}>
            <ThemedText numberOfLines={1} style={styles.spaceName}>{post.space.name}</ThemedText>
            {post.space.official && <OfficialSeal />}
          </View>
          <ThemedText numberOfLines={1} style={styles.meta}>
            {[feedWhen(post.createdAt, now), post.space.kind, post.edited ? 'Editado' : null].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        {post.pinned && (
          <View style={styles.pinned} accessibilityLabel="Fijado arriba">
            <CustomIcon name="pin" size={14} color={AppColors.textSecondary} />
            <ThemedText style={styles.pinnedText}>Fijado</ThemedText>
          </View>
        )}
      </View>

      {!!post.body && (
        <View style={styles.bodyWrap}>
          <FeedMarkdown source={long && !expanded ? folded(post.body) : post.body} />
          {long && (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setExpanded(value => !value)} style={({ pressed }) => pressed && AppPressed}>
              <ThemedText style={styles.more}>{expanded ? 'Ver menos' : 'Ver más'}</ThemedText>
            </Pressable>
          )}
        </View>
      )}

      {!!post.poll && <FeedPollView poll={post.poll} now={now} busy={votingPoll} onVote={onVote} />}

      <FeedCarousel images={post.images} width={width} />

      {!!post.event && <FeedEventCard event={post.event} onPress={post.event.missing ? undefined : () => onOpenEvent(post.event!.id)} />}

      {post.tags.length > 0 && (
        <View style={styles.tags}>
          {post.tags.map(tag => <ThemedText key={tag} style={styles.tag}>#{tag}</ThemedText>)}
        </View>
      )}

      <View style={styles.actions}>
        <ReactionChips reactions={post.reactions} busyEmoji={busyEmoji} open={picker} onToggleOpen={() => setPicker(value => !value)} onReact={react} />
        <View style={styles.spacer} />
        <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" onPress={onMore} style={({ pressed }) => [styles.iconButton, pressed && AppPressed]}>
          <CustomIcon name="more" size={22} color={AppColors.textSecondary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Compartir" onPress={onShare} style={({ pressed }) => [styles.iconButton, pressed && AppPressed]}>
          <CustomIcon name="share" size={23} color={AppColors.textSecondary} />
        </Pressable>
      </View>

      {picker && <ReactionPicker emojis={emojis} reactions={post.reactions} busyEmoji={busyEmoji} onReact={react} />}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
  },
  avatarText: {
    fontFamily: 'DMSans_700Bold',
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  tile: {
    width: 92,
    alignItems: 'center',
    gap: AppSpacing.sm,
    paddingTop: AppSpacing.xs,
  },
  tileRing: {
    width: 82,
    height: 82,
    padding: 3,
    borderRadius: 28,
    borderCurve: 'continuous',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  tileRingSelected: {
    borderColor: AppColors.accent,
  },
  tileFace: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderCurve: 'continuous',
  },
  tileInitials: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.5,
    color: AppColors.textPrimary,
  },
  tileLabel: {
    width: 88,
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  tileLabelSelected: {
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  carouselPad: {
    paddingHorizontal: AppSpacing.lg,
  },
  carouselRow: {
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
  },
  slide: {
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  post: {
    gap: 14,
    paddingTop: 20,
    paddingBottom: AppSpacing.sm,
    borderBottomWidth: 8,
    borderBottomColor: 'rgba(0, 0, 0, 0.28)',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
  },
  postHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spaceName: {
    flexShrink: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.36,
    color: AppColors.textPrimary,
  },
  meta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingTop: 2,
  },
  pinnedText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  bodyWrap: {
    gap: AppSpacing.xs,
    paddingHorizontal: AppSpacing.lg,
  },
  more: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.textSecondary,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
  },
  tag: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: AppSpacing.xs,
    paddingHorizontal: 10,
  },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: AppSpacing.md,
    borderRadius: AppRadii.pill,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipMine: {
    backgroundColor: 'rgba(239, 34, 116, 0.2)',
    borderColor: AppColors.accent,
  },
  chipEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  chipCount: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  chipCountMine: {
    fontFamily: 'DMSans_700Bold',
  },
  iconButton: {
    width: AppTouch.minimum,
    height: AppTouch.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
  },
  iconButtonOpen: {
    backgroundColor: AppColors.surface,
  },
  spacer: {
    flex: 1,
  },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
    marginHorizontal: AppSpacing.lg,
    marginBottom: 6,
    padding: 6,
    borderRadius: AppRadii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: AppColors.surface,
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.3)',
  },
  pickerItem: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
  },
  pickerItemMine: {
    backgroundColor: 'rgba(239, 34, 116, 0.2)',
  },
  pickerEmoji: {
    fontSize: 23,
    lineHeight: 28,
  },
});
