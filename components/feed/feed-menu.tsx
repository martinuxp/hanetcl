import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { eventBar } from '@/components/events/event-bar-store';
import type { EventBarCompose } from '@/components/events/event-bar-store';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { SPRING_SMOOTH } from '@/constants/motion';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

// The feed's center pill for those who publish: like the Calendar's views and
// the Aniversario's "Organizar", a menu grows out of the bar with "Crear" and
// the search (which then opens in the bar as it does for everyone else).

// The bar's text stops growing with the system size at this point.
const MAX_SCALE = 1.3;

const tick = () => {
  if (Platform.OS === 'ios') void Haptics.selectionAsync();
};

export function FeedMenuPill({ label, open }: { label: string; open: boolean }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.value = reduceMotion ? withTiming(open ? 1 : 0, { duration: 100 }) : withSpring(open ? 1 : 0, SPRING_SMOOTH);
  }, [open, reduceMotion, turn]);
  // The chevron points up to where the menu opens, and down to close it.
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-90 + turn.value * 180}deg` }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={open ? 'Cierra el menú' : 'Publicar o buscar'}
      accessibilityState={{ expanded: open }}
      onPress={() => {
        tick();
        eventBar.toggleMenu();
      }}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Animated.View layout={reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING_SMOOTH.stiffness).damping(SPRING_SMOOTH.damping)} style={styles.pill}>
        <CustomIcon name="feed" size={18} color={AppColors.textOnLight} />
        <ThemedText maxFontSizeMultiplier={MAX_SCALE} style={styles.pillText}>{label}</ThemedText>
        <Animated.View style={chevronStyle}>
          <CustomIcon name="chevron-right" size={14} color={AppColors.textOnLight} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** What grows out of the pill: publishing first, then the search. */
export function FeedMenu({ compose, placeholder }: { compose: EventBarCompose; placeholder: string }) {
  const rows: { key: string; label: string; icon: React.ComponentProps<typeof CustomIcon>['name']; onPress: () => void }[] = [
    {
      key: 'compose',
      label: compose.label,
      icon: 'plus',
      onPress: () => {
        eventBar.closeMenu();
        compose.onPress();
      },
    },
    { key: 'search', label: placeholder, icon: 'search', onPress: eventBar.openSearch },
  ];

  return (
    <View accessibilityRole="menu" style={styles.menu}>
      {rows.map(row => (
        <Pressable
          key={row.key}
          accessibilityRole="menuitem"
          accessibilityLabel={row.label}
          onPress={() => {
            tick();
            row.onPress();
          }}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.icon}><CustomIcon name={row.icon} size={22} color={AppColors.textSecondary} /></View>
          <ThemedText maxFontSizeMultiplier={MAX_SCALE} style={styles.rowText}>{row.label}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  pill: {
    height: 45,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.controlActive,
  },
  pillText: {
    color: AppColors.textOnLight,
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
  },
  menu: {
    padding: AppSpacing.sm + 2,
    paddingBottom: AppSpacing.xs,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md + 2,
    paddingHorizontal: AppSpacing.md + 2,
    borderRadius: AppRadii.md,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  icon: {
    width: 24,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 17,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
});
