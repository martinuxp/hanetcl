import { NAME_FONTS } from '@/constants/name-fonts';
import * as Font from 'expo-font';
import { useEffect, useState } from 'react';

/**
 * Loads the profile-name typefaces on demand, so they do not slow down app
 * start. Returns true once they can be used; until then callers should fall
 * back to the default typeface.
 */
export function useNameFonts() {
  const [ready, setReady] = useState(() => NAME_FONTS.every(font => !font.source || Font.isLoaded(font.fontFamily)));

  useEffect(() => {
    if (ready) return;
    let active = true;
    const pending: Record<string, Font.FontSource> = {};
    for (const font of NAME_FONTS) {
      if (font.source && !Font.isLoaded(font.fontFamily)) pending[font.fontFamily] = font.source;
    }
    Font.loadAsync(pending)
      .then(() => { if (active) setReady(true); })
      // Without the fonts the name still shows, in the default typeface.
      .catch(() => undefined);
    return () => { active = false; };
  }, [ready]);

  return ready;
}
