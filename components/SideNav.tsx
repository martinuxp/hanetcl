import { usePathname, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { CalendarDaysIcon } from '@/assets/animated-icons/calendar';
import { GraduationCapIcon } from '@/assets/animated-icons/graduation-cap';
import { MessageCircleIcon } from '@/assets/animated-icons/message-circle';
import { SparklesIcon } from '@/assets/animated-icons/sparks';
import { HammerIcon, TrophyIcon } from '@/assets/animated-icons/trophy';
import { HanetLogo } from '@/components/AppTabBar';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AppColors } from '@/constants/design-tokens';
import { SHEET_DETENTS } from '@/constants/sheets';
import { useSideNav } from '@/hooks/use-desktop-layout';
import { t } from '@/i18n';
import { useRole } from '@/services/auth-service';

type NavIcon = React.ComponentType<{ size?: number; color?: string; animated?: boolean }>;

type NavItem = {
  key: string;
  label: string;
  href: Href;
  Icon: NavIcon;
  /** The screens that belong to this section, to mark it while one is open. */
  match: (pathname: string) => boolean;
};

const startsWith = (...prefixes: string[]) => (pathname: string) => prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));

// Home's two plain icons, sized like the animated ones.
const HomeIcon: NavIcon = ({ size = 22, color }) => <CustomIcon name="home" size={size} color={color} />;
const ProfileIcon: NavIcon = ({ size = 22, color }) => <CustomIcon name="user" size={size} color={color} />;
const SettingsIcon: NavIcon = ({ size = 22, color }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    <Path d="M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke={color} strokeWidth={1.6} />
  </Svg>
);
const PanelIcon: NavIcon = ({ size = 22, color }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
  </Svg>
);

// The sections, in the order of Home's grid.
const MAIN_ITEMS: NavItem[] = [
  { key: 'home', label: t('layout.inicio'), href: '/', Icon: HomeIcon, match: pathname => pathname === '/' },
  { key: 'calendar', label: t('components.gridMenu.calendario'), href: '/calendar', Icon: CalendarDaysIcon, match: startsWith('/calendar', '/event-info', '/schedule') },
  { key: 'classhall', label: 'ClassHall', href: '/classhall', Icon: GraduationCapIcon, match: startsWith('/classhall', '/share') },
  { key: 'events', label: t('layout.eventos'), href: '/events', Icon: SparklesIcon, match: startsWith('/events', '/event-detail') },
  { key: 'feed', label: t('layout.feed'), href: '/feed', Icon: MessageCircleIcon, match: startsWith('/feed') },
  { key: 'anniversary', label: t('common.aniversario'), href: '/anniversary', Icon: TrophyIcon, match: startsWith('/anniversary') },
  { key: 'tools', label: t('common.herramientas'), href: '/tools', Icon: HammerIcon, match: startsWith('/tools') },
];

const PROFILE_ITEMS: NavItem[] = [
  { key: 'profile', label: t('layout.perfil'), href: '/explore', Icon: ProfileIcon, match: startsWith('/explore') },
  { key: 'settings', label: t('common.configuraciones'), href: '/settings', Icon: SettingsIcon, match: startsWith('/settings', '/licenses', '/whats-new') },
];

const PANEL_ITEM: NavItem = { key: 'hnt', label: t('index.panelHnt'), href: '/hnt-admin', Icon: PanelIcon, match: startsWith('/hnt-admin') };

function NavButton({ item, active, labeled, onPress }: { item: NavItem; active: boolean; labeled: boolean; onPress: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  const color = active ? AppColors.controlOnActive : AppColors.textSecondary;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        styles.item,
        !labeled && styles.itemRail,
        hovered && !active && styles.itemHovered,
        active && styles.itemActive,
        focused && !active && styles.itemFocused,
        pressed && styles.itemPressed,
      ]}
    >
      <View style={styles.iconBox}>
        <item.Icon size={22} color={color} animated={hovered && !active} />
      </View>
      {labeled && (
        <ThemedText numberOfLines={1} style={[styles.label, active && styles.labelActive]}>{item.label}</ThemedText>
      )}
    </Pressable>
  );
}

/** HaNet's isotype alone, for the narrow navigation. */
function HanetMark() {
  return (
    <Svg width="20" height="29" viewBox="0 0 20 29" fill="none">
      <Path d="M0 0L6.87688 6.43605V13.1403L10.3153 13.5425V8.98366L19.3082 9.78816V19.1741L10.3153 19.9786V15.4197L6.87688 15.822V22.5262L0 28.9622V0Z" fill={AppColors.accent} />
    </Svg>
  );
}

/**
 * The navigation of a wide web window, in place of the phone's floating bar:
 * every section of Home's grid, then Profile and Settings at the foot. From
 * 1024 px it shows its labels; narrower, only the icons.
 */
export function SideNav() {
  const router = useRouter();
  const pathname = usePathname();
  const isHnt = useRole() === 'HNT';
  const { nav, width } = useSideNav();
  if (width === 0) return null;

  const labeled = nav === 'sidebar';
  const mainItems = isHnt ? [...MAIN_ITEMS, PANEL_ITEM] : MAIN_ITEMS;
  // A sheet is open over the content: the navigation dims with it, and a
  // click on it closes the sheet as the backdrop does.
  const sheetOpen = !!SHEET_DETENTS[pathname.replace(/^\//, '')];

  // Each section opens as the first screen over Home, as from Home's grid.
  const go = (item: NavItem) => {
    if (pathname === item.href) return;
    if (router.canDismiss()) router.dismissAll();
    router.navigate(item.href);
  };

  const renderItem = (item: NavItem) => (
    <NavButton key={item.key} item={item} labeled={labeled} active={item.match(pathname)} onPress={() => go(item)} />
  );

  return (
    <View style={[styles.root, { width }]} accessibilityRole="navigation">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('layout.inicio')}
        onPress={() => go(MAIN_ITEMS[0])}
        style={[styles.logo, !labeled && styles.logoRail]}
      >
        {labeled ? <HanetLogo /> : <HanetMark />}
      </Pressable>
      <View style={styles.group}>{mainItems.map(renderItem)}</View>
      <View style={styles.foot}>
        <View style={styles.group}>{PROFILE_ITEMS.map(renderItem)}</View>
      </View>
      {sheetOpen && (
        <Animated.View entering={FadeIn.duration(280)} exiting={FadeOut.duration(220)} style={styles.dim}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.cerrar')} onPress={() => router.back()} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: '100%',
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 20,
    backgroundColor: AppColors.canvas,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255, 255, 255, 0.12)',
  },
  logo: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 22,
    borderRadius: 999,
  },
  logoRail: {
    alignSelf: 'center',
    paddingHorizontal: 8,
  },
  group: {
    gap: 4,
  },
  foot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  item: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 999,
    outlineStyle: 'none' as any,
  },
  itemRail: {
    width: 56,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  itemHovered: {
    backgroundColor: AppColors.surface,
  },
  itemActive: {
    backgroundColor: AppColors.controlActive,
  },
  itemFocused: {
    borderWidth: 1,
    borderColor: AppColors.accent,
  },
  itemPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  iconBox: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    color: AppColors.textSecondary,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  labelActive: {
    color: AppColors.controlOnActive,
    fontFamily: 'DMSans_700Bold',
  },
  dim: {
    ...StyleSheet.absoluteFill,
    // Over the border too, so the dimming meets the content's.
    right: -1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
});
