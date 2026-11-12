import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppTouch, AppType } from '@/constants/design-tokens';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  action?: { label: string; onPress: () => void; disabled?: boolean };
};

/**
 * A small floating pill at the top of the screen, over everything: the
 * offline notice and, on the web, "Hay una versión nueva". It never blocks
 * the screen below it.
 */
export function TopNotice({ icon, text, action }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + AppSpacing.sm }]}>
      <Animated.View
        entering={FadeInUp.duration(180)}
        exiting={FadeOutUp.duration(140)}
        accessibilityRole="alert"
        style={[styles.pill, !action && styles.pillPlain]}
      >
        <Ionicons name={icon} size={16} color={AppColors.textPrimary} />
        <ThemedText numberOfLines={2} style={styles.text}>{text}</ThemedText>
        {action && (
          <Pressable
            accessibilityRole="button"
            disabled={action.disabled}
            hitSlop={8}
            onPress={action.onPress}
            style={({ pressed }) => [styles.action, pressed && AppPressed, action.disabled && styles.disabled]}
          >
            <ThemedText style={styles.actionLabel}>{action.label}</ThemedText>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: AppSpacing.lg,
    right: AppSpacing.lg,
    alignItems: 'center',
    zIndex: 900,
    elevation: 25,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    maxWidth: 520,
    minHeight: AppTouch.minimum,
    paddingLeft: AppSpacing.lg,
    paddingRight: AppSpacing.xs + 2,
    paddingVertical: AppSpacing.xs + 2,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.surfaceMuted,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  pillPlain: {
    paddingRight: AppSpacing.lg,
  },
  text: {
    ...AppType.footnote,
    flexShrink: 1,
    color: AppColors.textPrimary,
    paddingRight: AppSpacing.xs,
  },
  action: {
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.controlActive,
  },
  actionLabel: {
    ...AppType.caption,
    color: AppColors.controlOnActive,
  },
  disabled: {
    opacity: 0.6,
  },
});
