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

// Long posts open folded, as in Substack's notes.
const FOLD_CHARS = 360;

type PostProps = {
  post: FeedPost;
  emojis: string[];
  width: number;
  now: number;
  busyEmoji?: string | null;
  onReact: (emoji: string) => void;
  onMore: () => void;
  onShare: () => void;
};

export function FeedPostView({ post, emojis, width, now, busyEmoji, onReact, onMore, onShare }: PostProps) {
  const reduceMotion = useReducedMotion();
  const [picker, setPicker] = useState(false);
  const long = post.body.length > FOLD_CHARS || post.body.split('\n').length > 8;
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
          <ThemedText selectable numberOfLines={long && !expanded ? 8 : undefined} style={styles.body}>{post.body}</ThemedText>
          {long && (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setExpanded(value => !value)} style={({ pressed }) => pressed && AppPressed}>
              <ThemedText style={styles.more}>{expanded ? 'Ver menos' : 'Ver más'}</ThemedText>
            </Pressable>
          )}
        </View>
      )}

      <FeedCarousel images={post.images} width={width} />

      {post.tags.length > 0 && (
        <View style={styles.tags}>
          {post.tags.map(tag => <ThemedText key={tag} style={styles.tag}>#{tag}</ThemedText>)}
        </View>
      )}

      <View style={styles.actions}>
        {post.reactions.map(reaction => (
          <Pressable
            key={reaction.emoji}
            accessibilityRole="button"
            accessibilityState={{ selected: reaction.mine, busy: busyEmoji === reaction.emoji }}
            accessibilityLabel={`${EMOJI_NAMES[reaction.emoji] ?? reaction.emoji}, ${reaction.count}${reaction.mine ? ', reaccionaste' : ''}`}
            disabled={!!busyEmoji}
            onPress={() => react(reaction.emoji)}
            style={({ pressed }) => [styles.chip, reaction.mine && styles.chipMine, pressed && AppPressed]}
          >
            <ThemedText maxFontSizeMultiplier={1.2} style={styles.chipEmoji}>{reaction.emoji}</ThemedText>
            <ThemedText maxFontSizeMultiplier={1.2} style={[styles.chipCount, reaction.mine && styles.chipCountMine]}>{reaction.count}</ThemedText>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={picker ? 'Cerrar las reacciones' : 'Agregar una reacción'}
          accessibilityState={{ expanded: picker }}
          onPress={() => setPicker(value => !value)}
          style={({ pressed }) => [styles.iconButton, picker && styles.iconButtonOpen, pressed && AppPressed]}
        >
          <CustomIcon name="smile-plus" size={23} color={AppColors.textSecondary} />
        </Pressable>
        <View style={styles.spacer} />
        <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" onPress={onMore} style={({ pressed }) => [styles.iconButton, pressed && AppPressed]}>
          <CustomIcon name="more" size={22} color={AppColors.textSecondary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Compartir" onPress={onShare} style={({ pressed }) => [styles.iconButton, pressed && AppPressed]}>
          <CustomIcon name="share" size={23} color={AppColors.textSecondary} />
        </Pressable>
      </View>

      {picker && (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(120)}
          exiting={reduceMotion ? undefined : FadeOut.duration(100)}
          style={styles.picker}
        >
          {emojis.map(emoji => {
            const mine = post.reactions.some(reaction => reaction.emoji === emoji && reaction.mine);
            return (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityState={{ selected: mine }}
                accessibilityLabel={`${EMOJI_NAMES[emoji] ?? emoji}${mine ? ', quitar tu reacción' : ''}`}
                disabled={!!busyEmoji}
                onPress={() => react(emoji)}
                style={({ pressed }) => [styles.pickerItem, mine && styles.pickerItemMine, pressed && AppPressed]}
              >
                <ThemedText maxFontSizeMultiplier={1} style={styles.pickerEmoji}>{emoji}</ThemedText>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
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
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 17,
    lineHeight: 25,
    color: AppColors.textPrimary,
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
