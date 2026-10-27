import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { DarkTheme, Stack, ThemeProvider, usePathname, useRootNavigationState, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider, MD3DarkTheme, configureFonts } from 'react-native-paper';
import { useFonts, DMSans_300Light, DMSans_400Regular, DMSans_400Regular_Italic, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, DMSans_700Bold_Italic } from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';

import { GlobalTabBar } from '@/components/AppTabBar';
import { LaunchSplash } from '@/components/LaunchSplash';
import { AppErrorLayer, FatalBoundary } from '@/components/errors/AppErrorLayer';
import { AppColors } from '@/constants/design-tokens';
import { useSession } from '@/services/auth-service';
import { useLaunchContentReady } from '@/services/launch-ready';
import { hasSeenOnboarding, markOnboardingSeen } from '@/services/onboarding';
import { listenToNotificationTaps, registerDevice } from '@/services/push-service';
import { refreshDayWidgets } from '@/services/day-sync';

// The only screens reachable without an account. Everyone starts at the
// onboarding, and signing out goes back to it.
const PUBLIC_ROUTES = ['/onboarding', '/auth'];

// The splash waits for Home's content, but never longer than this from
// launch: a slow or missing network still gets into the app.
const LAUNCH_WAIT_CAP_MS = 3000;


export const unstable_settings = {
  anchor: '(tabs)',
};

// Prevent auto-hide until fonts load
SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: AppColors.accent,
    background: AppColors.canvas,
    card: AppColors.surface,
    text: AppColors.textPrimary,
    border: AppColors.surfaceMuted,
    notification: AppColors.accent,
  },
};

const paperTheme = {
  ...MD3DarkTheme,
  roundness: 16,
  fonts: configureFonts({ config: { fontFamily: 'DMSans_400Regular' } }),
  colors: {
    ...MD3DarkTheme.colors,
    primary: AppColors.accent,
    onPrimary: AppColors.textPrimary,
    primaryContainer: AppColors.surfaceRaised,
    onPrimaryContainer: AppColors.textPrimary,
    secondary: AppColors.controlActive,
    onSecondary: AppColors.controlOnActive,
    secondaryContainer: AppColors.surfaceMuted,
    onSecondaryContainer: AppColors.textPrimary,
    background: AppColors.canvas,
    onBackground: AppColors.textPrimary,
    surface: AppColors.surface,
    onSurface: AppColors.textPrimary,
    surfaceVariant: AppColors.surfaceMuted,
    onSurfaceVariant: AppColors.textSecondary,
    outline: AppColors.surfaceMuted,
    error: AppColors.accent,
    onError: AppColors.textPrimary,
  },
};

// Android's form sheet (react-native-screens 4.26) can open with no height,
// leaving an invisible sheet that still takes touches, so there these screens
// are transparent modals that draw their own sheet (see sheet-frame.tsx).
function sheetOptions(detents: number[]) {
  if (Platform.OS === 'android') {
    return { presentation: 'transparentModal', headerShown: false, animation: 'fade' } as const;
  }
  return { presentation: 'formSheet', headerShown: false, sheetGrabberVisible: true, sheetAllowedDetents: detents } as const;
}

