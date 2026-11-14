const { randomUUID } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { sendPush } = require("./classhall-notify");
const { recordInbox } = require("./inbox");
const { subjectKey } = require("./subjects");

// Days the school changes: a suspension of classes (no classes that day, or
// those days) or an early dismissal (classes end at a time). They sit on top
// of the weekly timetable, which stays as it is: everything that reads the
// timetable (the Calendar, the widgets, the 7:00 summary) applies them.
//
// Only the school's administration (Admin) and HNT set them, for the whole
// school or some courses. The evaluations that fall in the lost part move by
// themselves to the next class of the same subject (decided by muxp,
// 2026-11-14), and their author hears it; taking the change back puts them
// back where they were, if nobody moved them since.
//
// One document per institution in hn-calendar, closed to the app:
//   dayChanges/{institutionId}
//     changes: [{ id, kind "suspended" | "early", from, to ("YYYY-MM-DD",
//       Chile's dates), endsAt "HH:MM" (early only), scope "school" |
//       "courses", courses [courseId], reason, byUid, byName, at, notified,
//       moves [{ key, hallId?, evaluationId?, courseId?, eventId?, courses?,
//       title, subject, authorUid, from, to (ms) }], unmoved [{ title, subject, at }] }]
// Changes that ended long ago are dropped when the document is written.

const COLLECTION = "dayChanges";
const ORGANIZER_ROLES = ["Admin", "HNT"];
const KINDS = ["suspended", "early"];
const SCOPES = ["school", "courses"];
const TIME_ZONE = "America/Santiago";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// A suspension covers up to a month; longer breaks are vacations (later, in the panel).
const MAX_DAYS = 31;
// How far ahead a change may be set, and how long one that ended is kept.
const MAX_AHEAD_DAYS = 365;
const KEEP_DAYS = 45;
// How far the next class of a subject is looked for.
const LOOKAHEAD_DAYS = 60;
const MAX_COURSES = 80;
const MAX_CHANGES = 200;
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
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

function validCourse(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 64 && !value.includes("/");
}

// ---------------------------------------------------------------------------
// Chile's dates and times.

/** Chile's date ("YYYY-MM-DD") and minutes since midnight at a moment. */
function chileParts(ms) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function todayInChile(now = Date.now()) {
  return chileParts(now).date;
}

