import AsyncStorage from '@react-native-async-storage/async-storage';

const SEEN_KEY = 'hanet.onboardingSeen';

/** Whether this device already went through the welcome pages. */
export async function hasSeenOnboarding() {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === '1';
  } catch {
    // Storage unavailable: better to skip the pages than to show them every time.
    return true;
  }
}

export async function markOnboardingSeen() {
  try {
    await AsyncStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Not remembering it only means the pages show again next time.
  }
}
