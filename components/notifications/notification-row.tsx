import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stripes } from '@/components/grades/stripes';
import { ThemedText } from '@/components/themed-text';
import { AppColors } from '@/constants/design-tokens';
import { notificationAge } from '@/services/notifications-service';
import type { HnNotification, NotificationKind } from '@/services/notifications-service';
import { t } from '@/i18n';

// One notification, in the section and in the Home's preview. A new grade
// wears the scratch card's stripes, like everything else that points to a
// covered grade; nothing here ever shows the grade itself.

const ICONS: Record<NotificationKind, React.ComponentProps<typeof Ionicons>['name']> = {
  announcement: 'megaphone-outline',
  material: 'document-attach-outline',
  task: 'checkbox-outline',
  taskTomorrow: 'time-outline',
  reviewed: 'chatbubble-ellipses-outline',
  grade: 'ribbon-outline',
  gradeCorrected: 'ribbon-outline',
  anniversary: 'trophy-outline',
  feed: 'newspaper-outline',
  test: 'notifications-outline',
};

const GRADE_KINDS: NotificationKind[] = ['grade', 'gradeCorrected'];

type Props = {
  item: HnNotification;
  unread: boolean;
  now: number;
  /** The Home's preview: one line of body, on a card. */
  compact?: boolean;
  onOpen?: () => void;
};

export function NotificationRow({ item, unread, now, compact, onOpen }: Props) {
  const router = useRouter();
  const grade = GRADE_KINDS.includes(item.kind);
  const age = notificationAge(item.at, now);
  const open = () => {
    onOpen?.();
    if (item.url) router.push(item.url as never);
  };
  return (
    <Pressable
      accessibilityRole={item.url ? 'button' : 'text'}
      accessibilityLabel={[unread ? t('components.notifications.notificationRow.nueva') : null, item.title, item.body, age].filter(Boolean).join('. ')}
      disabled={!item.url}
      onPress={open}
      style={({ pressed }) => [styles.row, compact && styles.compact, pressed && styles.pressed]}
    >
      <View style={[styles.icon, grade && styles.gradeIcon]}>
        {grade && <Stripes />}
        <Ionicons name={ICONS[item.kind] ?? 'notifications-outline'} size={20} color={AppColors.textPrimary} />
      </View>
      <View style={styles.text}>
        <View style={styles.top}>
          <ThemedText numberOfLines={1} style={styles.title}>{item.title}</ThemedText>
          <View style={styles.meta}>
            {unread && <View style={styles.dot} />}
            <ThemedText style={styles.age}>{age}</ThemedText>
          </View>
        </View>
        {!!item.body && <ThemedText numberOfLines={compact ? 1 : 3} style={styles.body}>{item.body}</ThemedText>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  compact: {
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  pressed: {
    opacity: 0.72,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: AppColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeIcon: {
    backgroundColor: AppColors.accent,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.accent,
  },
  age: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
    opacity: 0.7,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 19,
    color: AppColors.textSecondary,
    opacity: 0.85,
  },
});
