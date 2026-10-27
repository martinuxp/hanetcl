import { BoltIcon, CrownIcon } from '@/assets/animated-icons/crown';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { SPRING_SMOOTH } from '@/constants/motion';
import { ANNIVERSARY_TAG } from '@/services/feed-service';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import React, { useEffect, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

// What the Aniversario shares with the global bar: organizers get an
// "Organizar" pill in its center, and the tools grow out of it as the
// Calendar's views do. The screen says whether its avisos can be published
// (the Feed may be off for the institution).

type State = { menuOpen: boolean; canPost: boolean };

let state: State = { menuOpen: false, canPost: false };
const listeners = new Set<() => void>();

function set(changes: Partial<State>) {
  state = { ...state, ...changes };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOrganizeBar() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export const organizeBar = {
  toggleMenu: () => set({ menuOpen: !state.menuOpen }),
  closeMenu: () => { if (state.menuOpen) set({ menuOpen: false }); },
  setCanPost: (canPost: boolean) => { if (canPost !== state.canPost) set({ canPost }); },
};

// The bar's text stops growing with the system size at this point.
const MAX_SCALE = 1.3;

const tick = () => {
  if (Platform.OS === 'ios') void Haptics.selectionAsync();
};

export function OrganizePill({ open }: { open: boolean }) {
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
      accessibilityLabel="Organizar"
      accessibilityHint={open ? 'Cierra el menú' : 'Avisos, pruebas flash, puntos, actividades y plazos'}
      accessibilityState={{ expanded: open }}
      onPress={() => {
        tick();
        organizeBar.toggleMenu();
      }}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Animated.View layout={reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING_SMOOTH.stiffness).damping(SPRING_SMOOTH.damping)} style={styles.pill}>
        <Ionicons name="options-outline" size={18} color={AppColors.textOnLight} />
        <ThemedText maxFontSizeMultiplier={MAX_SCALE} style={styles.pillText}>Organizar</ThemedText>
        <Animated.View style={chevronStyle}>
          <CustomIcon name="chevron-right" size={14} color={AppColors.textOnLight} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

type Tool = { key: string; label: string; icon: React.ReactNode; href: Href };

const ICON = AppColors.textSecondary;

/** What grows out of the pill: the aviso first (the most common), then the rest. */
export function OrganizeMenu() {
  const router = useRouter();
  const { canPost } = useOrganizeBar();

  const main: Tool[] = [
    ...(canPost ? [{ key: 'notice', label: 'Publicar un aviso', icon: <Ionicons name="megaphone-outline" size={22} color={ICON} />, href: { pathname: '/feed-post', params: { tag: ANNIVERSARY_TAG } } } as Tool] : []),
    { key: 'flash', label: 'Prueba flash', icon: <BoltIcon size={22} color={ICON} />, href: '/anniversary/flash' },
    { key: 'points', label: 'Sumar o descontar', icon: <Ionicons name="swap-vertical" size={22} color={ICON} />, href: '/anniversary/points' },
  ];
  const setup: Tool[] = [
    { key: 'activity', label: 'Nueva actividad', icon: <Ionicons name="add-circle-outline" size={22} color={ICON} />, href: '/anniversary/activity' },
    { key: 'deadline', label: 'Nuevo plazo', icon: <Ionicons name="alarm-outline" size={22} color={ICON} />, href: '/anniversary/deadline' },
    { key: 'leads', label: 'Jefes de alianza', icon: <CrownIcon size={22} color={ICON} />, href: '/anniversary/leads' },
    { key: 'setup', label: 'Alianzas y fechas', icon: <Ionicons name="color-palette-outline" size={22} color={ICON} />, href: '/anniversary/setup' },
  ];

  const row = (tool: Tool) => (
    <Pressable
      key={tool.key}
      accessibilityRole="menuitem"
      accessibilityLabel={tool.label}
      onPress={() => {
        tick();
        organizeBar.closeMenu();
        router.push(tool.href);
      }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.icon}>{tool.icon}</View>
      <ThemedText maxFontSizeMultiplier={MAX_SCALE} style={styles.rowText}>{tool.label}</ThemedText>
    </Pressable>
  );

  return (
    <View accessibilityRole="menu" style={styles.menu}>
      {main.map(row)}
      <View style={styles.separator} />
      {setup.map(row)}
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
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: AppSpacing.xs,
    marginHorizontal: AppSpacing.md + 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
});
