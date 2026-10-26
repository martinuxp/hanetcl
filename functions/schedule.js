const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { sendPush } = require("./classhall-notify");

// The course's weekly timetable (Horario) and the morning summary.
//
// In hn-calendar, closed to the app (only these functions read and write):
//   courseSchedules/{institutionId}__{courseId}
//     institutionId, courseId, blocks [{ id, day 1-6 (lunes-sábado),
//     start "HH:MM", end "HH:MM", subject, room, kind? "break" (recreo) }],
//     updatedAt, updatedBy
// Only the plan común. Electivos and dominios mix courses, so each of their
// Halls keeps its own blocks (halls/{hallId}.blocks in hn-classhall, edited by
// its teacher or the administration with saveHallSchedule) and every student
// gets them added to their course's week.
//
// It is edited by the course's Directiva, the school's administration and HNT;
// everyone in the course reads it.
//
// At 7:00 on school days, each account with a course gets one notification
// with its day: evaluations and tasks of the Calendar and the first block.
// It is turned off in Configuraciones (accounts/{uid}.notifications.morning).

const COLLECTION = "courseSchedules";
const EDIT_ROLES = ["Directiva", "Admin", "HNT"];
const ANY_COURSE_ROLES = ["Admin", "HNT"];
const MAX_BLOCKS = 80;
const MAX_HALL_BLOCKS = 12;
const HALL_PLANS = ["electivo", "dominio"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_ZONE = "America/Santiago";
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
// Android shows the summary in its own channel (services/push-service.ts).
const ANDROID_CHANNEL = "agenda";

function calendarDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-calendar");
}

function classhallDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-classhall");
}

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function text(value, max) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function scheduleId(institutionId, courseId) {
  return `${institutionId}__${courseId}`;
}

function validCourse(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 64 && !value.includes("/");
}

async function requireProfile(getAdminApp, request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const profile = (await identityDb(getAdminApp).collection("users").doc(request.auth.uid).get()).data();
  if (!profile || !profile.institutionId) {
    throw new HttpsError("failed-precondition", "Primero vincula tu HaNet ID con tu institución.");
  }
  return { uid: request.auth.uid, ...profile };
}

/** The course asked for, if this person may see it; their own by default. */
function courseFor(profile, requested) {
  if (requested && requested !== profile.courseId) {
    if (!ANY_COURSE_ROLES.includes(profile.role)) throw new HttpsError("permission-denied", "Solo ves el horario de tu curso.");
    if (!validCourse(requested)) throw new HttpsError("invalid-argument", "Ese curso no es válido.");
    return requested;
  }
  if (!profile.courseId) return null;
  return profile.courseId;
}

function canEdit(profile, courseId) {
  if (!EDIT_ROLES.includes(profile.role)) return false;
  return ANY_COURSE_ROLES.includes(profile.role) || courseId === profile.courseId;
}

function minutes(time) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function cleanBlocks(input) {
  const blocks = (Array.isArray(input) ? input : []).slice(0, MAX_BLOCKS + 1);
  if (blocks.length > MAX_BLOCKS) throw new HttpsError("invalid-argument", `Un horario lleva hasta ${MAX_BLOCKS} bloques.`);
  return blocks.map((block, index) => {
    const day = Number(block?.day);
    const start = typeof block?.start === "string" ? block.start : "";
    const end = typeof block?.end === "string" ? block.end : "";
    const isBreak = block?.kind === "break";
    const subject = text(block?.subject, 40) || (isBreak ? "Recreo" : "");
    if (!Number.isInteger(day) || day < 1 || day > 6) throw new HttpsError("invalid-argument", "Un bloque tiene un día que no existe.");
    if (!TIME.test(start) || !TIME.test(end) || minutes(end) <= minutes(start)) {
      throw new HttpsError("invalid-argument", "Cada bloque termina después de empezar.");
    }
    if (!subject) throw new HttpsError("invalid-argument", "Cada bloque necesita su asignatura.");
    const id = text(block?.id, 24) || `b${index + 1}`;
    if (isBreak) return { id, day, start, end, subject, room: "", kind: "break" };
    return { id, day, start, end, subject, room: text(block?.room, 20) };
  }).sort((a, b) => a.day - b.day || minutes(a.start) - minutes(b.start));
}

/** A Hall's blocks as the timetable shows them: its subject, marked with the Hall. */
function hallBlocksOut(doc) {
  const data = doc.data();
  return (Array.isArray(data.blocks) ? data.blocks : []).map(block => ({
    ...block,
    id: `${doc.id}-${block.id}`,
    subject: data.subject,
    kind: "hall",
    hallId: doc.id,
    plan: data.plan,
  }));
}

