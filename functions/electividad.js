const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// HaNet Electividad (Herramientas): an interests test for 2° medio students
// who choose their 3° medio electivos. Each question offers two activities
// from two of the nine areas; there are no right answers. Every pair of areas
// appears twice (36 pairs × 2 = 72 questions), so each area competes 16 times
// and its score is how many of those 16 times it was chosen. Scores are
// relative (choosing one area means not choosing the other): they measure
// preferences, never ability.
//
// The questions are ours. The format follows the usual "would you rather"
// interest tests, but no text comes from another test.
//
// The answers are scored here, not on the phone. Each account answers once;
// the administration (Admin of the institution) or HNT can let someone
// answer again (resetElectividad).
//
// In hn-enrollmentdata, closed to the app (only these functions):
//   electividadResults/{uid}
//     institutionId, courseId, answers { questionId: "a" | "b" },
//     durationSec, version, createdAt
//
// The module is per institution (institutions/{id}.modules, "electividad").
// An institution without that list keeps it on, like the other modules.

const MODULE = "electividad";
const COLLECTION = "electividadResults";
const RESET_ROLES = ["Admin", "HNT"];
const VERSION = 1;
const MAX_DURATION_SEC = 4 * 60 * 60;

// The nine areas, in the order they are listed when tied.
const AREAS = [
  { id: "bio", name: "Biología", field: "ciencias" },
  { id: "qui", name: "Química", field: "ciencias" },
  { id: "mat", name: "Matemáticas", field: "ciencias" },
  { id: "fis", name: "Física", field: "ciencias" },
  { id: "soc", name: "Ciencias Sociales", field: "humanidades" },
  { id: "len", name: "Lenguaje", field: "humanidades" },
  { id: "mus", name: "Artes Musicales", field: "artes" },
  { id: "vis", name: "Artes Visuales", field: "artes" },
  { id: "mov", name: "Artes del Movimiento", field: "artes" },
];

const FIELDS = [
  { id: "ciencias", name: "Ciencias" },
  { id: "humanidades", name: "Humanidades" },
  { id: "artes", name: "Artes" },
];

