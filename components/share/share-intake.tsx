import { setSharedFile } from '@/services/share-intake';
import { isRunningInExpoGo } from 'expo';
import { useRouter } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';
import { useEffect } from 'react';
import { Platform } from 'react-native';

// Native builds only: Expo Go has no share extension and the web no share sheet.
const SUPPORTED = Platform.OS !== 'web' && !isRunningInExpoGo();

/**
 * Receives what another app shares to HaNet and opens the share screen once
 * the app is signed in and routed. Lives in the root layout.
 */
export function ShareIntake({ ready }: { ready: boolean }) {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({ disabled: !SUPPORTED, resetOnBackground: true });

  useEffect(() => {
    if (!ready || !hasShareIntent) return;
    const file = shareIntent.files?.[0];
    if (file) {
      setSharedFile({ path: file.path, fileName: file.fileName ?? null, mimeType: file.mimeType ?? null, size: file.size ?? null });
      router.push('/share');
    }
    resetShareIntent();
  }, [hasShareIntent, ready, resetShareIntent, router, shareIntent]);

  return null;
}
