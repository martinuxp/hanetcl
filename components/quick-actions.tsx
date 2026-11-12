import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { t } from '@/i18n';

// Pressing and holding HaNet's icon on the phone: Calendar, ClassHall,
// Eventos and Notificaciones, the same four as the web app's manifest
// shortcuts (public/manifest.webmanifest). iOS draws SF Symbols; Android
// uses the icons the expo-quick-actions plugin adds from assets/shortcuts/.
// Expo Go and the web don't have the native module and simply skip this.

const ITEMS = [
  { id: 'calendar', title: () => 'Calendar', ios: 'symbol:calendar', href: '/calendar' },
  { id: 'classhall', title: () => 'ClassHall', ios: 'symbol:graduationcap', href: '/classhall' },
  { id: 'events', title: () => t('layout.eventos'), ios: 'symbol:sparkles', href: '/events' },
  { id: 'notifications', title: () => t('components.notifications.notificationsPanel.notificaciones'), ios: 'symbol:bell', href: '/?abrir=notificaciones' },
];

/** Registers the shortcuts and opens the screen of the one that was used. */
export function useQuickActions() {
  useQuickActionRouting();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void QuickActions.setItems(ITEMS.map(item => ({
      id: item.id,
      title: item.title(),
      icon: Platform.OS === 'ios' ? item.ios : item.id,
      params: { href: item.href },
    }))).catch(() => undefined);
  }, []);
}
