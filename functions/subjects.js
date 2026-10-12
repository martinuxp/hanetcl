// The school subjects, shared by ClassHall and the course Calendar so that
// "Matemáticas" is the same subject in both. Same list as the app's
// constants/subjects.ts; change both.

const SUBJECTS = [
  { id: "lenguaje", name: "Lenguaje y Literatura", aliases: ["Lengua y Literatura", "Lenguaje", "Lengua"] },
  { id: "matematicas", name: "Matemáticas", aliases: ["Matemática"] },
  { id: "ingles", name: "Inglés", aliases: ["Idioma Extranjero: Inglés", "Idioma Extranjero Inglés", "English"] },
  { id: "historia", name: "Historia, Geografía y Ciencias Sociales", aliases: ["Historia", "Historia y Geografía"] },
  { id: "biologia", name: "Biología", aliases: [] },
  { id: "quimica", name: "Química", aliases: [] },
  { id: "fisica", name: "Física", aliases: [] },
  { id: "ciencias", name: "Ciencias para la Ciudadanía", aliases: ["Ciencias Naturales", "Ciencias"] },
  { id: "ciudadania", name: "Educación Ciudadana", aliases: [] },
  { id: "filosofia", name: "Filosofía", aliases: [] },
  { id: "artes-visuales", name: "Artes Visuales", aliases: ["Artes"] },
  { id: "musica", name: "Música", aliases: ["Artes Musicales"] },
  { id: "tecnologia", name: "Tecnología", aliases: [] },
  { id: "educacion-fisica", name: "Educación Física y Salud", aliases: ["Educación Física"] },
  { id: "religion", name: "Religión", aliases: [] },
  { id: "orientacion", name: "Orientación", aliases: ["Consejo de Curso"] },
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

module.exports = { SUBJECTS, findSubject, subjectKey };