/** Chile's date parts for a moment: weekday (0 = domingo), and the day as text. */
function chileDay(ms) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { weekday, date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Where Chile's day that contains `ms` starts and ends, in UTC milliseconds. */
function chileDayRange(ms) {
  const { date } = chileDay(ms);
  // Chile is UTC-3 or UTC-4: midnight there is 03:00 or 04:00 UTC.
  for (const hour of [3, 4, 5]) {
    const candidate = Date.parse(`${date}T0${hour}:00:00Z`);
    if (chileDay(candidate).date === date && chileDay(candidate - 60 * 60 * 1000).date !== date) {
      return { start: candidate, end: candidate + 24 * 60 * 60 * 1000 };
    }
  }
  const start = Date.parse(`${date}T04:00:00Z`);
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function clock(ms) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
}

function truncate(value, max) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** The morning notification for a course, or null when its day is empty. */
function morningMessage(blocks, events, now) {
  const { weekday } = chileDay(now);
  const today = blocks.filter(block => block.day === weekday && block.kind !== "break")
    .sort((a, b) => minutes(a.start) - minutes(b.start));
  const live = events.filter(event => event.cancelled !== true && !String(event.title || "").toUpperCase().includes("CANCELADA"));
  const evaluations = live.filter(event => String(event.type || "").toLocaleLowerCase("es").startsWith("evaluación"));
  const tasks = live.filter(event => String(event.type || "").toLocaleLowerCase("es") === "tarea");
  const lines = [
    ...evaluations.map(event => `Prueba: ${event.subject || event.title} a las ${clock(event.startDate.toMillis())}`),
    ...tasks.map(event => `Se entrega: ${event.title}`),
  ];
  if (today.length) lines.push(`Entras a las ${today[0].start} con ${today[0].subject}`);
  if (!lines.length) return null;
  const day = new Intl.DateTimeFormat("es-CL", { timeZone: TIME_ZONE, day: "numeric", month: "long" }).format(new Date(now));
  return {
    title: evaluations.length ? `Hoy tienes ${evaluations.length === 1 ? "una prueba" : `${evaluations.length} pruebas`} · ${WEEKDAYS[weekday]} ${day}` : `Tu día · ${WEEKDAYS[weekday]} ${day}`,
    body: truncate(lines.join(" · "), 220),
    data: { url: "/schedule" },
    channelId: ANDROID_CHANNEL,
  };
}

function build(getAdminApp) {
  const getCourseSchedule = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const courseId = courseFor(profile, request.data?.courseId);
    const [doc, roster] = await Promise.all([
      courseId ? calendarDb(getAdminApp).collection(COLLECTION).doc(scheduleId(profile.institutionId, courseId)).get() : null,
      // Administration picks the course; the list comes from the roster.
      ANY_COURSE_ROLES.includes(profile.role)
        ? identityDb(getAdminApp).collection("institutions").doc(profile.institutionId).collection("roster").select("curso").get()
        : null,
    ]);
    const data = doc?.data();
    // On their own timetable, the electivos and dominios this person is in.
    const halls = request.data?.courseId ? null : await classhallDb(getAdminApp).collection("halls")
      .where("memberUids", "array-contains", profile.uid).get();
    return {
      courseId,
      blocks: data?.blocks || [],
      hallBlocks: halls ? halls.docs.filter(hall => HALL_PLANS.includes(hall.data().plan)).flatMap(hallBlocksOut) : [],
      updatedAt: data?.updatedAt?.toMillis?.() ?? null,
      canEdit: !!courseId && canEdit(profile, courseId),
      courses: roster ? [...new Set(roster.docs.map(item => item.data().curso).filter(validCourse))].sort((a, b) => a.localeCompare(b, "es")) : [],
    };
  });

  const saveCourseSchedule = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const courseId = courseFor(profile, request.data?.courseId);
    if (!courseId || !canEdit(profile, courseId)) throw new HttpsError("permission-denied", "Tu rol no edita este horario.");
    const blocks = cleanBlocks(request.data?.blocks);
    await calendarDb(getAdminApp).collection(COLLECTION).doc(scheduleId(profile.institutionId, courseId)).set({
      institutionId: profile.institutionId,
      courseId,
      blocks,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: profile.uid,
    });
    return { courseId, blocks };
  });

  // The blocks of an electivo or dominio Hall: its teacher, or the
  // administration of its institution, sets them.
  const saveHallSchedule = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const hallId = typeof request.data?.hallId === "string" ? request.data.hallId : "";
    if (!hallId || hallId.includes("/")) throw new HttpsError("invalid-argument", "Falta el Hall.");
    const hallRef = classhallDb(getAdminApp).collection("halls").doc(hallId);
    const hall = (await hallRef.get()).data();
    if (!hall) throw new HttpsError("not-found", "No encontramos ese Hall.");
    const admin = profile.role === "HNT" || (profile.role === "Admin" && hall.institutionId === profile.institutionId);
    if (hall.teacherUid !== profile.uid && !admin) throw new HttpsError("permission-denied", "Solo su docente o la administración editan el horario del Hall.");
    if (!HALL_PLANS.includes(hall.plan)) throw new HttpsError("failed-precondition", "Un Hall de plan común va en el horario del curso.");
    const input = Array.isArray(request.data?.blocks) ? request.data.blocks : [];
    if (input.length > MAX_HALL_BLOCKS) throw new HttpsError("invalid-argument", `Un Hall lleva hasta ${MAX_HALL_BLOCKS} bloques.`);
    const blocks = cleanBlocks(input.map(block => ({ ...block, subject: hall.subject, kind: undefined })))
      .map(({ id, day, start, end, room }) => ({ id, day, start, end, room }));
    await hallRef.update({ blocks, updatedAt: FieldValue.serverTimestamp() });
    return { blocks };
  });

  const sendMorningSummary = onSchedule({ schedule: "0 7 * * 1-5", timeZone: TIME_ZONE, memory: "512MiB", timeoutSeconds: 300 }, async () => {
    const now = Date.now();
    const identity = identityDb(getAdminApp);
    const calendar = calendarDb(getAdminApp);
    const { start, end } = chileDayRange(now);

    // Who has a course, by institution and course.
    const users = await identity.collection("users").select("institutionId", "courseId").get();
    const courses = new Map();
    for (const doc of users.docs) {
      const { institutionId, courseId } = doc.data();
      if (!institutionId || !validCourse(courseId)) continue;
      const key = scheduleId(institutionId, courseId);
      if (!courses.has(key)) courses.set(key, { courseId, uids: [] });
      courses.get(key).uids.push(doc.id);
    }

    // Electivos and dominios with blocks, by student.
    const hallDocs = await classhallDb(getAdminApp).collection("halls").where("plan", "in", HALL_PLANS).get();
    const hallsOf = new Map();
    for (const doc of hallDocs.docs) {
      const blocks = hallBlocksOut(doc);
      if (!blocks.length) continue;
      for (const uid of doc.data().memberUids || []) {
        if (!hallsOf.has(uid)) hallsOf.set(uid, []);
        hallsOf.get(uid).push({ id: doc.id, blocks });
      }
    }

    let sent = 0;
    for (const [key, { courseId, uids }] of courses) {
      try {
        const [scheduleDoc, events] = await Promise.all([
          calendar.collection(COLLECTION).doc(key).get(),
          calendar.collection(`HNC-LCH.${courseId}`)
            .where("startDate", ">=", Timestamp.fromMillis(start))
            .where("startDate", "<", Timestamp.fromMillis(end))
            .get(),
        ]);
        const courseBlocks = scheduleDoc.data()?.blocks || [];
        const dayEvents = events.docs.map(doc => doc.data());
        const accounts = await identity.getAll(...uids.map(uid => identity.collection("accounts").doc(uid)));
        const wanted = uids.filter((uid, index) => accounts[index].data()?.notifications?.morning !== false);
        // Students in the same electivos and dominios get the same message.
        const groups = new Map();
        for (const uid of wanted) {
          const halls = hallsOf.get(uid) || [];
          const group = halls.map(hall => hall.id).sort().join(",");
          if (!groups.has(group)) groups.set(group, { blocks: halls.flatMap(hall => hall.blocks), uids: [] });
          groups.get(group).uids.push(uid);
        }
        for (const group of groups.values()) {
          const message = morningMessage([...courseBlocks, ...group.blocks], dayEvents, now);
          if (!message) continue;
          const tokens = [];
          for (let index = 0; index < group.uids.length; index += 30) {
            const snapshot = await identity.collection("pushTokens").where("uid", "in", group.uids.slice(index, index + 30)).get();
            for (const doc of snapshot.docs) tokens.push({ id: doc.id, token: doc.data().token });
          }
          if (!tokens.length) continue;
          await sendPush(getAdminApp, tokens, message);
          sent += tokens.length;
        }
      } catch (error) {
        console.error("sendMorningSummary", key, error.message);
      }
    }
    console.log("sendMorningSummary", { courses: courses.size, sent });
  });

  return { getCourseSchedule, saveCourseSchedule, saveHallSchedule, sendMorningSummary };
}

module.exports = { build, morningMessage, chileDayRange };