export default function RootLayout() {
  const { user, initializing } = useSession();
  const router = useRouter();
  const navigationReady = !!useRootNavigationState()?.key;
  // Whether the screen under the launch splash is the right one yet: signed
  // out on a device that never saw the welcome pages goes to them first.
  const [routed, setRouted] = useState(false);
  // A device that has opened HaNet before only gets a short splash.
  const [returning, setReturning] = useState(false);
  // Signed in, the splash also waits for Home to have its content.
  const contentReady = useLaunchContentReady();
  const [waitedEnough, setWaitedEnough] = useState(false);
  const [signedInAtLaunch, setSignedInAtLaunch] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedEnough(true), LAUNCH_WAIT_CAP_MS);
    return () => clearTimeout(timer);
  }, []);

  const [loaded, error] = useFonts({
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    // Italics of the feed's Markdown.
    DMSans_400Regular_Italic,
    DMSans_700Bold_Italic,
  });

  // The native splash only covers the font load; HaNet's own splash takes
  // over while the session is restored.
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  useEffect(() => {
    if (initializing || routed || !navigationReady) return;
    let active = true;
    (async () => {
      const seen = await hasSeenOnboarding();
      if (!active) return;
      if (!user) router.replace('/onboarding');
      // Signed in already means past the welcome pages.
      if (user && !seen) void markOnboardingSeen();
      setReturning(seen);
      setSignedInAtLaunch(!!user);
      setRouted(true);
    })();
    return () => { active = false; };
  }, [initializing, navigationReady, routed, router, user]);

  // Push notifications: the device registers with the account (when the person
  // already allowed them), and a tapped notification opens its screen.
  useEffect(() => {
    if (!user || !routed || !navigationReady) return;
    void registerDevice();
    return listenToNotificationTaps(url => router.push(url as Href));
  }, [navigationReady, routed, router, user]);

  // The widget, the evaluation reminders and the Live Activity follow the
  // course's timetable and Calendar: refreshed on opening and on coming back.
  useEffect(() => {
    if (!user || !routed) return;
    void refreshDayWidgets(user);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshDayWidgets(user);
    });
    return () => subscription.remove();
  }, [routed, user]);

  // Without an account nothing but the onboarding and sign-in is open: losing
  // the session anywhere (signing out, an expired account) lands on the
  // onboarding.
  const pathname = usePathname();
  useEffect(() => {
    if (initializing || !routed || !navigationReady || user) return;
    if (!PUBLIC_ROUTES.includes(pathname)) router.replace('/onboarding');
  }, [initializing, navigationReady, pathname, routed, router, user]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={paperTheme}>
        <ThemeProvider value={navigationTheme}>
          <FatalBoundary>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="verify-email" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="join-beta" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="link-institution" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="hnt-admin" options={{ headerShown: false }} />
            <Stack.Screen name="event-detail" options={{ headerShown: false }} />
            <Stack.Screen name="event-form" options={sheetOptions([1.0])} />
            <Stack.Screen name="event-options" options={sheetOptions([0.5])} />
            <Stack.Screen name="event-checkin" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="schedule" options={{ headerShown: false }} />
            <Stack.Screen name="feed-post" options={sheetOptions([1.0])} />
            <Stack.Screen name="ui-showcase" options={{ headerShown: false }} />
            <Stack.Screen name="create-event" options={sheetOptions([0.5, 1.0])} />
            <Stack.Screen name="edit-profile" options={sheetOptions([0.75, 1.0])} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="licenses" options={{ headerShown: false }} />
            <Stack.Screen name="whats-new" options={{ headerShown: false }} />
            <Stack.Screen name="event-info" options={{ headerShown: false }} />
            <Stack.Screen name="anniversary/index" options={{ headerShown: false }} />
            <Stack.Screen name="anniversary/setup" options={sheetOptions([1.0])} />
            <Stack.Screen name="anniversary/activity" options={sheetOptions([1.0])} />
            <Stack.Screen name="anniversary/result" options={sheetOptions([0.75, 1.0])} />
            <Stack.Screen name="anniversary/points" options={sheetOptions([0.75, 1.0])} />
            <Stack.Screen name="anniversary/deadline" options={sheetOptions([0.75, 1.0])} />
            <Stack.Screen name="anniversary/flash" options={sheetOptions([1.0])} />
            <Stack.Screen name="anniversary/leads" options={sheetOptions([0.75, 1.0])} />
            <Stack.Screen name="classhall/index" options={{ headerShown: false }} />
            <Stack.Screen name="classhall/join" options={sheetOptions([0.75, 1.0])} />
            <Stack.Screen name="classhall/create" options={sheetOptions([0.75, 1.0])} />
            <Stack.Screen name="classhall/hall" options={{ headerShown: false }} />
            <Stack.Screen name="classhall/evaluation" options={{ headerShown: false }} />
            <Stack.Screen name="classhall/announce" options={sheetOptions([0.75, 1.0])} />
            <Stack.Screen name="classhall/evaluation-new" options={sheetOptions([0.5])} />
            <Stack.Screen name="classhall/evaluation-form" options={sheetOptions([1.0])} />
            <Stack.Screen name="classhall/tasks" options={{ headerShown: false }} />
            <Stack.Screen name="classhall/task" options={{ headerShown: false }} />
            <Stack.Screen name="classhall/task-form" options={sheetOptions([1.0])} />
            <Stack.Screen name="classhall/submit" options={sheetOptions([0.85, 1.0])} />
            <Stack.Screen name="classhall/submission" options={sheetOptions([0.75, 1.0])} />
          </Stack>
          <GlobalTabBar />
          </FatalBoundary>
          <StatusBar style="light" />
          <LaunchSplash ready={routed && (!signedInAtLaunch || contentReady || waitedEnough)} quick={returning} />
          <AppErrorLayer />
        </ThemeProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
