// The school subjects, shared by ClassHall and the course Calendar so that
// "Matemáticas" is the same subject in both. Same list as the app's
// constants/subjects.ts; change both.

const PLANS = ["comun", "electivo", "dominio"];

const SUBJECTS = [
  { id: "lenguaje", name: "Lenguaje y Literatura", aliases: ["Lengua y Literatura", "Lenguaje", "Lengua"], plans: ["comun"] },
  { id: "matematicas", name: "Matemáticas", aliases: ["Matemática"], plans: ["comun"] },
  { id: "ingles", name: "Inglés", aliases: ["Idioma Extranjero: Inglés", "Idioma Extranjero Inglés", "English"], plans: ["comun"] },
  { id: "historia", name: "Historia, Geografía y Ciencias Sociales", aliases: ["Historia", "Historia y Geografía"], plans: ["comun", "electivo"] },
  { id: "biologia", name: "Biología", aliases: [], plans: ["comun"] },
  { id: "quimica", name: "Química", aliases: [], plans: ["comun"] },
  { id: "fisica", name: "Física", aliases: [], plans: ["comun"] },
  { id: "ciencias", name: "Ciencias para la Ciudadanía", aliases: ["Ciencias Naturales", "Ciencias"], plans: ["comun"] },
  { id: "ciudadania", name: "Educación Ciudadana", aliases: [], plans: ["comun"] },
  { id: "filosofia", name: "Filosofía", aliases: [], plans: ["comun"] },
  { id: "artes-visuales", name: "Artes Visuales", aliases: ["Artes", "A. Visuales"], plans: ["comun", "electivo"] },
  { id: "musica", name: "Música", aliases: ["Artes Musicales"], plans: ["comun"] },
  { id: "tecnologia", name: "Tecnología", aliases: [], plans: ["comun"] },
  { id: "educacion-fisica", name: "Educación Física y Salud", aliases: ["Educación Física", "Educ. Física"], plans: ["comun", "electivo"] },
  { id: "religion", name: "Religión", aliases: [], plans: ["comun", "electivo"] },
  { id: "orientacion", name: "Orientación", aliases: ["Consejo de Curso"], plans: ["comun"] },
  // Plan diferenciado (3° y 4° medio): las 27 asignaturas de profundización, por área.
  { id: "taller-literatura", name: "Taller de literatura", aliases: [], plans: ["dominio"], area: "A" },
  { id: "lectura-escritura", name: "Lectura y escritura especializadas", aliases: [], plans: ["dominio"], area: "A" },
  { id: "argumentacion", name: "Participación y argumentación en democracia", aliases: [], plans: ["dominio"], area: "A" },
  { id: "estetica", name: "Estética", aliases: [], plans: ["dominio"], area: "A" },
  { id: "filosofia-politica", name: "Filosofía política", aliases: [], plans: ["dominio"], area: "A" },
  { id: "seminario-filosofia", name: "Seminario de filosofía", aliases: [], plans: ["dominio"], area: "A" },
  { id: "comprension-historica", name: "Comprensión histórica del presente", aliases: [], plans: ["dominio"], area: "A" },
  { id: "geografia-territorio", name: "Geografía, territorio y desafíos socioambientales", aliases: ["Geografía, Territorio y Desafíos Socioambientales"], plans: ["dominio"], area: "A" },
  { id: "economia-sociedad", name: "Economía y sociedad", aliases: [], plans: ["dominio"], area: "A" },
  { id: "limites-derivadas", name: "Límites, derivadas e integrales", aliases: [], plans: ["dominio"], area: "B" },
  { id: "probabilidades", name: "Probabilidades y estadística descriptiva e inferencial", aliases: ["Probabilidades y Estadística Descriptiva Inferencial"], plans: ["dominio"], area: "B" },
  { id: "pensamiento-computacional", name: "Pensamiento computacional y programación", aliases: [], plans: ["dominio"], area: "B" },
  { id: "geometria-3d", name: "Geometría 3D", aliases: [], plans: ["dominio"], area: "B" },
  { id: "biologia-ecosistemas", name: "Biología de los ecosistemas", aliases: [], plans: ["dominio"], area: "B" },
  { id: "biologia-celular", name: "Biología celular y molecular", aliases: [], plans: ["dominio"], area: "B" },
  { id: "ciencias-salud", name: "Ciencias de la salud", aliases: ["Ciencias para la Salud"], plans: ["dominio"], area: "B" },
  { id: "fisica-profundizacion", name: "Física (profundización)", aliases: [], plans: ["dominio"], area: "B" },
  { id: "quimica-profundizacion", name: "Química (profundización)", aliases: [], plans: ["dominio"], area: "B" },
  { id: "artes-multimediales", name: "Artes visuales, audiovisuales y multimediales", aliases: [], plans: ["dominio"], area: "C" },
  { id: "composicion-musical", name: "Creación y composición musical", aliases: [], plans: ["dominio"], area: "C" },
  { id: "diseno-arquitectura", name: "Diseño y arquitectura", aliases: [], plans: ["dominio"], area: "C" },
  { id: "danza", name: "Interpretación y creación en danza", aliases: [], plans: ["dominio"], area: "C" },
  { id: "teatro", name: "Interpretación y creación en teatro", aliases: [], plans: ["dominio"], area: "C" },
  { id: "interpretacion-musical", name: "Interpretación musical", aliases: [], plans: ["dominio"], area: "C" },
  { id: "vida-activa", name: "Promoción de estilos de vida activos y saludables", aliases: [], plans: ["dominio"], area: "C" },
  { id: "ciencias-ejercicio", name: "Ciencias del ejercicio físico y deportivo", aliases: [], plans: ["dominio"], area: "C" },
  { id: "expresion-corporal", name: "Expresión corporal", aliases: [], plans: ["dominio"], area: "C" },
];

function normalize(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const BY_NAME = new Map();
for (const subject of SUBJECTS) {
  for (const name of [subject.name, ...subject.aliases]) BY_NAME.set(normalize(name), subject);
}

function findSubject(name) {
  return BY_NAME.get(normalize(name)) || null;
}

// An id for any subject name: the catalog's, or the normalized name for an elective.
function subjectKey(name) {
  const subject = findSubject(name);
  return subject ? subject.id : `otra:${normalize(name)}`;
}

module.exports = { PLANS, SUBJECTS, findSubject, subjectKey };
