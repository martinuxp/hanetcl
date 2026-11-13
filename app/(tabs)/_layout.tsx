import { Tabs } from 'expo-router';
import React from 'react';
import { useQuickActions } from '@/components/quick-actions';
import { t } from '@/i18n';

// The bar is drawn once by the root layout (GlobalTabBar), not by the tabs.
// No `href: null` here: since expo-router 58 a hidden tab redirects to Home
// when it is opened, and these screens are opened from Home's grid.
const noTabBar = () => null;

export default function TabLayout() {
  // Inside the navigator: a shortcut from the app's icon opens its screen.
  useQuickActions();
  return (
    <Tabs
      tabBar={noTabBar}
      screenOptions={{
        lazy: true,
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('layout.inicio') }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: t('layout.perfil') }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar' }}
      />
      <Tabs.Screen
        name="events"
        options={{ title: t('layout.eventos') }}
      />
      <Tabs.Screen
        name="feed"
        options={{ title: t('layout.feed') }}
      />
    </Tabs>
  );
}