// Sixteen activities per area: each one is used once.
const ACTIVITIES = {
  bio: [
    "Investigar cómo se comunican las abejas",
    "Observar células de una hoja en el microscopio",
    "Estudiar por qué algunas especies están en peligro de extinción",
    "Descubrir cómo funciona el sistema inmune",
    "Cuidar un huerto y registrar cómo crecen las plantas",
    "Investigar cómo heredamos rasgos de nuestros padres",
    "Recorrer un bosque nativo identificando especies",
    "Entender cómo el cerebro forma recuerdos",
    "Estudiar el comportamiento de los animales en su hábitat",
    "Investigar cómo se propaga un virus",
    "Analizar la cadena alimenticia de un lago",
    "Aprender cómo funcionan las vacunas",
    "Estudiar cómo sobreviven los seres vivos en el desierto de Atacama",
    "Investigar los microorganismos que viven en el cuerpo humano",
    "Participar en el rescate de fauna marina",
    "Comparar el ADN de distintas especies",
  ],
  qui: [
    "Descubrir de qué está hecho un perfume",
    "Preparar soluciones en un laboratorio",
    "Investigar por qué se oxidan los metales",
    "Analizar la calidad del agua de un río",
    "Fabricar jabón a partir de aceites",
    "Estudiar cómo actúan los medicamentos en el cuerpo",
    "Investigar cómo se fabrican los plásticos biodegradables",
    "Identificar qué sustancias componen un líquido desconocido",
    "Entender por qué los fuegos artificiales tienen distintos colores",
    "Medir el pH de distintos alimentos",
    "Investigar cómo se obtiene el litio para las baterías",
    "Explicar qué reacciones ocurren al hornear un queque",
    "Desarrollar un fertilizante menos contaminante",
    "Analizar los componentes de un cosmético",
    "Estudiar cómo se forma la lluvia ácida",
    "Separar los colores de una tinta con cromatografía",
  ],
  mat: [
    "Resolver un problema de lógica complejo",
    "Encontrar el patrón de una secuencia de números",
    "Calcular la probabilidad de ganar un juego de azar",
    "Demostrar por qué un teorema siempre se cumple",
    "Analizar las estadísticas de un campeonato de fútbol",
    "Armar un presupuesto mensual con gráficos",
    "Competir en una olimpiada de matemáticas",
    "Crear un algoritmo para ordenar datos",
    "Calcular la ruta más corta entre varios lugares",
    "Interpretar los resultados de una encuesta",
    "Descifrar un código secreto",
    "Predecir con una fórmula cómo crecerá una población",
    "Resolver ecuaciones para anticipar un resultado",
    "Organizar el horario de un curso con muchas restricciones",
    "Encontrar tendencias en un conjunto de gráficos",
    "Programar una planilla que haga cálculos automáticos",
  ],
  fis: [
    "Construir un circuito eléctrico con un sensor",
    "Investigar cómo funcionan los paneles solares",
    "Calcular la velocidad de un auto en una curva",
    "Estudiar cómo se forman los agujeros negros",
    "Armar un pequeño robot con motores",
    "Entender por qué vuela un avión",
    "Medir cuánta energía consume tu casa",
    "Investigar cómo se propagan los terremotos",
    "Diseñar un puente que resista mucho peso",
    "Observar el cielo con un telescopio en el norte de Chile",
    "Explicar cómo calienta la comida un microondas",
    "Experimentar con imanes y campos magnéticos",
    "Estudiar cómo viaja la luz por una fibra óptica",
    "Analizar el movimiento de un péndulo",
    "Investigar cómo se genera electricidad con el viento",
    "Calcular la trayectoria de un lanzamiento",
  ],
  soc: [
    "Analizar cómo se aprueba una ley en Chile",
    "Investigar la historia de tu ciudad",
    "Debatir sobre un tema de actualidad",
    "Entrevistar a personas mayores sobre su juventud",
    "Estudiar por qué surgen los movimientos sociales",
    "Comparar cómo distintos medios informan una noticia",
    "Investigar la cultura de los pueblos originarios",
    "Organizar una campaña para mejorar tu barrio",
    "Comparar los sistemas políticos de distintos países",
    "Estudiar las causas de una guerra",
    "Investigar cómo afecta la economía a las familias",
    "Participar en un modelo de Naciones Unidas",
    "Analizar datos del censo sobre migración",
    "Investigar la historia de los derechos humanos",
    "Estudiar cómo cambió la vida cotidiana con internet",
    "Proponer soluciones a un problema de tu comuna",
  ],
  len: [
    "Escribir el guion de un cortometraje",
    "Leer y comentar una novela",
    "Escribir un cuento para un concurso literario",
    "Traducir la letra de una canción a otro idioma",
    "Redactar un artículo para el diario escolar",
    "Analizar los recursos de un poema",
    "Escribir la crítica de una película",
    "Aprender un idioma nuevo",
    "Preparar un discurso para el aniversario",
    "Crear un podcast de entrevistas",
    "Investigar el origen de palabras del español de Chile",
    "Corregir y editar textos de otras personas",
    "Participar en un club de lectura",
    "Escribir poesía",
    "Analizar los argumentos de una columna de opinión",
    "Narrar una historia en un concurso de cuentacuentos",
  ],
  mus: [
    "Componer la música de un video",
    "Tocar un instrumento en una banda",
    "Cantar en un coro",
    "Producir una canción en el computador",
    "Investigar la historia de un género musical",
    "Mezclar música en vivo en un evento",
    "Aprender a leer partituras",
    "Arreglar una canción para varios instrumentos",
    "Analizar por qué una canción se vuelve popular",
    "Diseñar el sonido de un videojuego",
    "Organizar un festival de música en el liceo",
    "Improvisar con otros músicos",
    "Investigar la música tradicional chilena",
    "Afinar y reparar instrumentos",
    "Dirigir un conjunto musical",
    "Crear los efectos de sonido de una obra de teatro",
  ],
  vis: [
    "Diseñar el afiche del aniversario del liceo",
    "Ilustrar un cómic con personajes propios",
    "Pintar un mural en el liceo",
    "Fotografiar los paisajes de tu región",
    "Diseñar el logo de una marca",
    "Modelar una figura en 3D",
    "Diseñar la portada de un libro",
    "Crear una animación cuadro a cuadro",
    "Visitar museos y analizar obras de arte",
    "Diseñar la escenografía de una obra",
    "Editar fotografías para una revista",
    "Esculpir una figura en greda",
    "Diseñar las pantallas de una aplicación",
    "Dibujar los planos de una casa",
    "Crear ilustraciones digitales",
    "Diseñar el vestuario de una película",
  ],
  mov: [
    "Preparar una coreografía con tu curso",
    "Actuar en una obra de teatro",
    "Entrenar para una competencia deportiva",
    "Aprender danza contemporánea",
    "Bailar cueca en una muestra folclórica",
    "Practicar acrobacias de circo",
    "Expresar una historia solo con el cuerpo",
    "Dirigir el calentamiento de un equipo",
    "Aprender técnicas de improvisación teatral",
    "Planificar una rutina de ejercicios",
    "Participar en un flashmob",
    "Practicar un arte marcial",
    "Crear una performance sin palabras",
    "Escalar en un muro de escalada",
    "Interpretar a un personaje en un cortometraje",
    "Organizar una corrida familiar en el liceo",
  ],
};

