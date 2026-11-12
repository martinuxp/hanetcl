import { usePathname } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';

import { useSession } from '@/services/auth-service';

/** From this width the web swaps the floating bar for a side navigation (icons only). */
export const RAIL_MIN_WIDTH = 768;
/** From this width the side navigation also shows its labels. */
export const SIDEBAR_MIN_WIDTH = 1024;
export const RAIL_WIDTH = 84;
export const SIDEBAR_WIDTH = 248;

/**
 * Screens drawn without the side navigation: the way in (welcome pages,
 * sign-in, joining an institution) and the full-screen moments.
 */
const NO_SIDE_NAV_ROUTES = [
  '/onboarding', '/auth', '/verify-email', '/join-beta', '/link-institution',
  '/anniversary/welcome', '/tools/electividad/test', '/tools/electividad/reveal', '/event-checkin',
];

export type DesktopNav = 'bar' | 'rail' | 'sidebar';

/** How the window is laid out: the phone's floating bar, or a side navigation on a wide web window. */
export function useDesktopNav(): DesktopNav {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < RAIL_MIN_WIDTH) return 'bar';
  return width >= SIDEBAR_MIN_WIDTH ? 'sidebar' : 'rail';
}

/**
 * The side navigation on this screen, if any, and how wide it is. With one,
 * the floating bar only carries "Volver" and the section's action.
 */
export function useSideNav(): { nav: DesktopNav; width: number } {
  const nav = useDesktopNav();
  const pathname = usePathname();
  const { user } = useSession();
  if (nav === 'bar' || !user || NO_SIDE_NAV_ROUTES.includes(pathname)) return { nav: 'bar', width: 0 };
  return { nav, width: nav === 'sidebar' ? SIDEBAR_WIDTH : RAIL_WIDTH };
}

/**
 * The width the screens get: the window's, less the side navigation. Use it
 * where a screen sizes pages or carousels by the window, so that beside the
 * navigation they still fit the space they are drawn in.
 */
export function useContentWidth() {
  const { width } = useWindowDimensions();
  return width - useSideNav().width;
}
