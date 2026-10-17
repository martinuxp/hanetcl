import { Tabs } from 'expo-router';
import React from 'react';

// The bar is drawn once by the root layout (GlobalTabBar), not by the tabs.
const noTabBar = () => null;

export default function TabLayout() {
  return (
    <Tabs
      tabBar={noTabBar}
      screenOptions={{
        lazy: true,
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home' }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Profile' }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', href: null }}
      />
      <Tabs.Screen
        name="events"
        options={{ title: 'Eventos', href: null }}
      />
      <Tabs.Screen
        name="feed"
        options={{ title: 'Feed', href: null }}
      />
    </Tabs>
  );
}
