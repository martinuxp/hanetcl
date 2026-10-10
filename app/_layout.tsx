import { useEffect } from 'react';
import { Platform } from 'react-native';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider, MD3DarkTheme, configureFonts } from 'react-native-paper';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';

import { GlobalTabBar } from '@/components/AppTabBar';
import { AppColors } from '@/constants/design-tokens';
import { useSession } from '@/services/auth-service';


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
  const { initializing } = useSession();

  const [loaded, error] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if ((loaded || error) && !initializing) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error, initializing]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={paperTheme}>
        <ThemeProvider value={navigationTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="verify-email" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="join-beta" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="link-institution" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="hnt-admin" options={{ headerShown: false }} />
            <Stack.Screen name="event-detail" options={{ headerShown: false }} />
            <Stack.Screen name="ui-showcase" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            <Stack.Screen name="create-event" options={sheetOptions([0.5, 1.0])} />
            <Stack.Screen name="edit-profile" options={sheetOptions([0.75, 1.0])} />
            <Stack.Screen name="event-info" options={{ headerShown: false }} />
            <Stack.Screen name="classhall/index" options={{ headerShown: false }} />
            <Stack.Screen name="classhall/join" options={sheetOptions([0.75, 1.0])} />
            <Stack.Screen name="classhall/create" options={sheetOptions([0.75, 1.0])} />
          </Stack>
          <GlobalTabBar />
          <StatusBar style="light" />
        </ThemeProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
