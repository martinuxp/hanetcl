/**
 * The school subjects, shared by ClassHall and the course Calendar so that
 * "Matemáticas" is the same subject in both. A Hall and an event match when
 * their names resolve to the same id here.
 *
 * The backend keeps the same list in functions/subjects.js; change both.
 */
export type Subject = {
  id: string;
  name: string;
  /** Other names the same subject goes by, including older Calendar labels. */
  aliases: string[];
  /** Hall cover suggested when a teacher picks this subject. */
  theme: string;
};

export const SUBJECTS: Subject[] = [
  { id: 'lenguaje', name: 'Lenguaje y Literatura', aliases: ['Lengua y Literatura', 'Lenguaje', 'Lengua'], theme: 'writing' },
  { id: 'matematicas', name: 'Matemáticas', aliases: ['Matemática'], theme: 'math' },
  { id: 'ingles', name: 'Inglés', aliases: ['Idioma Extranjero: Inglés', 'Idioma Extranjero Inglés', 'English'], theme: 'english' },
  { id: 'historia', name: 'Historia, Geografía y Ciencias Sociales', aliases: ['Historia', 'Historia y Geografía'], theme: 'socialStudies' },
  { id: 'biologia', name: 'Biología', aliases: [], theme: 'biology' },
  { id: 'quimica', name: 'Química', aliases: [], theme: 'biology' },
  { id: 'fisica', name: 'Física', aliases: [], theme: 'physics' },
  { id: 'ciencias', name: 'Ciencias para la Ciudadanía', aliases: ['Ciencias Naturales', 'Ciencias'], theme: 'geography' },
  { id: 'ciudadania', name: 'Educación Ciudadana', aliases: [], theme: 'socialStudies' },
  { id: 'filosofia', name: 'Filosofía', aliases: [], theme: 'read' },
  { id: 'artes-visuales', name: 'Artes Visuales', aliases: ['Artes'], theme: 'hobby' },
  { id: 'musica', name: 'Música', aliases: ['Artes Musicales'], theme: 'hobby' },
  { id: 'tecnologia', name: 'Tecnología', aliases: [], theme: 'geometry' },
  { id: 'educacion-fisica', name: 'Educación Física y Salud', aliases: ['Educación Física'], theme: 'gameNight' },
  { id: 'religion', name: 'Religión', aliases: [], theme: 'read' },
  { id: 'orientacion', name: 'Orientación', aliases: ['Consejo de Curso'], theme: 'backToSchool' },
];

function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const BY_NAME = new Map<string, Subject>();
for (const subject of SUBJECTS) {
  for (const name of [subject.name, ...subject.aliases]) BY_NAME.set(normalize(name), subject);
}

/** The catalog subject a name refers to, or null for a subject outside it (an elective). */
export function findSubject(name: string | null | undefined): Subject | null {
  return name ? BY_NAME.get(normalize(name)) ?? null : null;
}

/** The catalog's name for that subject, or the name as written when it is not in the catalog. */
export function subjectName(name: string) {
  return findSubject(name)?.name ?? name;
}

/** Whether two names are the same subject. */
export function sameSubject(a: string | null | undefined, b: string | null | undefined) {
  const first = findSubject(a);
  const second = findSubject(b);
  if (first && second) return first.id === second.id;
  return !!a && !!b && normalize(a) === normalize(b);
}
