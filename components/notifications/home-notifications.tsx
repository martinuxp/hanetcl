import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { NotificationRow } from '@/components/notifications/notification-row';
import { PullHint } from '@/components/notifications/pull-hint';
import { ThemedText } from '@/components/themed-text';
import { AppColors } from '@/constants/design-tokens';
import type { NotificationsState } from '@/services/notifications-service';
import { t } from '@/i18n';

// The end of the Home (Figma 11011:3217): how many notifications are new,
// the latest one or two, and under them the top of the notifications
// section peeking out, which a pull up opens.

const PREVIEW = 2;

type PreviewProps = {
  state: NotificationsState | null;
  onOpen: () => void;
};

export function HomeNotificationsPreview({ state, onOpen }: PreviewProps) {
  const [now] = useState(() => Date.now());
  const unread = state?.unread ?? 0;
  const latest = (state?.items ?? []).slice(0, PREVIEW);
  return (
    <View style={styles.preview}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t('components.notifications.homeNotifications.abreTusNotificaciones')}
        onPress={onOpen}
        hitSlop={6}
        style={({ pressed }) => [styles.summary, pressed && styles.pressed]}
      >
        <View style={styles.summaryLine}>
          <ThemedText style={styles.summaryText}>
            {unread > 0 ? (t('components.notifications.homeNotifications.tienesCountNotificacionesNuevas', { count: unread })) : t('components.notifications.homeNotifications.noTienesNotificacionesNuevas')}
          </ThemedText>
          <Ionicons name="chevron-down" size={14} color={AppColors.textPrimary} />
        </View>
        <ThemedText style={styles.caption}>{t('components.notifications.homeNotifications.deslizaHaciaArribaParaVer')}</ThemedText>
      </Pressable>
      {latest.length > 0 && (
        <View style={styles.card}>
          {latest.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <View style={styles.divider} />}
              <NotificationRow item={item} unread={item.at > (state?.seenAt ?? 0)} now={now} compact />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

type PeekProps = {
  pull: SharedValue<number>;
  armed: SharedValue<boolean>;
  threshold: number;
};

/**
 * The Home's last block: at rest it is empty, on the Home's own background
 * (also in anniversary week); the hint shows only while pulling. Pulled past the end, the notifications
 * section's surface shows under it and the block takes that color as the
 * pull grows (decided by muxp 2026-11-11, instead of the Figma's grey at rest).
 * On iOS the bounce below it shows more of that surface.
 */
export function NotificationsPeek({ pull, armed, threshold }: PeekProps) {
  const { height } = useWindowDimensions();
  const tintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pull.get(), [0, threshold * 0.6], [0, 1], 'clamp'),
  }));
  return (
    <View style={styles.peek}>
      <Animated.View pointerEvents="none" style={[styles.tint, tintStyle]} />
      <View pointerEvents="none" style={[styles.below, { height: height * 2 }]} />
      <PullHint
        pull={pull}
        armed={armed}
        threshold={threshold}
        direction="up"
        pullLabel={t('components.notifications.homeNotifications.deslizaParaVerTusNotificaciones')}
        releaseLabel={t('components.notifications.homeNotifications.sueltaParaAbrirTusNotificaciones')}
        follow={{ rate: 0.5 }}
        fade
        style={styles.hint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    paddingHorizontal: 20,
    gap: 16,
    marginBottom: 24,
  },
  summary: {
    alignItems: 'center',
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  caption: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 10,
    lineHeight: 14,
    color: AppColors.textSecondary,
    opacity: 0.75,
  },
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 24,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.surfaceMuted,
  },
  peek: {
    height: TAB_BAR_CLEARANCE + 24,
  },
  tint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: AppColors.surface,
  },
  below: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: AppColors.surface,
  },
  hint: {
    paddingTop: 26,
  },
});