// Careers related to each area. The area of knowledge follows mifuturo.cl
// (Mineduc); a later version reads it, with the rest of the data, from the
// official Oferta Académica base.
const CAREERS = {
  bio: [
    ["Medicina", "Salud"], ["Enfermería", "Salud"], ["Biología Marina", "Ciencias Básicas"],
    ["Medicina Veterinaria", "Agropecuaria"], ["Ingeniería en Biotecnología", "Tecnología"], ["Kinesiología", "Salud"],
  ],
  qui: [
    ["Química y Farmacia", "Salud"], ["Bioquímica", "Ciencias Básicas"], ["Ingeniería Civil Química", "Tecnología"],
    ["Nutrición y Dietética", "Salud"], ["Química Ambiental", "Ciencias Básicas"], ["Ingeniería en Alimentos", "Tecnología"],
  ],
  mat: [
    ["Ingeniería Civil Matemática", "Tecnología"], ["Estadística", "Ciencias Básicas"], ["Ingeniería Civil Industrial", "Tecnología"],
    ["Ingeniería Comercial", "Administración y Comercio"], ["Ingeniería Civil en Computación", "Tecnología"], ["Pedagogía en Matemática", "Educación"],
  ],
  fis: [
    ["Ingeniería Civil Eléctrica", "Tecnología"], ["Ingeniería Civil Mecánica", "Tecnología"], ["Astronomía", "Ciencias Básicas"],
    ["Física", "Ciencias Básicas"], ["Ingeniería Civil en Obras Civiles", "Tecnología"], ["Geofísica", "Ciencias Básicas"],
  ],
  soc: [
    ["Derecho", "Derecho"], ["Sociología", "Ciencias Sociales"], ["Trabajo Social", "Ciencias Sociales"],
    ["Ciencia Política", "Ciencias Sociales"], ["Antropología", "Ciencias Sociales"], ["Pedagogía en Historia", "Educación"],
  ],
  len: [
    ["Periodismo", "Ciencias Sociales"], ["Literatura", "Humanidades"], ["Traducción e Interpretación", "Humanidades"],
    ["Fonoaudiología", "Salud"], ["Publicidad", "Administración y Comercio"], ["Pedagogía en Lenguaje", "Educación"],
  ],
  mus: [
    ["Interpretación Musical", "Arte y Arquitectura"], ["Composición Musical", "Arte y Arquitectura"], ["Ingeniería en Sonido", "Tecnología"],
    ["Producción Musical", "Arte y Arquitectura"], ["Pedagogía en Música", "Educación"],
  ],
  vis: [
    ["Diseño Gráfico", "Arte y Arquitectura"], ["Arquitectura", "Arte y Arquitectura"], ["Artes Visuales", "Arte y Arquitectura"],
    ["Animación Digital", "Arte y Arquitectura"], ["Diseño de Vestuario", "Arte y Arquitectura"], ["Pedagogía en Artes Visuales", "Educación"],
  ],
  mov: [
    ["Danza", "Arte y Arquitectura"], ["Actuación", "Arte y Arquitectura"], ["Pedagogía en Educación Física", "Educación"],
    ["Kinesiología", "Salud"], ["Terapia Ocupacional", "Salud"], ["Preparación Física", "Educación"],
  ],
};

