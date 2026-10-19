import { requireOptionalNativeModule } from 'expo';

/**
 * Alternate app icons (expo-alternate-app-icons). The native part only exists
 * in a build of HaNet made after the icons were added: Expo Go and the web
 * don't have it, so there the picker only shows them.
 *
 * The module is read directly instead of importing the package, whose entry
 * throws when the native part is missing.
 */
type AlternateIconsModule = {
  supportsAlternateIcons: boolean;
  getAppIconName(): string | null;
  setAlternateAppIcon(name: string | null): Promise<string | null>;
};

const native = requireOptionalNativeModule<AlternateIconsModule>('ExpoAlternateAppIcons');

/** `null` is the main icon. The others match the names in app.json. */
export type AppIconId = null | 'Simple' | 'ComicSans' | 'TestFlight';

export const APP_ICONS: { id: AppIconId; label: string; preview: number }[] = [
  { id: null, label: 'Fractal', preview: require('@/assets/app-icons/preview/fractal.png') },
  { id: 'Simple', label: 'Simple', preview: require('@/assets/app-icons/preview/simple.png') },
  { id: 'ComicSans', label: 'Comic Sans', preview: require('@/assets/app-icons/preview/comic-sans.png') },
  { id: 'TestFlight', label: 'TestFlight', preview: require('@/assets/app-icons/preview/testflight.png') },
];

export function canChangeAppIcon() {
  return !!native?.supportsAlternateIcons;
}

export function currentAppIcon(): AppIconId {
  if (!canChangeAppIcon()) return null;
  try {
    return (native!.getAppIconName() as AppIconId) ?? null;
  } catch {
    return null;
  }
}

export async function setAppIcon(id: AppIconId) {
  if (!native) throw new Error('alternate-icons-unavailable');
  await native.setAlternateAppIcon(id);
}
