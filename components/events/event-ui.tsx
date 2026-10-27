import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { eventSoon, eventWhen, formatClp } from '@/services/events-service';
import type { HnEvent } from '@/services/events-service';
import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

export const HNE_ICONS = {
  globe: require('@/assets/icons/hne/globe.svg'),
  arrowUpRight: require('@/assets/icons/hne/arrow-up-right.svg'),
  location: require('@/assets/icons/hne/location-chip.svg'),
  album: require('@/assets/icons/hne/album.svg'),
} as const;

export const EVENTS_DISCLAIMER = 'HaNet Eventos reúne eventos de distintas fuentes.\nCada organizador responde por su evento, incluidas cancelaciones y devoluciones.';

/** What the price pill says. */
export function priceLabel(event: Pick<HnEvent, 'isFree' | 'priceFrom'>) {
  if (event.isFree) return 'Gratis';
  return event.priceFrom ? `Desde ${formatClp(event.priceFrom)}` : null;
}

// One diagonal line of the banner, sliding sideways forever.
export function MarqueeLine({ text, top, color, opacity, duration, reverse, fontFamily }: { text: string; top: number; color: string; opacity: number; duration: number; reverse?: boolean; fontFamily?: string }) {
  const reduceMotion = useReducedMotion();
  const shift = useSharedValue(0);
  const copyWidth = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    shift.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [duration, reduceMotion, shift]);
  // The text repeats, so moving it by one copy's width loops without a jump.
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: (reverse ? -1 + shift.value : -shift.value) * copyWidth.value }] }));
  return (
    <Animated.View style={[styles.marqueeLine, { top }, style]}>
      {Array.from({ length: 8 }, (_, index) => (
        <ThemedText
          key={index}
          numberOfLines={1}
          onLayout={index === 0 ? event => { copyWidth.value = event.nativeEvent.layout.width; } : undefined}
          style={[styles.marqueeText, { color, opacity }, !!fontFamily && { fontFamily }]}
        >
          {`${text}   `}
        </ThemedText>
      ))}
    </Animated.View>
  );
}

/**
 * The tilted strip of sliding lines: `main` in the middle in `ink`, `secondary`
 * between them, faded. Events use it pink for what comes soonest; the
 * Aniversario in the alianza's color for what happens today.
 */
export function MarqueeBanner({ main, secondary, label, fill = AppColors.accent, ink = AppColors.textPrimary, fontFamily }: {
  main: string;
  secondary: string;
  label: string;
  fill?: string;
  ink?: string;
  fontFamily?: string;
}) {
  return (
    <View accessible accessibilityLabel={label} style={[styles.marquee, { backgroundColor: fill }]}>
      <View style={styles.marqueeTilt}>
        <MarqueeLine text={main} top={-12} color={AppColors.textOnLight} opacity={0.3} duration={16000} fontFamily={fontFamily} />
        <MarqueeLine text={secondary} top={2} color={AppColors.textOnLight} opacity={0.5} duration={20000} reverse fontFamily={fontFamily} />
        <MarqueeLine text={main} top={14} color={ink} opacity={1} duration={14000} fontFamily={fontFamily} />
        <MarqueeLine text={secondary} top={28} color={AppColors.textOnLight} opacity={0.5} duration={20000} reverse fontFamily={fontFamily} />
        <MarqueeLine text={main} top={42} color={AppColors.textOnLight} opacity={0.3} duration={16000} fontFamily={fontFamily} />
      </View>
    </View>
  );
}

/** The pink strip under the title for what comes soonest ("¡Mañana! - Candelabro - …"). */
export function EventsMarquee({ event, now }: { event: HnEvent; now: number }) {
  const when = eventSoon(event.startsAt, now)?.split(',')[0] ?? '';
  return (
    <MarqueeBanner
      main={`¡${when}! - ${event.title} -`}
      secondary={`${event.venueName || event.city} -`}
      label={`${when}: ${event.title}, ${event.venueName}`}
    />
  );
}