// A small seeded generator, so the order is the same for everyone and for
// every version of the app (the ids would mean something else otherwise).
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The 72 questions: both rounds of the 36 pairs, shuffled so the same areas
// do not come in a row, with the sides swapped at random.
function buildQuestions() {
  const used = Object.fromEntries(AREAS.map(area => [area.id, 0]));
  const questions = [];
  for (let round = 0; round < 2; round += 1) {
    for (let i = 0; i < AREAS.length; i += 1) {
      for (let j = i + 1; j < AREAS.length; j += 1) {
        const x = AREAS[i].id;
        const y = AREAS[j].id;
        questions.push({ pair: `${x}-${y}`, round, x, y, xText: ACTIVITIES[x][used[x]++], yText: ACTIVITIES[y][used[y]++] });
      }
    }
  }
  const random = seeded(20261103);
  for (let i = questions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  // No area twice in a row, and the second round of a pair well after the first.
  const ordered = [];
  const left = [...questions];
  while (left.length) {
    const previous = ordered[ordered.length - 1];
    const recent = ordered.slice(-18).map(question => question.pair);
    const fits = (question, strict) =>
      !previous || (question.x !== previous.x && question.x !== previous.y && question.y !== previous.x && question.y !== previous.y &&
        (!strict || !recent.includes(question.pair)));
    let index = left.findIndex(question => fits(question, true));
    if (index < 0) index = left.findIndex(question => fits(question, false));
    if (index < 0) index = 0;
    ordered.push(left.splice(index, 1)[0]);
  }
  // Each area shows up as option A about as often as option B.
  const asA = Object.fromEntries(AREAS.map(area => [area.id, 0]));
  return ordered.map((question, index) => {
    const swap = asA[question.y] < asA[question.x] || (asA[question.y] === asA[question.x] && random() < 0.5);
    asA[swap ? question.y : question.x] += 1;
    return {
      id: `q${String(index + 1).padStart(2, "0")}`,
      pair: question.pair,
      round: question.round,
      a: swap ? question.y : question.x,
      b: swap ? question.x : question.y,
      aText: swap ? question.yText : question.xText,
      bText: swap ? question.xText : question.yText,
    };
  });
}

const QUESTIONS = buildQuestions();
const PER_AREA = (AREAS.length - 1) * 2;

function areaName(id) {
  return AREAS.find(area => area.id === id)?.name || id;
}

// Everything the result screen shows, from the stored answers.
function score(answers) {
  const wins = Object.fromEntries(AREAS.map(area => [area.id, 0]));
  const pairs = {};
  for (const question of QUESTIONS) {
    const choice = answers[question.id];
    const winner = choice === "a" ? question.a : question.b;
    wins[winner] += 1;
    (pairs[question.pair] = pairs[question.pair] || []).push(winner);
  }

  const order = AREAS.map(area => area.id);
  const ranked = [...order].sort((x, y) => wins[y] - wins[x] || order.indexOf(x) - order.indexOf(y));
  const areas = ranked.map((id, index) => ({
    id,
    name: areaName(id),
    wins: wins[id],
    of: PER_AREA,
    percent: Math.round((wins[id] / PER_AREA) * 100),
    rank: index + 1,
    group: index < 3 ? "alto" : index < 6 ? "medio" : "bajo",
  }));

  const total = QUESTIONS.length;
  const fields = FIELDS.map(field => {
    const sum = AREAS.filter(area => area.field === field.id).reduce((acc, area) => acc + wins[area.id], 0);
    return {
      id: field.id,
      name: field.name,
      percent: Math.round((sum / total) * 100),
      areas: AREAS.filter(area => area.field === field.id).map(area => area.name),
    };
  }).sort((x, y) => y.percent - x.percent);

  // Consistency: how many pairs got the same answer both times.
  const pairList = Object.entries(pairs);
  const consistent = pairList.filter(([, winners]) => winners[0] === winners[1]).length;

  // A profile is "definido" when its top three stand clearly above the rest.
  const top = areas.slice(0, 3).reduce((acc, area) => acc + area.wins, 0) / 3;
  const rest = areas.slice(3).reduce((acc, area) => acc + area.wins, 0) / 6;
  const defined = top - rest >= 4;

  // Head to head: the top areas' clearest wins and the closest pair among
  // the first four.
  const duel = (x, y) => {
    const key = pairs[`${x}-${y}`] ? `${x}-${y}` : `${y}-${x}`;
    const winners = pairs[key] || [];
    return { x, y, xWins: winners.filter(w => w === x).length, yWins: winners.filter(w => w === y).length };
  };
  const duels = [];
  for (const leader of areas.slice(0, 2)) {
    const clear = areas
      .slice()
      .reverse()
      .map(area => duel(leader.id, area.id))
      .find(result => result.y !== leader.id && result.xWins === 2 && !duels.some(d => d.y === result.y));
    if (clear) duels.push({ ...clear, kind: "clara" });
  }
  const even = [];
  for (let i = 0; i < 4; i += 1) {
    for (let j = i + 1; j < 4; j += 1) {
      const result = duel(areas[i].id, areas[j].id);
      if (result.xWins === 1) even.push(result);
    }
  }
  if (even.length) duels.push({ ...even[0], kind: "pareja" });

  const careers = areas.slice(0, 3).map(area => ({
    areaId: area.id,
    areaName: area.name,
    careers: (CAREERS[area.id] || []).map(([name, knowledgeArea]) => ({ name, knowledgeArea })),
  }));

  return {
    areas,
    fields,
    consistency: { same: consistent, of: pairList.length, percent: Math.round((consistent / pairList.length) * 100) },
    profile: defined ? "definido" : "amplio",
    duels: duels.map(d => ({
      a: areaName(d.x), aId: d.x, b: areaName(d.y), bId: d.y, score: `${d.xWins}–${d.yWins}`, kind: d.kind,
    })),
    careers,
  };
}

function millis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : null;
}

