import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { NotificationRow } from '@/components/notifications/notification-row';
import { PullHint } from '@/components/notifications/pull-hint';
import type { PullDown } from '@/components/notifications/pull-down';
import { ThemedText } from '@/components/themed-text';
import { AppColors } from '@/constants/design-tokens';
import type { HnNotification, NotificationsState } from '@/services/notifications-service';
import { t } from '@/i18n';

// The notifications section, right under the Home: pulling the Home's end
// up sends the Home up and brings this up after it. Pulling this down past
// its top (or "Inicio") brings the Home back down. What was new when it opened stays marked as new
// until it closes, even though opening already counted it as seen.

type Row = { type: 'header'; key: string; label: string } | { type: 'item'; key: string; item: HnNotification; unread: boolean };

export const CLOSE_THRESHOLD = 96;

type Props = {
  state: NotificationsState | null;
  /** When the section opened, so what was new then stays marked. */
  seenBefore: number;
  error: boolean;
  onRetry: () => void;
  onClose: () => void;
  /** The pull down that closes it (it lives with the Home's). */
  close: PullDown;
  visible: boolean;
  /** Where it is while the Home goes up or comes back. */
  style?: React.ComponentProps<typeof Animated.View>['style'];
};

export function NotificationsPanel({ state, seenBefore, error, onRetry, onClose, close, visible, style }: Props) {
  const insets = useSafeAreaInsets();
  const [now] = useState(() => Date.now());

  const rows = useMemo<Row[]>(() => {
    const items = state?.items ?? [];
    const fresh = items.filter(item => item.at > seenBefore);
    const older = items.filter(item => item.at <= seenBefore);
    const out: Row[] = [];
    if (fresh.length) {
      out.push({ type: 'header', key: 'h-new', label: t('components.notifications.notificationsPanel.nuevas') });
      out.push(...fresh.map(item => ({ type: 'item' as const, key: item.id, item, unread: true })));
    }
    if (older.length) {
      if (fresh.length) out.push({ type: 'header', key: 'h-old', label: t('components.notifications.notificationsPanel.anteriores') });
      out.push(...older.map(item => ({ type: 'item' as const, key: item.id, item, unread: false })));
    }
    return out;
  }, [state, seenBefore]);

  // On Android the list itself follows the finger down.
  const listStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: close.translates ? close.pull.get() : 0 }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      accessibilityViewIsModal={visible}
      style={[StyleSheet.absoluteFill, styles.root, style]}
    >
      <PullHint
        pull={close.pull}
        armed={close.armed}
        threshold={CLOSE_THRESHOLD}
        direction="down"
        pullLabel={t('components.notifications.notificationsPanel.deslizaParaVolverAlInicio')}
        releaseLabel={t('components.notifications.notificationsPanel.sueltaParaVolverAlInicio')}
        follow={distance => Math.max(0, distance - 70) * 0.5}
        fade
        style={[styles.closeHint, { top: insets.top + 12 }]}
      />
      <Animated.View style={[styles.fill, listStyle]}>
        <GestureDetector gesture={close.gesture}>
          <Animated.FlatList
            data={rows}
            keyExtractor={row => row.key}
            onScroll={close.onScroll}
            scrollEventThrottle={16}
            overScrollMode="never"
            alwaysBounceVertical
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
            ListHeaderComponent={(
              <View style={styles.header}>
                <ThemedText accessibilityRole="header" style={styles.title}>{t('components.notifications.notificationsPanel.notificaciones')}</ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('components.notifications.notificationsPanel.volverAlInicio')}
                  onPress={onClose}
                  hitSlop={8}
                  style={({ pressed }) => [styles.back, pressed && styles.pressed]}
                >
                  <Ionicons name="chevron-up" size={18} color={AppColors.textPrimary} />
                  <ThemedText style={styles.backText}>{t('layout.inicio')}</ThemedText>
                </Pressable>
              </View>
            )}
            ListEmptyComponent={(
              <View style={styles.empty}>
                {error ? (
                  <>
                    <ThemedText style={styles.emptyTitle}>{t('components.notifications.notificationsPanel.noPudimosCargarTusNotificaciones')}</ThemedText>
                    <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                      <ThemedText style={styles.retryText}>{t('common.reintentar')}</ThemedText>
                    </Pressable>
                  </>
                ) : state ? (
                  <>
                    <View style={styles.emptyIcon}>
                      <Ionicons name="notifications-outline" size={28} color={AppColors.textSecondary} />
                    </View>
                    <ThemedText style={styles.emptyTitle}>{t('components.notifications.notificationsPanel.todaviaNoTienesNotificaciones')}</ThemedText>
                    <ThemedText style={styles.emptyText}>{t('components.notifications.notificationsPanel.aquiQuedanLosAnunciosTareas')}</ThemedText>
                  </>
                ) : (
                  <ThemedText style={styles.emptyText}>{t('common.cargando')}</ThemedText>
                )}
              </View>
            )}
            renderItem={({ item: row }) => (row.type === 'header'
              ? <ThemedText accessibilityRole="header" style={styles.section}>{row.label}</ThemedText>
              : <NotificationRow item={row.item} unread={row.unread} now={now} />)}
          />
        </GestureDetector>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: AppColors.surface,
  },
  closeHint: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  fill: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -1.1,
    color: AppColors.textPrimary,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: AppColors.surfaceMuted,
  },
  backText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  pressed: {
    opacity: 0.72,
  },
  section: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
    opacity: 0.7,
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 4,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 72,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: AppColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 17,
    lineHeight: 22,
    color: AppColors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
    textAlign: 'center',
    opacity: 0.8,
  },
  retry: {
    marginTop: 8,
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: AppColors.controlActive,
    justifyContent: 'center',
  },
  retryText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: AppColors.controlOnActive,
  },
});