function addDays(date, days) {
  const moment = new Date(`${date}T12:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** 0 = domingo … 6 = sábado. */
function weekdayOf(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function minutesOf(time) {
  const [hours, mins] = String(time).split(":").map(Number);
  return hours * 60 + mins;
}

/** The moment Chile's clock reads `time` on `date`. */
function chileMillis(date, time = "00:00") {
  const target = minutesOf(time);
  // Chile is UTC-3 or UTC-4: try both and keep the one that reads right.
  for (const offset of [3, 4, 5]) {
    const guess = Date.parse(`${date}T00:00:00Z`) + (offset * 60 + target) * 60_000;
    const parts = chileParts(guess);
    if (parts.date === date && parts.minutes === target) return guess;
  }
  return Date.parse(`${date}T00:00:00Z`) + (4 * 60 + target) * 60_000;
}

function dayLabel(date) {
  const [, month, day] = date.split("-").map(Number);
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${WEEKDAYS[weekdayOf(date)]} ${day} de ${months[month - 1]}`;
}

function shortDay(date) {
  const day = Number(date.slice(8, 10));
  return `${WEEKDAYS[weekdayOf(date)]} ${day}`;
}

function capital(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function clockOf(ms) {
  const { minutes } = chileParts(ms);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Which change applies where.

function appliesTo(change, courseId) {
  return change.scope === "school" || (Array.isArray(change.courses) && change.courses.includes(courseId));
}

/** The change a course has on a date: a suspension before an early dismissal, the earliest dismissal first. */
function changeOn(changes, courseId, date) {
  const found = (changes || []).filter(change => change.from <= date && date <= change.to && appliesTo(change, courseId));
  return found.find(change => change.kind === "suspended")
    || found.filter(change => change.kind === "early").sort((a, b) => minutesOf(a.endsAt) - minutesOf(b.endsAt))[0]
    || null;
}

/** Whether what starts at `minutes` on `date` is lost for that course. */
function isLost(changes, courseId, date, minutes) {
  const change = changeOn(changes, courseId, date);
  if (!change) return false;
  return change.kind === "suspended" || minutes >= minutesOf(change.endsAt);
}

function isEvaluation(data) {
  return String(data.type || "").toLocaleLowerCase("es").startsWith("evaluación");
}

/** What the app gets of a change. */
function changeOut(change) {
  return {
    id: change.id,
    kind: change.kind,
    from: change.from,
    to: change.to,
    endsAt: change.endsAt || null,
    scope: change.scope,
    courses: change.scope === "courses" ? change.courses : [],
    reason: change.reason || "",
    byName: change.byName || "",
    at: change.at || null,
  };
}

/** The institution's changes, as stored. */
async function loadChanges(getAdminApp, institutionId) {
  const data = (await calendarDb(getAdminApp).collection(COLLECTION).doc(institutionId).get()).data();
  return Array.isArray(data?.changes) ? data.changes : [];
}

/** The changes a course sees: those that have not ended yet, or ended yesterday. */
function changesForCourse(changes, courseId, now = Date.now()) {
  const since = addDays(todayInChile(now), -1);
  return changes.filter(change => change.to >= since && (!courseId || appliesTo(change, courseId))).map(changeOut);
}

// ---------------------------------------------------------------------------
// The next class of a subject.

/**
 * The first class among `blocks` (with day 1-6, start, end) after `afterDate`
 * that is not lost for every one of `courses`.
 */
function nextClass(blocks, afterDate, changes, courses) {
  const sorted = [...blocks].sort((a, b) => a.day - b.day || minutesOf(a.start) - minutesOf(b.start));
  for (let offset = 1; offset <= LOOKAHEAD_DAYS; offset += 1) {
    const date = addDays(afterDate, offset);
    const weekday = weekdayOf(date);
    for (const block of sorted) {
      if (block.day !== weekday) continue;
      const start = minutesOf(block.start);
      if (courses.every(courseId => isLost(changes, courseId, date, start))) continue;
      return { date, start: chileMillis(date, block.start), end: chileMillis(date, block.end) };
    }
  }
  return null;
}

/**
 * Finds the evaluations a change takes away and where each one goes. Writes
 * nothing: `applyMoves` does.
 *   changes: every change of the institution, the new one included
 */
async function planMoves(getAdminApp, { institutionId, change, changes, courses }) {
  const calendar = calendarDb(getAdminApp);
  const classhall = classhallDb(getAdminApp);
  const scheduleCache = new Map();
  const courseBlocks = async (courseId) => {
    if (!scheduleCache.has(courseId)) {
      const doc = await calendar.collection("courseSchedules").doc(`${institutionId}__${courseId}`).get();
      scheduleCache.set(courseId, (doc.data()?.blocks || []).filter(block => block.kind !== "break"));
    }
    return scheduleCache.get(courseId);
  };
  const hallCache = new Map();
  const hallOf = async (hallId) => {
    if (!hallCache.has(hallId)) hallCache.set(hallId, (await classhall.collection("halls").doc(hallId).get()).data() || null);
    return hallCache.get(hallId);
  };

  const start = chileMillis(change.from);
  const end = chileMillis(addDays(change.to, 1));
  const moves = [];
  const unmoved = [];
  const seen = new Set();

  for (const courseId of courses) {
    const snapshot = await calendar.collection(`HNC-LCH.${courseId}`)
      .where("startDate", ">=", Timestamp.fromMillis(start))
      .where("startDate", "<", Timestamp.fromMillis(end))
      .get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.cancelled === true || !isEvaluation(data) || !data.startDate?.toMillis) continue;
      const at = data.startDate.toMillis();
      const { date, minutes } = chileParts(at);
      const duration = Math.max((data.endDate?.toMillis?.() ?? at + 90 * 60_000) - at, 15 * 60_000);
      const fromHall = data.source === "classhall" && typeof data.hallId === "string" && typeof data.evaluationId === "string";

      if (fromHall) {
        const key = `hall:${data.hallId}:${data.evaluationId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const hall = await hallOf(data.hallId);
        if (!hall) continue;
        const evaluation = (await classhall.collection("halls").doc(data.hallId).collection("evaluations").doc(data.evaluationId).get()).data();
        if (!evaluation) continue;
        const hallCourses = Array.isArray(evaluation.calendarCourses) && evaluation.calendarCourses.length ? evaluation.calendarCourses : [hall.courseId];
        // An electivo with students from courses that do have classes still meets.
        if (!hallCourses.every(course => isLost(changes, course, date, minutes))) continue;
        const plan = hall.plan || "comun";
        const blocks = plan === "comun"
          ? (await courseBlocks(hall.courseId)).filter(block => subjectKey(block.subject) === (hall.subjectId || subjectKey(hall.subject)))
          : (Array.isArray(hall.blocks) ? hall.blocks : []);
        const next = nextClass(blocks, date, changes, hallCourses);
        const title = String(evaluation.title || data.title || "");
        if (!next) {
          unmoved.push({ title, subject: hall.subject, at });
          continue;
        }
        moves.push({
          key, hallId: data.hallId, evaluationId: data.evaluationId, courses: hallCourses,
          title, subject: hall.subject, authorUid: hall.teacherUid || null,
          from: at, to: next.start, duration,
        });
        continue;
      }

      if (!isLost(changes, courseId, date, minutes)) continue;
      const key = `course:${courseId}:${doc.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const subject = subjectKey(data.subject);
      const blocks = (await courseBlocks(courseId)).filter(block => subjectKey(block.subject) === subject);
      const next = nextClass(blocks, date, changes, [courseId]);
      if (!next) {
        unmoved.push({ title: String(data.title || ""), subject: String(data.subject || ""), at });
        continue;
      }
      moves.push({
        key, courseId, eventId: doc.id,
        title: String(data.title || ""), subject: String(data.subject || ""), authorUid: data.authorUid || null,
        from: at, to: next.start, duration,
      });
    }
  }
  return { moves, unmoved };
}

/** Moves each evaluation to its new date, marked with the change that moved it. */
async function applyMoves(getAdminApp, change, moves) {
  const calendar = calendarDb(getAdminApp);
  const classhall = classhallDb(getAdminApp);
  for (const move of moves) {
    const fields = {
      startDate: Timestamp.fromMillis(move.to),
      endDate: Timestamp.fromMillis(move.to + move.duration),
      moved: { changeId: change.id, kind: change.kind, from: Timestamp.fromMillis(move.from), to: Timestamp.fromMillis(move.to) },
      updatedAt: FieldValue.serverTimestamp(),
    };
    try {
      if (move.hallId) {
        await classhall.collection("halls").doc(move.hallId).collection("evaluations").doc(move.evaluationId)
          .update({ date: Timestamp.fromMillis(move.to), updatedAt: FieldValue.serverTimestamp() });
        // Each course's copy on its own: one missing must not stop the others.
        await Promise.allSettled(move.courses.map(courseId =>
          calendar.collection(`HNC-LCH.${courseId}`).doc(`hall-${move.hallId}-${move.evaluationId}`).update(fields)));
      } else {
        await calendar.collection(`HNC-LCH.${move.courseId}`).doc(move.eventId).update(fields);
      }
    } catch (error) {
      console.error("applyMoves", move.key, error.message);
    }
  }
}

/** Puts back the evaluations a change moved, unless someone moved them again. Returns those put back. */
async function undoMoves(getAdminApp, moves) {
  const calendar = calendarDb(getAdminApp);
  const classhall = classhallDb(getAdminApp);
  const restored = [];
  for (const move of moves || []) {
    try {
      const back = {
        startDate: Timestamp.fromMillis(move.from),
        endDate: Timestamp.fromMillis(move.from + (move.duration || 90 * 60_000)),
        moved: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (move.hallId) {
        const ref = classhall.collection("halls").doc(move.hallId).collection("evaluations").doc(move.evaluationId);
        const evaluation = (await ref.get()).data();
        if (!evaluation || evaluation.date?.toMillis?.() !== move.to) continue;
        await ref.update({ date: Timestamp.fromMillis(move.from), updatedAt: FieldValue.serverTimestamp() });
        const courses = Array.isArray(evaluation.calendarCourses) && evaluation.calendarCourses.length ? evaluation.calendarCourses : move.courses;
        await Promise.allSettled(courses.map(courseId =>
          calendar.collection(`HNC-LCH.${courseId}`).doc(`hall-${move.hallId}-${move.evaluationId}`).update(back)));
      } else {
        const ref = calendar.collection(`HNC-LCH.${move.courseId}`).doc(move.eventId);
        const event = (await ref.get()).data();
        if (!event || event.startDate?.toMillis?.() !== move.to) continue;
        await ref.update(back);
      }
      restored.push(move);
    } catch (error) {
      console.error("undoMoves", move.key, error.message);
    }
  }
  return restored;
}

// ---------------------------------------------------------------------------
// Who hears it.

/** The accounts a change reaches: the whole school, or the students of its courses. */
async function reachedUids(getAdminApp, institutionId, change) {
  const users = await identityDb(getAdminApp).collection("users").where("institutionId", "==", institutionId).select("courseId").get();
  return users.docs
    .filter(doc => change.scope === "school" || change.courses.includes(doc.data().courseId))
    .map(doc => doc.id);
}

/** How many accounts a change reaches, counted without reading them (for the preview). */
async function reachCount(getAdminApp, institutionId, change) {
  const users = identityDb(getAdminApp).collection("users").where("institutionId", "==", institutionId);
  if (change.scope === "school") return (await users.count().get()).data().count;
  let total = 0;
  for (let start = 0; start < change.courses.length; start += 30) {
    total += (await users.where("courseId", "in", change.courses.slice(start, start + 30)).count().get()).data().count;
  }
  return total;
}

async function tokensOf(getAdminApp, uids) {
  const db = identityDb(getAdminApp);
  const tokens = [];
  for (let start = 0; start < uids.length; start += 30) {
    const snapshot = await db.collection("pushTokens").where("uid", "in", uids.slice(start, start + 30)).get();
    for (const doc of snapshot.docs) tokens.push({ id: doc.id, token: doc.data().token });
  }
  return tokens;
}

function whenText(change) {
  return change.from === change.to
    ? capital(shortDay(change.from))
    : `Del ${shortDay(change.from)} al ${shortDay(change.to)}`;
}

function announcement(change, movedCount) {
  const title = change.kind === "suspended"
    ? `${whenText(change)}: no hay clases`
    : `${capital(shortDay(change.from))}: salida a las ${change.endsAt}`;
  const lines = [change.reason || (change.kind === "suspended" ? "Clases suspendidas." : "Salida anticipada.")];
  if (movedCount > 0) lines.push("Las pruebas de esas horas pasan a la clase siguiente de cada asignatura.");
  return { title, body: lines.join(" "), data: { url: "/calendar" }, channelId: ANDROID_CHANNEL };
}

function retraction(change) {
  const title = change.kind === "suspended" ? `${whenText(change)}: sí hay clases` : `${capital(shortDay(change.from))}: horario normal`;
  return {
    title,
    body: change.kind === "suspended" ? "Se retoman las clases. Las pruebas vuelven a su fecha." : "Ya no hay salida anticipada. Las pruebas vuelven a su hora.",
    data: { url: "/calendar" },
    channelId: ANDROID_CHANNEL,
  };
}

async function tell(getAdminApp, uids, message) {
  await recordInbox(getAdminApp, uids, "dayChange", message);
  try {
    const tokens = await tokensOf(getAdminApp, uids);
    if (tokens.length) await sendPush(getAdminApp, tokens, message);
  } catch (error) {
    console.error("dayChanges push", error.message);
  }
}

/** Each author hears where their evaluation went. Teachers get it in their notifications only. */
async function tellAuthors(getAdminApp, change, moves, back) {
  for (const move of moves) {
    if (!move.authorUid) continue;
    const at = back ? move.from : move.to;
    const when = `${dayLabel(chileParts(at).date)} a las ${clockOf(at)}`;
    const reason = change.kind === "suspended" ? "la suspensión de clases" : "la salida anticipada";
    await recordInbox(getAdminApp, [move.authorUid], "dayChange", {
      title: back ? "Tu evaluación volvió a su fecha" : "Tu evaluación cambió de fecha",
      body: back
        ? `${move.title} vuelve al ${when}: se retomaron las clases.`
        : `${move.title} pasó al ${when}, la clase siguiente de ${move.subject}, por ${reason}.`,
      data: { url: move.hallId ? `/classhall/hall?id=${move.hallId}` : `/event-info?id=${move.eventId}&canEdit=1` },
    });
  }
}

// ---------------------------------------------------------------------------

async function requireOrganizer(getAdminApp, request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const profile = (await identityDb(getAdminApp).collection("users").doc(request.auth.uid).get()).data();
  if (!profile?.institutionId) throw new HttpsError("failed-precondition", "Primero vincula tu HaNet ID con tu institución.");
  if (!ORGANIZER_ROLES.includes(profile.role)) throw new HttpsError("permission-denied", "Solo la administración del liceo cambia los días de clases.");
  return { uid: request.auth.uid, ...profile };
}

async function institutionCourses(getAdminApp, institutionId) {
  const roster = await identityDb(getAdminApp).collection("institutions").doc(institutionId).collection("roster").select("curso").get();
  return [...new Set(roster.docs.map(doc => doc.data().curso).filter(validCourse))].sort((a, b) => a.localeCompare(b, "es"));
}

function cleanChange(input, profile, now) {
  const kind = KINDS.includes(input?.kind) ? input.kind : null;
  if (!kind) throw new HttpsError("invalid-argument", "Elige si es una suspensión o una salida anticipada.");
  const from = typeof input.from === "string" && DATE.test(input.from) ? input.from : null;
  const to = kind === "early" ? from : (typeof input.to === "string" && DATE.test(input.to) ? input.to : from);
  if (!from || !to) throw new HttpsError("invalid-argument", "Elige la fecha.");
  const today = todayInChile(now);
  if (to < today) throw new HttpsError("invalid-argument", "Esa fecha ya pasó.");
  if (daysBetween(from, to) < 0) throw new HttpsError("invalid-argument", "La fecha final va después de la inicial.");
  if (daysBetween(from, to) >= MAX_DAYS) throw new HttpsError("invalid-argument", `Una suspensión dura hasta ${MAX_DAYS} días.`);
  if (daysBetween(today, from) > MAX_AHEAD_DAYS) throw new HttpsError("invalid-argument", "Esa fecha está muy lejos.");
  const endsAt = kind === "early" ? (typeof input.endsAt === "string" && TIME.test(input.endsAt) ? input.endsAt : null) : null;
  if (kind === "early" && !endsAt) throw new HttpsError("invalid-argument", "Elige la hora de salida.");
  const scope = SCOPES.includes(input.scope) ? input.scope : "school";
  const courses = scope === "courses"
    ? [...new Set((Array.isArray(input.courses) ? input.courses : []).filter(validCourse))].slice(0, MAX_COURSES)
    : [];
  if (scope === "courses" && !courses.length) throw new HttpsError("invalid-argument", "Elige al menos un curso.");
  return {
    id: randomUUID(),
    kind, from, to, endsAt, scope, courses,
    reason: text(input.reason, 120),
    byUid: profile.uid,
    byName: text(profile.name, 80),
    at: now,
  };
}

function build(getAdminApp) {
  // Admin and HNT: the changes that have not ended, with what each one moved.
  const listDayChanges = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const [changes, courses] = await Promise.all([
      loadChanges(getAdminApp, profile.institutionId),
      institutionCourses(getAdminApp, profile.institutionId),
    ]);
    const today = todayInChile();
    return {
      changes: changes
        .filter(change => change.to >= today)
        .sort((a, b) => a.from.localeCompare(b.from))
        .map(change => ({ ...changeOut(change), moved: (change.moves || []).length, unmoved: (change.unmoved || []).length })),
      courses,
    };
  });

  // { kind, from, to?, endsAt?, scope, courses?, reason, notify, dryRun }
  // dryRun says what would move and whom it reaches, and saves nothing.
  const saveDayChange = onCall({ invoker: "public", timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const now = Date.now();
    const change = cleanChange(request.data, profile, now);
    const institutionId = profile.institutionId;
    const existing = await loadChanges(getAdminApp, institutionId);
    if (existing.length >= MAX_CHANGES) throw new HttpsError("resource-exhausted", "Hay demasiados cambios guardados.");
    const allCourses = await institutionCourses(getAdminApp, institutionId);
    const courses = change.scope === "school" ? allCourses : change.courses;
    const changes = [...existing, change];
    const { moves, unmoved } = await planMoves(getAdminApp, { institutionId, change, changes, courses });
    const plan = {
      moves: moves.map(move => ({ title: move.title, subject: move.subject, from: move.from, to: move.to })),
      unmoved,
    };
    if (request.data?.dryRun === true) return { ...plan, reach: await reachCount(getAdminApp, institutionId, change) };
    const uids = await reachedUids(getAdminApp, institutionId, change);

    await applyMoves(getAdminApp, change, moves);
    const notify = request.data?.notify !== false;
    const stored = { ...change, notified: notify, moves: moves.map(({ key, hallId, evaluationId, courseId, eventId, courses: list, title, subject, authorUid, from, to, duration }) => ({
      key, ...(hallId ? { hallId, evaluationId, courses: list } : { courseId, eventId }), title, subject, authorUid, from, to, duration,
    })), unmoved };
    const ref = calendarDb(getAdminApp).collection(COLLECTION).doc(institutionId);
    const keepSince = addDays(todayInChile(now), -KEEP_DAYS);
    await calendarDb(getAdminApp).runTransaction(async (transaction) => {
      const current = (await transaction.get(ref)).data();
      const list = (Array.isArray(current?.changes) ? current.changes : []).filter(item => item.to >= keepSince);
      transaction.set(ref, { institutionId, changes: [...list, stored], updatedAt: FieldValue.serverTimestamp() });
    });

    if (notify) await tell(getAdminApp, uids, announcement(change, moves.length));
    await tellAuthors(getAdminApp, change, moves, false);
    return { id: change.id, ...plan, reach: uids.length };
  });

  // { id, notify } Takes a change back: the evaluations it moved go back.
  const deleteDayChange = onCall({ invoker: "public", timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const id = typeof request.data?.id === "string" ? request.data.id : "";
    const ref = calendarDb(getAdminApp).collection(COLLECTION).doc(profile.institutionId);
    let removed = null;
    await calendarDb(getAdminApp).runTransaction(async (transaction) => {
      const current = (await transaction.get(ref)).data();
      const list = Array.isArray(current?.changes) ? current.changes : [];
      removed = list.find(item => item.id === id) || null;
      if (!removed) return;
      transaction.update(ref, { changes: list.filter(item => item.id !== id), updatedAt: FieldValue.serverTimestamp() });
    });
    if (!removed) throw new HttpsError("not-found", "Ese cambio ya no existe.");
    const restored = await undoMoves(getAdminApp, removed.moves);
    // Nobody needs to hear about a day that already passed.
    const notify = request.data?.notify !== false && removed.notified && removed.to >= todayInChile();
    if (notify) await tell(getAdminApp, await reachedUids(getAdminApp, profile.institutionId, removed), retraction(removed));
    await tellAuthors(getAdminApp, removed, restored, true);
    return { restored: restored.length };
  });

  return { listDayChanges, saveDayChange, deleteDayChange };
}

module.exports = {
  build,
  loadChanges,
  changesForCourse,
  changeOn,
  isLost,
  minutesOf,
  chileParts,
  chileMillis,
  addDays,
  nextClass,
};
