export const AppColors = {
  canvas: '#282829',
  surface: '#3C3B3E',
  surfaceMuted: '#504F53',
  surfaceRaised: '#4C5A6F',
  surfaceSoft: '#C7C6CF',
  textPrimary: '#F9F9FA',
  textSecondary: '#DDDDE2',
  textOnLight: '#282829',
  accent: '#EF2274',
  // The accent is too dark for small text; these keep error messages legible.
  errorText: '#FF8DB5',
  errorTextOnLight: '#B0124F',
  primary: '#4C5A6F',
  primaryStrong: '#262D37',
  controlContainer: '#3C3B3E',
  controlActive: '#C7C6CF',
  controlOnActive: '#282829',
  neutral2: '#E9E8EC',
  neutral3: '#DDDDE2',
  neutral5: '#C7C6CF',
  neutral8: '#504F53',
  neutral85: '#3C3B3E',
  neutral9: '#282829',
  neutral05: '#F9F9FA',
  success: '#4C5A6F',
  info: '#4C5A6F',
  dangerSurface: '#262D37',
  warning: '#EF2274',
  danger: '#262D37',
  neutral: '#504F53',
  // Accents of HaNet Eventos (Figma "Accents/Mint" and "Accents/Yellow"): perks and featured lines.
  accentMint: '#00C8B3',
  accentYellow: '#FFCC00',
} as const;

export const AppSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const AppRadii = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const AppTouch = {
  minimum: 44,
  comfortable: 48,
} as const;

/**
 * Type scale (DM Sans). Tracking depends on size, as in the Figma file:
 * large text is pulled in (about -4 to -5 %), small text sits near 0, and
 * leading tightens as size grows. Use these instead of one-off values.
 */
export const AppType = {
  largeTitle: { fontFamily: 'DMSans_500Medium', fontSize: 34, lineHeight: 41, letterSpacing: -1.7 },
  title1: { fontFamily: 'DMSans_700Bold', fontSize: 28, lineHeight: 34, letterSpacing: -1.1 },
  title2: { fontFamily: 'DMSans_700Bold', fontSize: 24, lineHeight: 29, letterSpacing: -1.08 },
  title3: { fontFamily: 'DMSans_700Bold', fontSize: 20, lineHeight: 26, letterSpacing: -0.8 },
  headline: { fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 20, letterSpacing: -0.4 },
  body: { fontFamily: 'DMSans_400Regular', fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  callout: { fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  footnote: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  caption: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 16, letterSpacing: 0 },
} as const;

/**
 * Google Sans Flex, for big expressive text (the Aniversario's titles and
 * scores). React Native can't move a variable font's axes, so these are
 * fixed cuts: `ramp` goes from narrow and light to wide and black, and
 * `FlexText` steps through it to animate weight and width together.
 */
export const AppFlexFonts = {
  ramp: [
    'GoogleSansFlex_300Light_ExtraCondensed',
    'GoogleSansFlex_500Medium_Condensed',
    'GoogleSansFlex_700Bold',
    'GoogleSansFlex_800ExtraBold_Expanded',
    'GoogleSansFlex_900Black_ExtraExpanded',
  ],
  wide: 'GoogleSansFlex_900Black_ExtraExpanded',
  numbers: 'GoogleSansFlex_900Black_Condensed',
  name: 'GoogleSansFlex_700Bold_SemiExpanded',
} as const;

/** Display sizes in Google Sans Flex. Wide cuts need less negative tracking. */
export const AppDisplay = {
  hero: { fontFamily: AppFlexFonts.wide, fontSize: 40, lineHeight: 42, letterSpacing: -1.2 },
  title: { fontFamily: AppFlexFonts.wide, fontSize: 24, lineHeight: 28, letterSpacing: -0.6 },
  section: { fontFamily: AppFlexFonts.name, fontSize: 20, lineHeight: 24, letterSpacing: -0.4 },
  name: { fontFamily: AppFlexFonts.name, fontSize: 17, lineHeight: 21, letterSpacing: -0.3 },
  number: { fontFamily: AppFlexFonts.numbers, fontSize: 56, lineHeight: 58, letterSpacing: -1.5 },
  score: { fontFamily: AppFlexFonts.numbers, fontSize: 24, lineHeight: 28, letterSpacing: -0.5 },
} as const;

/** Press feedback shared by every tappable surface: a light dip and press-in. */
export const AppPressed = { opacity: 0.84, transform: [{ scale: 0.97 }] } as const;
