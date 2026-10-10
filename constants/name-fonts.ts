import { Caveat_700Bold } from '@expo-google-fonts/caveat/700Bold';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { SpaceMono_700Bold } from '@expo-google-fonts/space-mono/700Bold';
import { Unbounded_700Bold } from '@expo-google-fonts/unbounded/700Bold';

// Typefaces a person can pick for the name on their profile. Each one is
// imported from its own weight folder so only that file ends up in the app.
// The ids are stored in the account and validated by the backend: keep them
// in step with NAME_FONTS in functions/profile.js.
export const NAME_FONTS = [
  // DM Sans is the app's own typeface and is already loaded at startup.
  { id: 'dm-sans', label: 'Clásica', fontFamily: 'DMSans_500Medium', source: null, scale: 1, letterSpacing: -1.7 },
  { id: 'fraunces', label: 'Editorial', fontFamily: 'Fraunces_600SemiBold', source: Fraunces_600SemiBold, scale: 1, letterSpacing: -1.2 },
  { id: 'unbounded', label: 'Impacto', fontFamily: 'Unbounded_700Bold', source: Unbounded_700Bold, scale: 0.78, letterSpacing: -1.4 },
  { id: 'space-mono', label: 'Técnica', fontFamily: 'SpaceMono_700Bold', source: SpaceMono_700Bold, scale: 0.84, letterSpacing: -1.6 },
  { id: 'caveat', label: 'A mano', fontFamily: 'Caveat_700Bold', source: Caveat_700Bold, scale: 1.22, letterSpacing: -0.4 },
] as const;

export type NameFontId = (typeof NAME_FONTS)[number]['id'];

export const DEFAULT_NAME_FONT: NameFontId = 'dm-sans';

export function getNameFont(id: string | null | undefined) {
  return NAME_FONTS.find(font => font.id === id) ?? NAME_FONTS[0];
}
