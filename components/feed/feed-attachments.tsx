import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { eventWhen } from '@/services/events-service';
import { pollClosing } from '@/services/feed-service';
import type { FeedEvent, FeedPoll } from '@/services/feed-service';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

// What a post can carry besides text and images: an event of HaNet Eventos
// (a card that opens it) and an anonymous poll.

/** An event shared in a post. */
export function FeedEventCard({ event, onPress }: { event: FeedEvent; onPress?: () => void }) {
  if (event.missing) {
    return (
      <View style={[styles.event, styles.eventMissing]}>
        <CustomIcon name="calendar" size={22} color={AppColors.textSecondary} />
        <ThemedText style={styles.eventMeta}>Este evento ya no está disponible.</ThemedText>
      </View>
    );
  }
  const place = [event.venueName, event.city].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Evento: ${event.title}, ${eventWhen(event)}${place ? `, ${place}` : ''}. Abrir`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.event, pressed && AppPressed]}
    >
      <View style={[styles.eventCover, event.palette[0] ? { backgroundColor: event.palette[0] } : null]}>
        {event.imageUrl
          ? <Image source={{ uri: event.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
          : <CustomIcon name="calendar" size={26} color={AppColors.textSecondary} />}
      </View>
      <View style={styles.eventText}>
        <ThemedText style={styles.eventKicker}>{event.kind === 'institution' ? 'Evento del liceo' : 'HaNet Eventos'}</ThemedText>
        <ThemedText numberOfLines={2} style={styles.eventTitle}>{event.title}</ThemedText>
        <ThemedText numberOfLines={1} style={styles.eventMeta}>{[eventWhen(event), place].filter(Boolean).join(' · ')}</ThemedText>
      </View>
      {!!onPress && <CustomIcon name="chevron-right" size={20} color={AppColors.textSecondary} />}
    </Pressable>
  );
}

/**
 * The poll of a post. Before voting it lists the options; after voting (or
 * once it closes) it shows the bars, unless the results wait for the close.
 */
export function FeedPollView({ poll, now, busy, onVote }: { poll: FeedPoll; now: number; busy: boolean; onVote: (option: string) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const open = !poll.closed && !!poll.closesAt && poll.closesAt > now;
  const canVote = open && !poll.voted;
  const showsResults = poll.total !== null;
  const top = showsResults ? Math.max(...poll.options.map(option => option.count ?? 0)) : 0;

  return (
    <View style={styles.poll}>
      {poll.options.map(option => {
        const share = showsResults && poll.total ? (option.count ?? 0) / poll.total : 0;
        const leading = showsResults && !!poll.total && option.count === top;
        if (canVote) {
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen === option.id, disabled: busy }}
              disabled={busy}
              onPress={() => setChosen(option.id)}
              style={({ pressed }) => [styles.option, chosen === option.id && styles.optionChosen, pressed && AppPressed]}
            >
              <View style={[styles.radio, chosen === option.id && styles.radioOn]} />
              <ThemedText style={styles.optionText}>{option.text}</ThemedText>
            </Pressable>
          );
        }
        return (
          <View
            key={option.id}
            accessible
            accessibilityLabel={showsResults ? `${option.text}: ${Math.round(share * 100)} %` : option.text}
            style={styles.result}
          >
            {showsResults && <View style={[styles.bar, leading && styles.barLeading, { width: `${Math.max(share * 100, 2)}%` }]} />}
            <ThemedText style={[styles.optionText, leading && styles.optionLeading]}>{option.text}</ThemedText>
            {showsResults && <ThemedText style={[styles.percent, leading && styles.optionLeading]}>{Math.round(share * 100)} %</ThemedText>}
          </View>
        );
      })}

      {canVote && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !chosen || busy, busy }}
          disabled={!chosen || busy}
          onPress={() => chosen && onVote(chosen)}
          style={({ pressed }) => [styles.vote, (!chosen || busy) && styles.voteDisabled, pressed && AppPressed]}
        >
          <ThemedText style={styles.voteText}>{busy ? 'Votando…' : 'Votar'}</ThemedText>
        </Pressable>
      )}

      <ThemedText style={styles.pollMeta}>
        {[
          poll.voted ? 'Votaste' : null,
          showsResults ? `${poll.total} ${poll.total === 1 ? 'voto' : 'votos'}` : poll.voted && poll.results === 'closed' ? 'Los resultados se ven al cerrar' : null,
          pollClosing(poll, now),
        ].filter(Boolean).join(' · ')}
      </ThemedText>
      <ThemedText style={styles.anonymous}>Votación anónima: nadie puede ver qué elegiste, ni tu liceo ni HaNet. El voto no se puede cambiar.</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    marginHorizontal: AppSpacing.lg,
    padding: 10,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  eventMissing: {
    padding: AppSpacing.lg,
  },
  eventCover: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceRaised,
  },
  eventText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eventKicker: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    color: AppColors.accent,
  },
  eventTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 21,
    color: AppColors.textPrimary,
  },
  eventMeta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  poll: {
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
  },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: 10,
    borderRadius: AppRadii.pill,
    borderWidth: 1.5,
    borderColor: AppColors.surfaceMuted,
  },
  optionChosen: {
    borderColor: AppColors.accent,
    backgroundColor: 'rgba(239, 34, 116, 0.14)',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: AppRadii.pill,
    borderWidth: 2,
    borderColor: AppColors.textSecondary,
  },
  radioOn: {
    borderWidth: 6,
    borderColor: AppColors.accent,
  },
  optionText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  optionLeading: {
    fontFamily: 'DMSans_700Bold',
  },
  result: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    overflow: 'hidden',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  bar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: AppColors.surfaceMuted,
  },
  barLeading: {
    backgroundColor: 'rgba(239, 34, 116, 0.45)',
  },
  percent: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  vote: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.accent,
  },
  voteDisabled: {
    opacity: 0.45,
  },
  voteText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  pollMeta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  anonymous: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
    opacity: 0.75,
  },
});
