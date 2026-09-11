import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider, MD3DarkTheme, MD3LightTheme, configureFonts } from 'react-native-paper';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/services/auth-service';


export const unstable_settings = {
  anchor: '(tabs)',
};

// Prevent auto-hide until fonts load
SplashScreen.preventAutoHideAsync();

const fontConfig = {
  fontFamily: 'DMSans_400Regular',
};


export default function RootLayout() {
  const colorScheme = useColorScheme();
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

  const baseTheme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  const paperTheme = {
    ...baseTheme,
    fonts: configureFonts({ config: fontConfig }),
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={paperTheme}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="verify" options={{ headerShown: false }} />
            <Stack.Screen name="event-detail" options={{ headerShown: false }} />
            <Stack.Screen name="ui-showcase" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            <Stack.Screen 
              name="create-event" 
              options={{ 
                presentation: 'formSheet', 
                headerShown: false,
                sheetGrabberVisible: true,
                sheetAllowedDetents: [0.5, 1.0]
              }} 
            />
            <Stack.Screen 
              name="event-info" 
              options={{ 
                presentation: 'formSheet', 
                headerShown: false,
                sheetGrabberVisible: true,
                sheetAllowedDetents: [0.5, 1.0]
              }} 
            />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