// The design's 48 pt fits a short name ("Candelabro"); longer ones step down
// so two lines stay readable instead of squeezing one.
function titleSize(title: string) {
  const length = title.length;
  if (length <= 12) return { fontSize: 48, lineHeight: 52, letterSpacing: -2.4 };
  if (length <= 22) return { fontSize: 36, lineHeight: 40, letterSpacing: -1.6 };
  if (length <= 36) return { fontSize: 28, lineHeight: 32, letterSpacing: -1.1 };
  return { fontSize: 22, lineHeight: 26, letterSpacing: -0.8 };
}

/** A featured event: a large photo with its name, perk and when. */
export function FeaturedEventCard({ event, now, width, onPress }: { event: HnEvent; now: number; width: number; onPress: () => void }) {
  const when = eventSoon(event.startsAt, now) ?? eventWhen(event);
  const price = priceLabel(event);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${event.title}, ${when}, ${event.venueName}. Abrir`} onPress={onPress} style={({ pressed }) => [styles.featured, { width }, pressed && AppPressed]}>
      {event.imageUrl ? <Image source={{ uri: event.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
      <View style={styles.featuredShade} />
      <View style={styles.featuredTop}>
        <View style={styles.featuredTitleBlock}>
          <ThemedText numberOfLines={2} style={[styles.featuredTitle, titleSize(event.title)]}>{event.title}</ThemedText>
          {!!event.perk && <ThemedText numberOfLines={1} style={styles.featuredPerk}>{event.perk}</ThemedText>}
        </View>
        <View style={styles.featuredArrow}>
          <Image source={HNE_ICONS.arrowUpRight} style={styles.icon24} contentFit="contain" tintColor={AppColors.textOnLight} />
        </View>
      </View>
      <View style={styles.featuredBottom}>
        {!!price && <ThemedText style={styles.featuredSmall}>{price}</ThemedText>}
        <ThemedText numberOfLines={1} style={styles.featuredWhen}>{[when, event.venueName, event.city].filter(Boolean).join(' - ')}</ThemedText>
      </View>
    </Pressable>
  );
}

/** Page dots under the featured carousel. */
export function PageDots({ count, index }: { count: number; index: number }) {
  if (count < 2) return null;
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, at) => <View key={at} style={[styles.dot, at === index && styles.dotActive]} />)}
    </View>
  );
}

type CardProps = {
  event: HnEvent;
  onPress: () => void;
  /** Institution events: the sign-up button. */
  action?: { label: string; onPress: () => void; busy?: boolean; active?: boolean };
};

/** An event in a list: photo, name, when and where, a perk line and a pill. */
export function EventCard({ event, onPress, action }: CardProps) {
  const price = event.kind === 'regional' ? priceLabel(event) : null;
  const institution = event.kind === 'institution';
  const perkLine = institution
    ? event.signupMode === 'list'
      ? `Requiere inscripción${event.signupCount ? ` · ${event.signupCount} ${event.signupCount === 1 ? 'inscrito' : 'inscritos'}` : ''}`
      : event.signupMode === 'count'
        ? `No requiere inscripción${event.signupCount ? ` · ${event.signupCount} ${event.signupCount === 1 ? 'participa' : 'participan'}` : ''}`
        : ''
    : event.perk;
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${event.title}, ${eventWhen(event)}, ${event.venueName}. Ver más`} onPress={onPress} style={({ pressed }) => [styles.cardImageWrap, pressed && AppPressed]}>
        {event.imageUrl ? (
          <Image source={{ uri: event.imageUrl }} style={styles.cardImage} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <CustomIcon name="calendar" size={40} color={AppColors.textSecondary} />
          </View>
        )}
        {event.sponsored && <ThemedText style={styles.sponsored}>[Patrocinado]</ThemedText>}
        <View style={styles.moreChip}><ThemedText style={styles.moreText}>Ver más</ThemedText></View>
      </Pressable>
      <View style={styles.cardInfo}>
        <View style={styles.cardText}>
          <ThemedText numberOfLines={1} style={styles.cardTitle}>{event.title}</ThemedText>
          <ThemedText numberOfLines={1} style={styles.cardMeta}>{[eventWhen(event), event.venueName].filter(Boolean).join(' - ')}</ThemedText>
          {!!perkLine && <ThemedText numberOfLines={1} style={[styles.cardPerk, institution && event.signupMode === 'count' && styles.cardPerkMuted]}>{perkLine}</ThemedText>}
        </View>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: action.busy, selected: action.active }}
            disabled={action.busy}
            onPress={action.onPress}
            style={({ pressed }) => [styles.pill, action.active && styles.pillActive, pressed && AppPressed]}
          >
            <ThemedText numberOfLines={1} style={[styles.pillText, action.active && styles.pillTextActive]}>{action.label}</ThemedText>
          </Pressable>
        ) : price ? (
          <View style={styles.pill}><ThemedText numberOfLines={1} style={styles.pillText}>{price}</ThemedText></View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon24: {
    width: 24,
    height: 24,
  },
  marquee: {
    height: 35,
    marginHorizontal: -AppSpacing.md,
    overflow: 'hidden',
    backgroundColor: AppColors.accent,
  },
  marqueeTilt: {
    flex: 1,
    transform: [{ rotate: '-4.19deg' }, { scale: 1.15 }],
  },
  marqueeLine: {
    position: 'absolute',
    left: -40,
    width: 2000,
    flexDirection: 'row',
  },
  marqueeText: {
    flexShrink: 0,
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: -0.35,
  },
  featured: {
    height: 220,
    justifyContent: 'space-between',
    paddingHorizontal: AppSpacing.xxl,
    paddingVertical: AppSpacing.lg,
    overflow: 'hidden',
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceRaised,
  },
  featuredShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  featuredTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  featuredTitleBlock: {
    flex: 1,
    gap: 2,
  },
  featuredTitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 48,
    lineHeight: 54,
    letterSpacing: -2.4,
    color: AppColors.textPrimary,
    textShadowColor: 'rgba(0, 0, 0, 0.87)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 6,
  },
  featuredPerk: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    lineHeight: 16,
    color: AppColors.accentYellow,
    textShadowColor: 'rgba(0, 0, 0, 0.87)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  featuredArrow: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.accent,
  },
  featuredBottom: {
    alignItems: 'center',
  },
  featuredSmall: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    lineHeight: 15,
    color: AppColors.textPrimary,
    textShadowColor: 'rgba(0, 0, 0, 0.87)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  featuredWhen: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: -0.35,
    color: AppColors.textPrimary,
    textShadowColor: 'rgba(0, 0, 0, 0.87)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  dots: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 8,
    height: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.surfaceMuted,
  },
  dotActive: {
    width: 32,
    backgroundColor: AppColors.textSecondary,
  },
  card: {
    gap: 5,
  },
  cardImageWrap: {
    height: 208,
    overflow: 'hidden',
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    backgroundColor: AppColors.surfaceRaised,
  },
  cardImageFallback: {
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
  moreChip: {
    position: 'absolute',
    right: 9,
    bottom: 8,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.canvas,
  },
  moreText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: AppColors.textPrimary,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.md,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: -0.63,
    color: AppColors.textPrimary,
  },
  cardMeta: {
    opacity: 0.5,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: -0.24,
    color: AppColors.textPrimary,
  },
  cardPerk: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: -0.24,
    color: AppColors.accentMint,
  },
  cardPerkMuted: {
    color: AppColors.textSecondary,
  },
  pill: {
    minWidth: 112,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.md,
    borderWidth: 1,
    borderColor: AppColors.textSecondary,
    borderRadius: AppRadii.pill,
  },
  pillActive: {
    borderColor: AppColors.controlActive,
    backgroundColor: AppColors.controlActive,
  },
  pillText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: -0.33,
    color: AppColors.textPrimary,
  },
  pillTextActive: {
    color: AppColors.controlOnActive,
  },
});
