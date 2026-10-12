/**
 * The school subjects, shared by ClassHall and the course Calendar so that
 * "Matemáticas" is the same subject in both. A Hall and an event match when
 * their names resolve to the same id here.
 *
 * The backend keeps the same list in functions/subjects.js; change both.
 */
/**
 * How a Hall gathers its students, after the plan de estudios:
 * - comun: Plan común (formación general). Every account of the course is in it.
 * - electivo: Formación general electiva (3° y 4° medio). Students of several
 *   courses pick one, so they join with the code.
 * - dominio: Plan diferenciado, the "dominios" (asignaturas de profundización).
 *   Also mixes courses and joins with the code.
 */
export type HallPlan = 'comun' | 'electivo' | 'dominio';

export const HALL_PLANS: { value: HallPlan; label: string; hint: string }[] = [
  { value: 'comun', label: 'Plan común', hint: 'Todo el curso entra solo, sin código.' },
  { value: 'electivo', label: 'Electivo', hint: 'Formación general electiva. Se unen con el código, aunque sean de otros cursos.' },
  { value: 'dominio', label: 'Dominio', hint: 'Plan diferenciado. Se unen con el código, aunque sean de otros cursos.' },
];

export type Subject = {
  id: string;
  name: string;
  /** Other names the same subject goes by, including older Calendar labels. */
  aliases: string[];
  /** Hall cover suggested when a teacher picks this subject. */
  theme: string;
  /** Kinds of Hall it is taught as. */
  plans: HallPlan[];
  /** Area of a dominio (A: humanidades, B: matemática y ciencias, C: artes y educación física). */
  area?: 'A' | 'B' | 'C';
};

