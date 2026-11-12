import type Ionicons from '@expo/vector-icons/Ionicons';
import type React from 'react';

export type SubjectIconName = React.ComponentProps<typeof Ionicons>['name'];

// Matched by the start of the subject's name in the shared catalog
// (constants/subjects.ts), so a renamed or new subject still finds its icon.
const SUBJECT_ICONS: [string[], SubjectIconName][] = [
  [['matem'], 'calculator-outline'], // i18n-ignore
  [['lengua', 'literatura', 'lectura'], 'book-outline'], // i18n-ignore
  [['historia', 'geograf', 'ciudadan', 'filosof'], 'library-outline'], // i18n-ignore
  [['biolog', 'químic', 'quimic', 'físic', 'fisic', 'ciencia'], 'flask-outline'], // i18n-ignore
  [['inglés', 'ingles', 'idioma'], 'language-outline'], // i18n-ignore
  [['educación física', 'educacion fisica', 'deporte'], 'football-outline'], // i18n-ignore
  [['música', 'musica'], 'musical-notes-outline'], // i18n-ignore
  [['arte', 'visual'], 'color-palette-outline'], // i18n-ignore
  [['tecnolog', 'program'], 'hardware-chip-outline'], // i18n-ignore
  [['orientaci', 'religi', 'consejo'], 'people-outline'], // i18n-ignore
];

/** An Ionicons name for a class, by its subject; a school when none fits. */
export function subjectIcon(subject: string): SubjectIconName {
  const name = subject.toLocaleLowerCase('es');
  return SUBJECT_ICONS.find(([keys]) => keys.some(key => name.includes(key)))?.[1] ?? 'school-outline';
}
