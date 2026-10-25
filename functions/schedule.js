const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { sendPush } = require("./classhall-notify");

// The course's weekly timetable (Horario) and the morning summary.
//
// In hn-calendar, closed to the app (only these functions read and write):
//   courseSchedules/{institutionId}__{courseId}
//     institutionId, courseId, blocks [{ id, day 1-6 (lunes-sábado),
//     start "HH:MM", end "HH:MM", subject, room }], updatedAt, updatedBy
// Only the plan común: electivos and dominios mix courses and are not here yet.
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
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_ZONE = "America/Santiago";
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
// Android shows the summary in its own channel (services/push-service.ts).
const ANDROID_CHANNEL = "agenda";

function calendarDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-calendar");
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
    const subject = text(block?.subject, 40);
    if (!Number.isInteger(day) || day < 1 || day > 6) throw new HttpsError("invalid-argument", "Un bloque tiene un día que no existe.");
    if (!TIME.test(start) || !TIME.test(end) || minutes(end) <= minutes(start)) {
      throw new HttpsError("invalid-argument", "Cada bloque termina después de empezar.");
    }
    if (!subject) throw new HttpsError("invalid-argument", "Cada bloque necesita su asignatura.");
    return { id: text(block?.id, 24) || `b${index + 1}`, day, start, end, subject, room: text(block?.room, 20) };
  }).sort((a, b) => a.day - b.day || minutes(a.start) - minutes(b.start));
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
  const today = blocks.filter(block => block.day === weekday);
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
    return {
      courseId,
      blocks: data?.blocks || [],
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
        const message = morningMessage(scheduleDoc.data()?.blocks || [], events.docs.map(doc => doc.data()), now);
        if (!message) continue;
        const accounts = await identity.getAll(...uids.map(uid => identity.collection("accounts").doc(uid)));
        const wanted = uids.filter((uid, index) => accounts[index].data()?.notifications?.morning !== false);
        const tokens = [];
        for (let index = 0; index < wanted.length; index += 30) {
          const snapshot = await identity.collection("pushTokens").where("uid", "in", wanted.slice(index, index + 30)).get();
          for (const doc of snapshot.docs) tokens.push({ id: doc.id, token: doc.data().token });
        }
        if (!tokens.length) continue;
        await sendPush(getAdminApp, tokens, message);
        sent += tokens.length;
      } catch (error) {
        console.error("sendMorningSummary", key, error.message);
      }
    }
    console.log("sendMorningSummary", { courses: courses.size, sent });
  });

  return { getCourseSchedule, saveCourseSchedule, sendMorningSummary };
}

module.exports = { build, morningMessage, chileDayRange };