export const SUBJECTS: Subject[] = [
  { id: 'lenguaje', name: 'Lenguaje y Literatura', aliases: ['Lengua y Literatura', 'Lenguaje', 'Lengua'], theme: 'writing', plans: ['comun'] },
  { id: 'matematicas', name: 'Matemáticas', aliases: ['Matemática'], theme: 'math', plans: ['comun'] },
  { id: 'ingles', name: 'Inglés', aliases: ['Idioma Extranjero: Inglés', 'Idioma Extranjero Inglés', 'English'], theme: 'english', plans: ['comun'] },
  { id: 'historia', name: 'Historia, Geografía y Ciencias Sociales', aliases: ['Historia', 'Historia y Geografía'], theme: 'socialStudies', plans: ['comun', 'electivo'] },
  { id: 'biologia', name: 'Biología', aliases: [], theme: 'biology', plans: ['comun'] },
  { id: 'quimica', name: 'Química', aliases: [], theme: 'biology', plans: ['comun'] },
  { id: 'fisica', name: 'Física', aliases: [], theme: 'physics', plans: ['comun'] },
  { id: 'ciencias', name: 'Ciencias para la Ciudadanía', aliases: ['Ciencias Naturales', 'Ciencias'], theme: 'geography', plans: ['comun'] },
  { id: 'ciudadania', name: 'Educación Ciudadana', aliases: [], theme: 'socialStudies', plans: ['comun'] },
  { id: 'filosofia', name: 'Filosofía', aliases: [], theme: 'read', plans: ['comun'] },
  { id: 'artes-visuales', name: 'Artes Visuales', aliases: ['Artes', 'A. Visuales'], theme: 'hobby', plans: ['comun', 'electivo'] },
  { id: 'musica', name: 'Música', aliases: ['Artes Musicales'], theme: 'hobby', plans: ['comun'] },
  { id: 'tecnologia', name: 'Tecnología', aliases: [], theme: 'geometry', plans: ['comun'] },
  { id: 'educacion-fisica', name: 'Educación Física y Salud', aliases: ['Educación Física', 'Educ. Física'], theme: 'gameNight', plans: ['comun', 'electivo'] },
  { id: 'religion', name: 'Religión', aliases: [], theme: 'read', plans: ['comun', 'electivo'] },
  { id: 'orientacion', name: 'Orientación', aliases: ['Consejo de Curso'], theme: 'backToSchool', plans: ['comun'] },
  // Plan diferenciado (3° y 4° medio): las 27 asignaturas de profundización, por área.
  { id: 'taller-literatura', name: 'Taller de literatura', aliases: [], theme: 'writing', plans: ['dominio'], area: 'A' },
  { id: 'lectura-escritura', name: 'Lectura y escritura especializadas', aliases: [], theme: 'writing', plans: ['dominio'], area: 'A' },
  { id: 'argumentacion', name: 'Participación y argumentación en democracia', aliases: [], theme: 'socialStudies', plans: ['dominio'], area: 'A' },
  { id: 'estetica', name: 'Estética', aliases: [], theme: 'read', plans: ['dominio'], area: 'A' },
  { id: 'filosofia-politica', name: 'Filosofía política', aliases: [], theme: 'read', plans: ['dominio'], area: 'A' },
  { id: 'seminario-filosofia', name: 'Seminario de filosofía', aliases: [], theme: 'read', plans: ['dominio'], area: 'A' },
  { id: 'comprension-historica', name: 'Comprensión histórica del presente', aliases: [], theme: 'socialStudies', plans: ['dominio'], area: 'A' },
  { id: 'geografia-territorio', name: 'Geografía, territorio y desafíos socioambientales', aliases: ['Geografía, Territorio y Desafíos Socioambientales'], theme: 'geography', plans: ['dominio'], area: 'A' },
  { id: 'economia-sociedad', name: 'Economía y sociedad', aliases: [], theme: 'socialStudies', plans: ['dominio'], area: 'A' },
  { id: 'limites-derivadas', name: 'Límites, derivadas e integrales', aliases: [], theme: 'math', plans: ['dominio'], area: 'B' },
  { id: 'probabilidades', name: 'Probabilidades y estadística descriptiva e inferencial', aliases: ['Probabilidades y Estadística Descriptiva Inferencial'], theme: 'math', plans: ['dominio'], area: 'B' },
  { id: 'pensamiento-computacional', name: 'Pensamiento computacional y programación', aliases: [], theme: 'geometry', plans: ['dominio'], area: 'B' },
  { id: 'geometria-3d', name: 'Geometría 3D', aliases: [], theme: 'geometry', plans: ['dominio'], area: 'B' },
  { id: 'biologia-ecosistemas', name: 'Biología de los ecosistemas', aliases: [], theme: 'biology', plans: ['dominio'], area: 'B' },
  { id: 'biologia-celular', name: 'Biología celular y molecular', aliases: [], theme: 'biology', plans: ['dominio'], area: 'B' },
  { id: 'ciencias-salud', name: 'Ciencias de la salud', aliases: ['Ciencias para la Salud'], theme: 'biology', plans: ['dominio'], area: 'B' },
  { id: 'fisica-profundizacion', name: 'Física (profundización)', aliases: [], theme: 'physics', plans: ['dominio'], area: 'B' },
  { id: 'quimica-profundizacion', name: 'Química (profundización)', aliases: [], theme: 'biology', plans: ['dominio'], area: 'B' },
  { id: 'artes-multimediales', name: 'Artes visuales, audiovisuales y multimediales', aliases: [], theme: 'hobby', plans: ['dominio'], area: 'C' },
  { id: 'composicion-musical', name: 'Creación y composición musical', aliases: [], theme: 'hobby', plans: ['dominio'], area: 'C' },
  { id: 'diseno-arquitectura', name: 'Diseño y arquitectura', aliases: [], theme: 'geometry', plans: ['dominio'], area: 'C' },
  { id: 'danza', name: 'Interpretación y creación en danza', aliases: [], theme: 'hobby', plans: ['dominio'], area: 'C' },
  { id: 'teatro', name: 'Interpretación y creación en teatro', aliases: [], theme: 'hobby', plans: ['dominio'], area: 'C' },
  { id: 'interpretacion-musical', name: 'Interpretación musical', aliases: [], theme: 'hobby', plans: ['dominio'], area: 'C' },
  { id: 'vida-activa', name: 'Promoción de estilos de vida activos y saludables', aliases: [], theme: 'gameNight', plans: ['dominio'], area: 'C' },
  { id: 'ciencias-ejercicio', name: 'Ciencias del ejercicio físico y deportivo', aliases: [], theme: 'gameNight', plans: ['dominio'], area: 'C' },
  { id: 'expresion-corporal', name: 'Expresión corporal', aliases: [], theme: 'gameNight', plans: ['dominio'], area: 'C' },
];

/** Subjects a Hall of that kind can be. */
export function subjectsForPlan(plan: HallPlan) {
  return SUBJECTS.filter(subject => subject.plans.includes(plan));
}

/** Third and fourth year have electives and dominios; earlier years only the common plan. */
export function isUpperLevel(courseId: string | null | undefined) {
  return !!courseId && /\b(terc|cuart|3|4)/i.test(courseId);
}

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