function resultOut(data) {
  return {
    ...score(data.answers || {}),
    durationSec: data.durationSec || 0,
    answeredAt: millis(data.createdAt),
  };
}

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

async function requireProfile(getAdminApp, request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const snapshot = await identityDb(getAdminApp).collection("users").doc(request.auth.uid).get();
  const profile = snapshot.data();
  if (!profile || !profile.institutionId) {
    throw new HttpsError("failed-precondition", "Primero vincula tu HaNet ID con tu institución.");
  }
  return { uid: request.auth.uid, ...profile };
}

async function requireModule(getAdminApp, profile) {
  const institution = (await identityDb(getAdminApp).collection("institutions").doc(profile.institutionId).get()).data();
  if (!institution) throw new HttpsError("failed-precondition", "No encontramos tu institución.");
  if (Array.isArray(institution.modules) && !institution.modules.includes(MODULE)) {
    throw new HttpsError("failed-precondition", "HaNet Electividad no está activo en tu institución.");
  }
  return institution;
}

function build(getAdminApp) {
  // The questions (without their areas) and one's result, if there is one.
  const getElectividad = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    await requireModule(getAdminApp, profile);
    const doc = await identityDb(getAdminApp).collection(COLLECTION).doc(profile.uid).get();
    if (doc.exists) return { result: resultOut(doc.data()), questions: [] };
    return {
      result: null,
      questions: QUESTIONS.map(question => ({ id: question.id, a: question.aText, b: question.bText })),
    };
  });

  const submitElectividad = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    await requireModule(getAdminApp, profile);
    const raw = request.data?.answers;
    if (!raw || typeof raw !== "object") throw new HttpsError("invalid-argument", "Faltan tus respuestas.");
    const answers = {};
    for (const question of QUESTIONS) {
      const choice = raw[question.id];
      if (choice !== "a" && choice !== "b") throw new HttpsError("invalid-argument", "Responde todas las preguntas antes de terminar.");
      answers[question.id] = choice;
    }
    const duration = Math.round(Number(request.data?.durationSec) || 0);
    const durationSec = duration > 0 && duration <= MAX_DURATION_SEC ? duration : 0;

    const ref = identityDb(getAdminApp).collection(COLLECTION).doc(profile.uid);
    const data = {
      institutionId: profile.institutionId,
      courseId: profile.courseId || "",
      answers,
      durationSec,
      version: VERSION,
      createdAt: FieldValue.serverTimestamp(),
    };
    await identityDb(getAdminApp).runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.exists) throw new HttpsError("already-exists", "Ya respondiste el test.");
      tx.set(ref, data);
    });
    return { result: { ...score(answers), durationSec, answeredAt: Date.now() } };
  });

  // Lets one person answer again: the administration of their institution
  // or HNT. The previous answers are deleted.
  const resetElectividad = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    if (!RESET_ROLES.includes(profile.role)) {
      throw new HttpsError("permission-denied", "Solo la administración puede habilitar otro intento.");
    }
    const uid = typeof request.data?.uid === "string" ? request.data.uid : "";
    if (!uid || uid.includes("/")) throw new HttpsError("invalid-argument", "Falta la persona.");
    const ref = identityDb(getAdminApp).collection(COLLECTION).doc(uid);
    const doc = await ref.get();
    if (!doc.exists) return { reset: false };
    if (profile.role !== "HNT" && doc.data().institutionId !== profile.institutionId) {
      throw new HttpsError("permission-denied", "Esa persona no es de tu institución.");
    }
    await ref.delete();
    return { reset: true };
  });

  // The results of the institution, for its administration (the panel):
  // name, course and top three of whoever answered. HNT passes the
  // institution; Admin always sees its own.
  const listElectividadResults = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    if (!RESET_ROLES.includes(profile.role)) {
      throw new HttpsError("permission-denied", "Solo la administración ve los resultados.");
    }
    const institutionId = profile.role === "HNT" && typeof request.data?.institutionId === "string"
      ? request.data.institutionId
      : profile.institutionId;
    const db = identityDb(getAdminApp);
    const snapshot = await db.collection(COLLECTION).where("institutionId", "==", institutionId).get();
    const accounts = snapshot.docs.length
      ? await db.getAll(...snapshot.docs.map(doc => db.collection("accounts").doc(doc.id)))
      : [];
    const names = Object.fromEntries(accounts.map(doc => [doc.id, doc.data()?.fullName || ""]));
    const results = snapshot.docs.map(doc => {
      const data = doc.data();
      const result = score(data.answers || {});
      return {
        uid: doc.id,
        name: names[doc.id] || "",
        courseId: data.courseId || "",
        answeredAt: millis(data.createdAt),
        top: result.areas.slice(0, 3).map(area => ({ id: area.id, name: area.name, percent: area.percent })),
        profile: result.profile,
        consistency: result.consistency.percent,
      };
    });
    results.sort((x, y) => x.courseId.localeCompare(y.courseId) || x.name.localeCompare(y.name));
    return { results };
  });

  return { getElectividad, submitElectividad, resetElectividad, listElectividadResults };
}

module.exports = { build, QUESTIONS, score, AREAS };
