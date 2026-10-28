import { SectionTitle } from '@/components/anniversary/anniversary-ui';
import { organizeBar } from '@/components/anniversary/organize-menu';
import { markdownToPlain } from '@/components/feed/feed-markdown';
import { SpaceAvatar } from '@/components/feed/feed-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { useSession } from '@/services/auth-service';
import { useCached } from '@/services/cache';
import { ANNIVERSARY_TAG, feedWhen, listFeed } from '@/services/feed-service';
import type { Feed } from '@/services/feed-service';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

const SHOWN = 2;

/**
 * The Aniversario's avisos on its page: the latest posts of the Feed tagged
 * #Aniversario (the CEE's and the school's). The whole list, with reactions,
 * opens in app/anniversary/notices.tsx. Nothing shows when the Feed is off.
 */
export function NoticesPreview({ now }: { now: number }) {
  const router = useRouter();
  const { user } = useSession();
  const kept = useCached<Feed>(user ? `feed:tag:${ANNIVERSARY_TAG}` : null);
  const [loaded, setLoaded] = useState<Feed | null>(null);
  const [off, setOff] = useState(false);
  const feed = loaded ?? kept ?? null;

  useFocusEffect(useCallback(() => {
    if (!user) return;
    let active = true;
    listFeed(ANNIVERSARY_TAG)
      .then(result => {
        if (!active) return;
        setLoaded(result);
        setOff(false);
        organizeBar.setCanPost(result.publishAs.length > 0);
      })
      .catch(() => {
        if (!active) return;
        setOff(true);
        organizeBar.setCanPost(false);
      });
    return () => { active = false; };
  }, [user]));

  if (off || !feed) return null;
  const canPost = feed.publishAs.length > 0;
  const posts = feed.posts.slice(0, SHOWN);
  if (!posts.length && !canPost) return null;

  const openAll = () => router.push('/anniversary/notices');
  const publish = () => router.push({ pathname: '/feed-post', params: { tag: ANNIVERSARY_TAG } });

  return (
    <>
      <SectionTitle title="Avisos" action={posts.length ? { label: feed.posts.length > SHOWN ? `Ver los ${feed.posts.length}` : 'Ver todos', onPress: openAll } : undefined} />
      {posts.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={styles.emptyTitle}>Todavía no hay avisos</ThemedText>
          <ThemedText style={styles.emptyText}>Cambios de horario, materiales, lo que las alianzas tengan que saber. Salen aquí y en el Feed, y pueden llegar con notificación.</ThemedText>
          <HanetButton label="Publicar un aviso" variant="accent" onPress={publish} />
        </View>
      ) : (
        <View style={styles.list}>
          {posts.map((post, index) => {
            const text = markdownToPlain(post.body).replace(/\s+/g, ' ').trim();
            return (
              <Pressable
                key={post.id}
                accessibilityRole="button"
                accessibilityLabel={`${post.space.name}, ${feedWhen(post.createdAt, now)}: ${text}`}
                accessibilityHint="Abre los avisos del aniversario"
                onPress={openAll}
                style={({ pressed }) => [styles.notice, index > 0 && styles.divider, pressed && AppPressed]}
              >
                <SpaceAvatar space={post.space} size={36} />
                <View style={styles.noticeText}>
                  <View style={styles.noticeHead}>
                    <ThemedText numberOfLines={1} style={styles.space}>{post.space.name}</ThemedText>
                    <ThemedText style={styles.when}>{feedWhen(post.createdAt, now)}</ThemedText>
                  </View>
                  {!!text && <ThemedText numberOfLines={3} style={styles.body}>{text}</ThemedText>}
                </View>
                {!!post.images[0] && <Image source={{ uri: post.images[0] }} style={styles.thumb} contentFit="cover" accessible={false} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.md,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.surfaceMuted,
  },
  noticeText: {
    flex: 1,
    gap: 2,
  },
  noticeHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: AppSpacing.sm,
  },
  space: {
    flexShrink: 1,
    ...AppType.headline,
    fontSize: 15,
    color: AppColors.textPrimary,
  },
  when: {
    ...AppType.caption,
    color: AppColors.textSecondary,
  },
  body: {
    ...AppType.callout,
    fontFamily: 'DMSans_400Regular',
    color: AppColors.textSecondary,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: AppRadii.sm,
    backgroundColor: AppColors.surfaceMuted,
  },
  empty: {
    gap: AppSpacing.sm,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  emptyTitle: {
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  emptyText: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
    marginBottom: AppSpacing.xs,
  },
});
