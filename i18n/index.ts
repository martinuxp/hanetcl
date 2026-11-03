// Interface texts. Spanish (es.json) is the source: it holds the app's text
// exactly as people read it, and every other language is a translation of it.
//
// Use t('area.key') for anything shown to people, with the values by name:
//   t('settings.queCambioEnAppversionlabel', { appVersionLabel })  ->  "Qué cambió en {{appVersionLabel}}"
// and `count` for plurals (key_one / key_other in the catalog):
//   t('classhall.hall.countEstudiantes', { count })  ->  "1 estudiante" / "5 estudiantes"
// `npm run i18n:check` lists texts still written in the code and
// `npm run i18n:extract` moves them here. How to add a language: i18n/README.md.
import i18next from 'i18next';

import es from './locales/es.json';

export const SOURCE_LANGUAGE = 'es';

// Each language with its own name and the locale for dates and numbers.
export const LANGUAGES = {
  es: { name: 'Español', locale: 'es-CL' },
} as const;

export type Language = keyof typeof LANGUAGES;

export const resources = {
  es: { translation: es },
} as const;

// The catalog ships with the app, so it loads at once: texts at the top of a
// module (lists of options, labels) already read in the right language.
// Changing the language reloads the app for the same reason.
void i18next.init({
  lng: SOURCE_LANGUAGE,
  fallbackLng: SOURCE_LANGUAGE,
  supportedLngs: Object.keys(LANGUAGES),
  resources,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const i18n = i18next;
export const t = i18next.t.bind(i18next);

/** The current language, among the ones the app has. */
export function currentLanguage(): Language {
  const lng = i18next.resolvedLanguage ?? i18next.language;
  return (lng in LANGUAGES ? lng : SOURCE_LANGUAGE) as Language;
}

/** The locale for dates and numbers in the current language ("es-CL"). */
export function dateLocale() {
  return LANGUAGES[currentLanguage()].locale;
}

/** A list from the catalog, such as dates.months. */
export function tList(key: string): string[] {
  const value = (i18next.t as (key: string, options: object) => unknown)(key, { returnObjects: true });
  if (Array.isArray(value)) return value.map(String);
  return value && typeof value === 'object' ? Object.values(value).map(String) : [];
}

// Dates. The catalog keeps each name as it goes mid-sentence ("3 de marzo");
// capitalize() is for where it starts a line. Days go from Sunday, as getDay().
export const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase(dateLocale()) + text.slice(1);
export const months = () => tList('dates.months');
export const monthsShort = () => tList('dates.monthsShort');
export const weekdays = () => tList('dates.weekdays');
export const weekdaysShort = () => tList('dates.weekdaysShort');
/** One letter per day, from Monday, for the headers of month grids. */
export const weekdayLetters = () => tList('dates.weekdayLetters');
