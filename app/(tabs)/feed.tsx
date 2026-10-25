import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { useEventBar } from '@/components/events/event-bar-store';
import { markdownToPlain } from '@/components/feed/feed-markdown';
import { FeedPostView, SpaceTile } from '@/components/feed/feed-ui';
import { StoryShareSheet, storyShareAvailable } from '@/components/share/story-share';
import type { StoryItem } from '@/components/share/story-share';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog } from '@/components/ui/hanet-dialog';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { REPORT_REASONS, canShareAsStory, deleteFeedPost, listFeed, reportFeedPost, setFeedPostPinned, spaceGroup, toggleFeedReaction, voteFeedPoll } from '@/services/feed-service';
import type { Feed, FeedPost } from '@/services/feed-service';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCached } from '@/services/cache';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

const MAX_WIDTH = 480;

type Dialog =
  | { kind: 'more'; post: FeedPost }
  | { kind: 'delete'; post: FeedPost }
  | { kind: 'report'; post: FeedPost }
  | { kind: 'share'; post: FeedPost }
  | null;

export default function FeedScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<FeedPost>>(null);
  const { query } = useEventBar();

  const [loadedFeed, setFeed] = useState<Feed | null>(null);
  // What the phone kept shows until this visit's load answers.
  const kept = useCached<Feed>(user ? 'feed' : null);
  const feed = loadedFeed ?? kept ?? null;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // An Espacio of the row on top; null is the whole feed.
  const [filter, setFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; emoji: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [working, setWorking] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);
  const [story, setStory] = useState<StoryItem | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setFeed(await listFeed());
      setNow(Date.now());
      setError(null);
    } catch (loadError) {
      setError(describeAuthError(loadError, 'No pudimos cargar el feed. Desliza hacia abajo para reintentar.'));
    }
  }, []);

  // Reloads on coming back from the form.
  useFocusEffect(useCallback(() => {
    if (user) void load();
  }, [load, user]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const term = query.trim().toLocaleLowerCase('es');
  const visible = useMemo(() => (feed?.posts ?? []).filter(post => {
    if (filter && spaceGroup(post.space.key) !== filter) return false;
    if (!term) return true;
    return [post.body, post.space.name, ...post.tags].some(value => value.toLocaleLowerCase('es').includes(term));
  }), [feed, filter, term]);

  const contentWidth = Math.min(width, MAX_WIDTH);
  const canPublish = (feed?.publishAs.length ?? 0) > 0;

  const updatePost = (id: string, change: (post: FeedPost) => FeedPost) =>
    setFeed(current => (current ? { ...current, posts: current.posts.map(post => (post.id === id ? change(post) : post)) } : current));

  const react = async (post: FeedPost, emoji: string) => {
    if (busy) return;
    setBusy({ id: post.id, emoji });
    setNotice(null);
    // Shows the change at once and settles on what the backend counted.
    const before = post.reactions;
    const had = before.find(reaction => reaction.emoji === emoji);
    const guess = had
      ? before.map(reaction => (reaction.emoji === emoji ? { ...reaction, count: reaction.count + (reaction.mine ? -1 : 1), mine: !reaction.mine } : reaction))
      : [...before, { emoji, count: 1, mine: true }];
    const order = (reactions: FeedPost['reactions']) => (feed?.emojis ?? [])
      .map(item => reactions.find(reaction => reaction.emoji === item))
      .filter((reaction): reaction is FeedPost['reactions'][number] => !!reaction && reaction.count > 0);
    updatePost(post.id, item => ({ ...item, reactions: order(guess) }));
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    try {
      const result = await toggleFeedReaction(post.id, emoji);
      updatePost(post.id, item => ({
        ...item,
        reactions: order(item.reactions.some(reaction => reaction.emoji === emoji)
          ? item.reactions.map(reaction => (reaction.emoji === emoji ? result : reaction))
          : [...item.reactions, result]),
      }));
    } catch (reactError) {
      updatePost(post.id, item => ({ ...item, reactions: before }));
      setNotice(describeAuthError(reactError, 'No pudimos guardar tu reacción. Inténtalo nuevamente.'));
    } finally {
      setBusy(null);
    }
  };

  const vote = async (post: FeedPost, option: string) => {
    if (voting) return;
    setVoting(post.id);
    setNotice(null);
    try {
      const poll = await voteFeedPoll(post.id, option);
      updatePost(post.id, item => ({ ...item, poll }));
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (voteError) {
      setNotice(describeAuthError(voteError, 'No pudimos guardar tu voto. Inténtalo nuevamente.'));
    } finally {
      setVoting(null);
    }
  };

  // The school's and the CEE's posts can also go out as a story image.
  const share = (post: FeedPost) => {
    if (storyShareAvailable && canShareAsStory(post)) setDialog({ kind: 'share', post });
    else shareText(post);
  };

  const shareText = (post: FeedPost) => {
    void Share.share({ message: post.body ? `${post.space.name}: ${markdownToPlain(post.body)}` : post.space.name }).catch(() => undefined);
  };

  const run = async (action: () => Promise<void>, fallback: string, done?: string) => {
    setWorking(true);
    try {
      await action();
      setDialog(null);
      if (done) setNotice(done);
      await load();
    } catch (actionError) {
      setDialog(null);
      setNotice(describeAuthError(actionError, fallback));
    } finally {
      setWorking(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Feed y comunidad, volver arriba"
          onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })}
          style={({ pressed }) => [styles.logoButton, pressed && AppPressed]}
        >
          <Svg width={19} height={28} viewBox="0 0 20 29" fill="none">
            <Path d="M0 0L6.87688 6.43605V13.1403L10.3153 13.5425V8.98366L19.3082 9.78816V19.1741L10.3153 19.9786V15.4197L6.87688 15.822V22.5262L0 28.9622V0Z" fill={AppColors.accent} />
          </Svg>
        </Pressable>
        <View style={styles.titleWrap}>
          <ThemedText accessibilityRole="header" style={styles.title}>Feed y comunidad</ThemedText>
          {!!feed?.institutionName && <ThemedText numberOfLines={1} style={styles.subtitle}>{feed.institutionName}</ThemedText>}
        </View>
      </View>

      {!!feed && feed.spaces.length > 0 && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spaces}>
            {feed.spaces.map(space => {
              const group = spaceGroup(space.key);
              return (
                <SpaceTile
                  key={space.key}
                  space={space}
                  selected={filter === group}
                  onPress={() => {
                    if (Platform.OS === 'ios') void Haptics.selectionAsync();
                    setFilter(current => (current === group ? null : group));
                  }}
                />
              );
            })}
          </ScrollView>
          <View style={styles.rule} />
        </>
      )}
      {!!error && <ThemedText accessibilityLiveRegion="polite" style={styles.error}>{error}</ThemedText>}
      {!!notice && <ThemedText accessibilityLiveRegion="polite" style={styles.notice}>{notice}</ThemedText>}
    </View>
  );

  const selectedSpace = filter ? feed?.spaces.find(space => spaceGroup(space.key) === filter) : null;
  const empty = !feed ? (
    !error ? <ActivityIndicator style={styles.loader} color={AppColors.textSecondary} /> : null
  ) : (
    <View style={styles.empty}>
      <CustomIcon name="feed" size={40} color={AppColors.textSecondary} />
      <ThemedText style={styles.emptyTitle}>
        {term ? 'No encontramos coincidencias' : selectedSpace ? `${selectedSpace.name} todavía no publica nada` : 'Todavía no hay publicaciones'}
      </ThemedText>
      <ThemedText style={styles.emptyText}>
        {term
          ? 'Prueba con otra palabra o un tag.'
          : canPublish
            ? 'Toca el botón + para publicar la primera.'
            : 'Cuando tu liceo, el CEE o tu directiva publiquen algo, aparecerá aquí.'}
      </ThemedText>
    </View>
  );

  const current = dialog?.post;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        ref={list}
        data={visible}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <FeedPostView
            post={item}
            emojis={feed?.emojis ?? []}
            width={contentWidth}
            now={now}
            busyEmoji={busy?.id === item.id ? busy.emoji : null}
            votingPoll={voting === item.id}
            onReact={emoji => void react(item, emoji)}
            onVote={option => void vote(item, option)}
            onOpenEvent={eventId => router.push({ pathname: '/event-detail', params: { id: eventId } })}
            onMore={() => setDialog({ kind: 'more', post: item })}
            onShare={() => share(item)}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.accent} />}
      />

      {canPublish && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Crear publicación"
          onPress={() => router.push('/feed-post')}
          style={({ pressed }) => [styles.fab, pressed && AppPressed]}
        >
          <CustomIcon name="plus" size={28} color={AppColors.textPrimary} />
        </Pressable>
      )}

      <HanetDialog
        visible={dialog?.kind === 'more'}
        onRequestClose={() => !working && setDialog(null)}
        dismissOnBackdrop={!working}
        title={current?.space.name}
      >
        <View style={styles.dialogButtons}>
          {current?.canEdit && (
            <HanetButton label="Editar" variant="surface" disabled={working} onPress={() => { setDialog(null); router.push({ pathname: '/feed-post', params: { id: current.id } }); }} />
          )}
          {current?.canPin && (
            <HanetButton
              label={current.pinned ? 'Quitar de arriba' : 'Fijar arriba'}
              variant="surface"
              disabled={working}
              onPress={() => void run(() => setFeedPostPinned(current.id, !current.pinned), 'No pudimos cambiar la publicación fijada.')}
            />
          )}
          {current?.canEdit && (
            <HanetButton label="Eliminar" variant="surface" disabled={working} onPress={() => setDialog({ kind: 'delete', post: current })} />
          )}
          {current && !current.canEdit && (
            <HanetButton label="Reportar" variant="surface" disabled={working} onPress={() => setDialog({ kind: 'report', post: current })} />
          )}
          <HanetButton label="Cancelar" variant="surface" disabled={working} onPress={() => setDialog(null)} />
        </View>
      </HanetDialog>

      <HanetDialog
        visible={dialog?.kind === 'share'}
        onRequestClose={() => setDialog(null)}
        dismissOnBackdrop
        title="Compartir publicación"
      >
        <View style={styles.dialogButtons}>
          <HanetButton label="Como historia" variant="primary" onPress={() => { if (current) setStory({ kind: 'post', post: current }); setDialog(null); }} />
          <HanetButton label="Como texto" variant="surface" onPress={() => { if (current) shareText(current); setDialog(null); }} />
          <HanetButton label="Cancelar" variant="surface" onPress={() => setDialog(null)} />
        </View>
      </HanetDialog>

      <StoryShareSheet item={story} onClose={() => setStory(null)} />

      <HanetDialog
        visible={dialog?.kind === 'delete'}
        onRequestClose={() => !working && setDialog(null)}
        dismissOnBackdrop={!working}
        title="¿Eliminar esta publicación?"
        body="Desaparece del feed para todos, con sus reacciones e imágenes."
      >
        <View style={styles.dialogButtons}>
          <HanetButton
            label={working ? 'Eliminando…' : 'Eliminar'}
            variant="accent"
            disabled={working}
            onPress={() => current && void run(() => deleteFeedPost(current.id), 'No pudimos eliminar la publicación.')}
          />
          <HanetButton label="Cancelar" variant="surface" disabled={working} onPress={() => setDialog(null)} />
        </View>
      </HanetDialog>

      <HanetDialog
        visible={dialog?.kind === 'report'}
        onRequestClose={() => !working && setDialog(null)}
        dismissOnBackdrop={!working}
        title="¿Por qué la reportas?"
        body="Lo revisa la administración de tu liceo o el equipo HaNet. Nadie más sabe que la reportaste."
      >
        <View style={styles.dialogButtons}>
          {REPORT_REASONS.map(reason => (
            <HanetButton
              key={reason.value}
              label={reason.label}
              variant="surface"
              disabled={working}
              onPress={() => current && void run(() => reportFeedPost(current.id, reason.value), 'No pudimos enviar el reporte.', 'Gracias. Enviamos tu reporte.')}
            />
          ))}
          <HanetButton label="Cancelar" variant="surface" disabled={working} onPress={() => setDialog(null)} />
        </View>
      </HanetDialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  content: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
    paddingBottom: TAB_BAR_CLEARANCE + AppSpacing.xxl + 64,
  },
  header: {
    gap: AppSpacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    paddingTop: AppSpacing.sm,
  },
  logoButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(60, 59, 62, 0.72)',
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  subtitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  spaces: {
    gap: 6,
    paddingHorizontal: AppSpacing.md,
    paddingBottom: AppSpacing.sm,
  },
  rule: {
    height: 1,
    marginHorizontal: AppSpacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  loader: {
    marginTop: AppSpacing.xxl,
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
    paddingHorizontal: AppSpacing.lg,
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  notice: {
    paddingHorizontal: AppSpacing.lg,
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  fab: {
    position: 'absolute',
    right: AppSpacing.lg,
    bottom: TAB_BAR_CLEARANCE + AppSpacing.lg,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.accent,
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.3)',
  },
  dialogButtons: {
    gap: AppSpacing.sm,
  },
});
