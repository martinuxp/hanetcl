const { randomUUID } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { sendPush } = require("./classhall-notify");

// Aniversario: the school's anniversary week, played by alianzas. Each
// alianza groups whole courses; its points come from the activities' results
// and from additions or deductions that always carry a reason. The score is
// the sum of those entries, so there is a record of every point and no total
// anybody typed by hand.
//
// Organizers: CEE, Admin and HNT of the institution. Everyone else reads.
// Students are never named here: entries talk about an alianza, never about a
// person (sanctions to people belong to convivencia escolar, not the app).
//
// In hn-calendar, closed to the app (only these functions read and write):
//   anniversaries/{institutionId__year}
//     institutionId, year, title, startsAt, endsAt, rulesUrl, scoreHidden,
//     finished, alliances [{ id, name, theme, color, emoji, motto,
//       instagram, courseIds, leadUids }],
//     activities [{ id, name, group, startsAt, place, mode, points, flash,
//       text, result, resultAt }],
//     deadlines [{ id, title, dueAt, audience, remindedDay, remindedSoon }],
//     score { totals { allianceId: points }, recent [latest entries] } — the
//       sum of entries, kept here so a visit reads one document (rescore)
//     createdAt, updatedAt, updatedBy
//   anniversaries/{id}/entries/{entryId}
//     kind "result" | "adjust", activityId, allianceId, points, reason,
//     createdBy, createdAt
// An activity is scored by podium (mode "podium": points by place, 1° first)
// or by hand (mode "manual": points per alianza, for things counted, like
// the solidarity baskets or the photos).
//
// The module is per institution (institutions/{id}.modules, "alliances"). An
// institution without that list keeps it on, like the feed.

const COLLECTION = "anniversaries";
const ENTRIES = "entries";
const MODULE = "alliances";
const ORGANIZER_ROLES = ["CEE", "Admin", "HNT"];
const STAFF_ROLES = ["Profesor", "Admin", "HNT"];
// Alliance colors are names; the app maps them to its palette.
const COLORS = ["rosa", "rojo", "naranjo", "amarillo", "verde", "celeste", "azul", "morado", "blanco", "negro"];
// An alianza's mascot is one emoji (the app uses icons everywhere else).
const EMOJI = /^(?=.*\p{Extended_Pictographic})[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D]{1,16}$/u;
const INSTAGRAM = /^[A-Za-z0-9._]{1,30}$/;
const GROUPS = ["previas", "deportes", "velada", "show", "flash", "otras"];
const MODES = ["podium", "manual"];
const AUDIENCES = ["leads", "all"];
const MAX_ALLIANCES = 8;
const MIN_ALLIANCES = 2;
const MAX_ACTIVITIES = 80;
const MAX_DEADLINES = 40;
const MAX_LEADS = 4;
const MAX_POINTS = 1000000;
const MAX_RECENT = 150;
const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_MS = 2 * 60 * 60 * 1000;
const TIME_ZONE = "America/Santiago";

// "Cargar actividades típicas": generic names and the point tables most
// anniversaries use (taken from the pilot's rules, without its artists,
// places or people). Organizers edit or delete them afterwards.
const PRESETS = [
  { name: "Alianza solidaria", group: "previas", mode: "manual" },
  { name: "Búsqueda de objetos", group: "previas", mode: "manual" },
  { name: "Fotos imposibles", group: "previas", mode: "manual" },
  { name: "Concurso de fotografía, pintura y dibujo", group: "previas", mode: "manual" },
  { name: "Recreación de un video musical", group: "previas", mode: "manual" },
  { name: "Yincana", group: "previas", mode: "podium", points: [4000, 3000, 2000, 1000] },
  { name: "Concurso de maquillaje", group: "previas", mode: "podium", points: [4000, 3000, 2000, 1000] },
  { name: "Deportes", group: "deportes", mode: "manual" },
  { name: "Presentación de alianza", group: "velada", mode: "podium", points: [6000, 3000, 1500, 1000] },
  { name: "Desfile reciclable", group: "velada", mode: "podium", points: [6000, 3000, 1500, 1000] },
  { name: "Cultura general de los reyes", group: "velada", mode: "podium", points: [6000, 3000, 1500, 1000] },
  { name: "Imita a un personaje", group: "velada", mode: "podium", points: [6000, 3000, 1500, 1000] },
  { name: "Concurso de canto", group: "velada", mode: "podium", points: [6000, 3000, 1500, 1000] },
  { name: "Desfile de cuerpos pintados", group: "velada", mode: "podium", points: [8000, 6000, 4000, 3000] },
  { name: "Baile de reyes", group: "show", mode: "podium", points: [20000, 15000, 10000, 5000] },
  { name: "Baile de alianza", group: "show", mode: "podium", points: [30000, 25000, 20000, 15000] },
  { name: "Desfile de barra", group: "show", mode: "podium", points: [20000, 15000, 10000, 5000] },
  { name: "Baile de profesores", group: "show", mode: "podium", points: [30000, 25000, 20000, 15000] },
  { name: "Baile de apoderados", group: "show", mode: "podium", points: [30000, 25000, 20000, 15000] },
  { name: "Batalla de baile", group: "show", mode: "podium", points: [20000, 10000, 10000, 10000] },
  { name: "Mascota", group: "show", mode: "podium", points: [10000, 8000, 6000, 5000] },
  { name: "Lienzo", group: "show", mode: "podium", points: [30000, 25000, 20000, 15000] },
];

function calendarDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-calendar");
}

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function text(value, max) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function paragraph(value, max) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
    : "";
}

function itemId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{4,40}$/.test(value) ? value : null;
}

function newId() {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

function millis(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A time the app sent, in ms, within a sane range. */
function timeIn(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return null;
  const now = Date.now();
  return ms > now - 2 * 365 * DAY_MS && ms < now + 3 * 365 * DAY_MS ? Math.round(ms) : null;
}

function pointsIn(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && Math.abs(number) <= MAX_POINTS ? number : null;
}

function validCourse(courseId) {
  return typeof courseId === "string" && courseId.trim().length > 0 && courseId.length <= 60;
}

function httpsUrl(value) {
  const url = text(value, 500);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

/** "jueves 15 de julio, 18:00", in Chile's time zone. */
function whenText(ms) {
  const date = new Date(ms);
  const day = new Intl.DateTimeFormat("es-CL", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(date);
  const time = new Intl.DateTimeFormat("es-CL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${day.replace(",", "")}, ${time}`;
}

function emojiIn(value) {
  const emoji = typeof value === "string" ? value.trim() : "";
  return EMOJI.test(emoji) ? emoji : "";
}

// "@alianza.80s" or a profile link, kept as the bare handle.
function instagramIn(value) {
  if (typeof value !== "string") return "";
  const handle = value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return INSTAGRAM.test(handle) ? handle : "";
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
    throw new HttpsError("failed-precondition", "El aniversario no está activo en tu institución.");
  }
  return institution;
}

function canOrganize(profile) {
  return ORGANIZER_ROLES.includes(profile.role);
}

async function requireOrganizer(getAdminApp, request) {
  const profile = await requireProfile(getAdminApp, request);
  if (!canOrganize(profile)) throw new HttpsError("permission-denied", "Solo el CEE y la administración organizan el aniversario.");
  await requireModule(getAdminApp, profile);
  return profile;
}

// The institution's latest anniversary (the one of the highest year).
async function currentRef(getAdminApp, institutionId) {
  const snapshot = await calendarDb(getAdminApp).collection(COLLECTION).where("institutionId", "==", institutionId).get();
  if (snapshot.empty) return null;
  const latest = snapshot.docs.sort((a, b) => (b.data().year || 0) - (a.data().year || 0))[0];
  return latest.ref;
}

async function requireCurrent(getAdminApp, profile) {
  const ref = await currentRef(getAdminApp, profile.institutionId);
  if (!ref) throw new HttpsError("not-found", "Todavía no hay un aniversario armado.");
  return ref;
}

function allianceOf(data, courseId) {
  return (data.alliances || []).find(alliance => (alliance.courseIds || []).includes(courseId)) || null;
}

function activityOut(activity) {
  return {
    id: activity.id,
    name: activity.name,
    group: activity.group,
    startsAt: millis(activity.startsAt),
    place: activity.place || "",
    mode: activity.mode,
    points: activity.points || [],
    flash: !!activity.flash,
    text: activity.text || "",
    result: activity.result || null,
    resultAt: millis(activity.resultAt),
  };
}

function anniversaryOut(id, data, viewer) {
  const organizer = canOrganize(viewer);
  const mine = allianceOf(data, viewer.courseId);
  const isLead = (data.alliances || []).some(alliance => (alliance.leadUids || []).includes(viewer.uid));
  const hidden = !!data.scoreHidden && !organizer;
  const totals = data.score?.totals || {};
  const recent = data.score?.recent || [];

  const alliances = (data.alliances || []).map(alliance => ({
    id: alliance.id,
    name: alliance.name,
    theme: alliance.theme || "",
    color: alliance.color,
    emoji: alliance.emoji || "",
    motto: alliance.motto || "",
    instagram: alliance.instagram || "",
    courseIds: alliance.courseIds || [],
    // Organizers see who leads each alianza; the leads only learn that they do.
    leadCount: (alliance.leadUids || []).length,
    ...(organizer ? { leadUids: alliance.leadUids || [] } : {}),
    total: hidden ? null : totals[alliance.id] || 0,
  }));

  // While the score is hidden, places are still shown, but no points.
  const activities = (data.activities || []).map(activity => {
    const out = activityOut(activity);
    if (hidden) {
      out.points = [];
      if (out.mode === "manual") out.result = null;
    }
    return out;
  });

  const deadlines = (data.deadlines || [])
    .filter(deadline => organizer || deadline.audience === "all" || isLead)
    .map(deadline => ({ id: deadline.id, title: deadline.title, dueAt: millis(deadline.dueAt), audience: deadline.audience }));

  const history = hidden ? [] : recent.filter(entry => entry.kind === "adjust" || organizer);

  return {
    id,
    title: data.title,
    year: data.year,
    startsAt: millis(data.startsAt),
    endsAt: millis(data.endsAt),
    rulesUrl: data.rulesUrl || "",
    scoreHidden: !!data.scoreHidden,
    finished: !!data.finished,
    alliances,
    activities,
    deadlines,
    history,
    myAllianceId: mine ? mine.id : null,
    isLead,
  };
}

// The score is kept on the anniversary itself (totals and the latest
// movements), so opening the page reads one document and not the whole
// record. Every change to the entries sums them again.
async function rescore(ref) {
  const snapshot = await ref.collection(ENTRIES).get();
  const totals = {};
  const recent = [];
  for (const doc of snapshot.docs) {
    const entry = doc.data();
    totals[entry.allianceId] = (totals[entry.allianceId] || 0) + (entry.points || 0);
    recent.push({
      id: doc.id,
      kind: entry.kind,
      activityId: entry.activityId || null,
      allianceId: entry.allianceId,
      points: entry.points,
      reason: entry.reason || "",
      // A just-written entry has no server time yet in this read.
      createdAt: millis(entry.createdAt) || Date.now(),
    });
  }
  recent.sort((a, b) => b.createdAt - a.createdAt);
  await ref.update({ score: { totals, recent: recent.slice(0, MAX_RECENT) } });
}

async function respond(ref, viewer, { rescored = false } = {}) {
  if (rescored) await rescore(ref);
  const doc = await ref.get();
  return { anniversary: anniversaryOut(doc.id, doc.data(), viewer), canOrganize: canOrganize(viewer) };
}

// The uids of the students in these courses.
async function studentsOf(getAdminApp, institutionId, courseIds) {
  const db = identityDb(getAdminApp);
  const people = [];
  for (let start = 0; start < courseIds.length; start += 30) {
    const snapshot = await db.collection("users")
      .where("institutionId", "==", institutionId)
      .where("courseId", "in", courseIds.slice(start, start + 30))
      .get();
    for (const doc of snapshot.docs) {
      if (!STAFF_ROLES.includes(doc.data().role)) people.push({ uid: doc.id, ...doc.data() });
    }
  }
  return people;
}

// Who hears about a flash test or a deadline: the alianzas' leads, or every
// student of the alianzas.
async function audienceUids(getAdminApp, data, audience) {
  const alliances = data.alliances || [];
  if (audience === "leads") return [...new Set(alliances.flatMap(alliance => alliance.leadUids || []))];
  const courseIds = alliances.flatMap(alliance => alliance.courseIds || []);
  return (await studentsOf(getAdminApp, data.institutionId, courseIds)).map(person => person.uid);
}

// Those who turned the anniversary's notifications off are left out, and so
// is anyone `keep` (given the account) turns away.
async function notify(getAdminApp, uids, message, { url = "/anniversary", keep = () => true } = {}) {
  try {
    const unique = [...new Set(uids)];
    if (!unique.length) return 0;
    const db = identityDb(getAdminApp);
    const accounts = await db.getAll(...unique.map(uid => db.collection("accounts").doc(uid)));
    const wanted = unique.filter((uid, index) => {
      const account = accounts[index].data() || {};
      return account.notifications?.anniversary !== false && keep(account);
    });
    const tokens = [];
    for (let start = 0; start < wanted.length; start += 30) {
      const snapshot = await db.collection("pushTokens").where("uid", "in", wanted.slice(start, start + 30)).get();
      for (const doc of snapshot.docs) tokens.push({ id: doc.id, token: doc.data().token });
    }
    if (!tokens.length) return 0;
    await sendPush(getAdminApp, tokens, { ...message, data: { url } });
    return tokens.length;
  } catch (error) {
    console.error("anniversary notify", error.message);
    return 0;
  }
}

// An aviso of the CEE or the school tagged #Aniversario (functions/feed.js):
// a push to the students of the alianzas it reaches, by jornada or course
// as the post says. Nothing happens without an anniversary armed.
async function announceToAlliances(getAdminApp, institutionId, audience, message) {
  const ref = await currentRef(getAdminApp, institutionId);
  if (!ref) return 0;
  const data = (await ref.get()).data() || {};
  let people = await studentsOf(getAdminApp, institutionId, (data.alliances || []).flatMap(alliance => alliance.courseIds || []));
  if (audience?.kind === "courses") people = people.filter(person => (audience.courseIds || []).includes(person.courseId));
  const keep = audience?.kind === "jornada" ? account => !account.jornada || account.jornada === audience.jornada : undefined;
  return notify(getAdminApp, people.map(person => person.uid), message, { url: "/anniversary/notices", keep });
}

function pointsListIn(value) {
  if (!Array.isArray(value)) return null;
  const list = value.slice(0, MAX_ALLIANCES).map(pointsIn);
  return list.length && list.every(points => points !== null && points >= 0) ? list : null;
}

function activityIn(input, existing) {
  const name = text(input?.name, 80);
  if (!name) throw new HttpsError("invalid-argument", "Ponle nombre a la actividad.");
  const mode = MODES.includes(input?.mode) ? input.mode : "podium";
  const points = mode === "podium" ? pointsListIn(input?.points) : [];
  if (mode === "podium" && !points) throw new HttpsError("invalid-argument", "Escribe los puntos de cada lugar.");
  const group = GROUPS.includes(input?.group) ? input.group : "otras";
  const startsAt = input?.startsAt == null ? null : timeIn(input.startsAt);
  return {
    ...(existing || {}),
    id: existing?.id || newId(),
    name,
    group,
    startsAt: startsAt ? Timestamp.fromMillis(startsAt) : null,
    place: text(input?.place, 80),
    mode,
    points,
    flash: existing?.flash || group === "flash",
    text: paragraph(input?.text, 500),
    // A new scoring mode starts without a result.
    ...(existing && existing.mode !== mode ? { result: null, resultAt: null } : {}),
  };
}

function build(getAdminApp) {
  // The anniversary as the caller sees it: their alianza, the score (unless
  // hidden), the activities, the deadlines for them and the record of points.
  const getAnniversary = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    await requireModule(getAdminApp, profile);
    const ref = await currentRef(getAdminApp, profile.institutionId);
    if (!ref) return { anniversary: null, canOrganize: canOrganize(profile) };
    return respond(ref, profile);
  });

  // The courses of the institution, to put them in alianzas.
  const listAnniversaryCourses = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const snapshot = await identityDb(getAdminApp).collection("users")
      .where("institutionId", "==", profile.institutionId)
      .select("courseId")
      .get();
    const courses = new Set();
    for (const doc of snapshot.docs) {
      const courseId = doc.data().courseId;
      if (validCourse(courseId)) courses.add(courseId);
    }
    return { courses: [...courses].sort((a, b) => a.localeCompare(b, "es")) };
  });

  // Creates or edits the anniversary: its name, dates, alianzas and courses,
  // and the switches (hidden score, finished). With `delete`, borra the
  // current one whole: alianzas, activities, deadlines and every entry.
  const saveAnniversary = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const data = request.data || {};
    if (data.delete === true) {
      const ref = await requireCurrent(getAdminApp, profile);
      const db = calendarDb(getAdminApp);
      const entries = await ref.collection(ENTRIES).get();
      for (let start = 0; start < entries.docs.length; start += 400) {
        const batch = db.batch();
        for (const entry of entries.docs.slice(start, start + 400)) batch.delete(entry.ref);
        await batch.commit();
      }
      await ref.delete();
      const next = await currentRef(getAdminApp, profile.institutionId);
      return next ? respond(next, profile) : { anniversary: null, canOrganize: canOrganize(profile) };
    }

    const title = text(data.title, 80);
    if (!title) throw new HttpsError("invalid-argument", "Ponle nombre al aniversario.");
    const startsAt = timeIn(data.startsAt);
    const endsAt = timeIn(data.endsAt);
    if (!startsAt || !endsAt || endsAt < startsAt) throw new HttpsError("invalid-argument", "Revisa las fechas: el término va después del inicio.");

    const input = Array.isArray(data.alliances) ? data.alliances : [];
    if (input.length < MIN_ALLIANCES || input.length > MAX_ALLIANCES) {
      throw new HttpsError("invalid-argument", `Arma entre ${MIN_ALLIANCES} y ${MAX_ALLIANCES} alianzas.`);
    }

    const ref = await currentRef(getAdminApp, profile.institutionId);
    const year = new Date(startsAt).getUTCFullYear();
    // A new year starts a new anniversary; the same year edits it.
    const target = ref && (await ref.get()).data()?.year === year
      ? ref
      : calendarDb(getAdminApp).collection(COLLECTION).doc(`${profile.institutionId}__${year}`);

    // Filled by the transaction when alianzas are borradas.
    let removedIds = [];
    const replaced = new Map();
    await calendarDb(getAdminApp).runTransaction(async (tx) => {
      replaced.clear();
      removedIds = [];
      const doc = await tx.get(target);
      const current = doc.exists ? doc.data() : null;
      const before = new Map((current?.alliances || []).map(alliance => [alliance.id, alliance]));
      const taken = new Set();
      const alliances = input.map(item => {
        const name = text(item?.name, 40);
        if (!name) throw new HttpsError("invalid-argument", "Cada alianza necesita un nombre.");
        const color = COLORS.includes(item?.color) ? item.color : COLORS[0];
        const courseIds = [...new Set((Array.isArray(item?.courseIds) ? item.courseIds : []).filter(validCourse).map(course => course.trim()))];
        for (const courseId of courseIds) {
          if (taken.has(courseId)) throw new HttpsError("invalid-argument", `${courseId} está en dos alianzas.`);
          taken.add(courseId);
        }
        const id = itemId(item?.id);
        const existing = id ? before.get(id) : null;
        return {
          id: existing ? existing.id : newId(),
          name,
          theme: text(item?.theme, 60),
          color,
          emoji: emojiIn(item?.emoji),
          motto: text(item?.motto, 80),
          instagram: instagramIn(item?.instagram),
          courseIds,
          leadUids: existing?.leadUids || [],
        };
      });

      // An alianza left out is borrada: its points go, and so does its place
      // in the results (the ones below move up a place).
      const kept = new Set(alliances.map(alliance => alliance.id));
      const removed = [...before.keys()].filter(id => !kept.has(id));
      let activities = current?.activities || [];
      if (removed.length) {
        activities = activities.map(activity => {
          if (Array.isArray(activity.result) && activity.result.some(id => removed.includes(id))) {
            const order = activity.result.filter(id => kept.has(id));
            replaced.set(activity.id, { activity, order });
            return { ...activity, result: order.length ? order : null };
          }
          if (activity.result && !Array.isArray(activity.result) && removed.some(id => id in activity.result)) {
            const result = Object.fromEntries(Object.entries(activity.result).filter(([id]) => kept.has(id)));
            return { ...activity, result };
          }
          return activity;
        });
        removedIds = removed;
      }

      const fields = {
        institutionId: profile.institutionId,
        year,
        title,
        startsAt: Timestamp.fromMillis(startsAt),
        endsAt: Timestamp.fromMillis(endsAt),
        rulesUrl: httpsUrl(data.rulesUrl),
        scoreHidden: !!data.scoreHidden,
        finished: !!data.finished,
        alliances,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: profile.uid,
      };
      if (current) {
        tx.update(target, { ...fields, ...(removed.length ? { activities } : {}) });
      } else {
        tx.set(target, { ...fields, activities: [], deadlines: [], createdAt: FieldValue.serverTimestamp() });
      }
    });

    if (!removedIds.length) return respond(target, profile);
    const writes = [];
    const gone = await target.collection(ENTRIES).where("allianceId", "in", removedIds).get();
    for (const entry of gone.docs) writes.push(batch => batch.delete(entry.ref));
    // A podium result is given again with the places that are left, keeping
    // the time it was first put.
    for (const [activityId, { activity, order }] of replaced) {
      const old = await target.collection(ENTRIES).where("activityId", "==", activityId).get();
      const at = old.docs.map(entry => entry.data().createdAt).find(Boolean) || FieldValue.serverTimestamp();
      for (const entry of old.docs) if (!removedIds.includes(entry.data().allianceId)) writes.push(batch => batch.delete(entry.ref));
      order.forEach((allianceId, place) => {
        const points = (activity.points || [])[place] || 0;
        if (!points) return;
        const entry = { kind: "result", activityId, allianceId, points, reason: activity.name, createdBy: profile.uid, createdAt: at };
        writes.push(batch => batch.set(target.collection(ENTRIES).doc(), entry));
      });
    }
    const db = calendarDb(getAdminApp);
    for (let start = 0; start < writes.length; start += 400) {
      const batch = db.batch();
      for (const write of writes.slice(start, start + 400)) write(batch);
      await batch.commit();
    }
    return respond(target, profile, { rescored: true });
  });

  // Adds, edits or deletes an activity. Deleting one takes its points away.
  const saveAnniversaryActivity = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const ref = await requireCurrent(getAdminApp, profile);
    const data = request.data || {};
    const id = itemId(data.id);
    const db = calendarDb(getAdminApp);

    if (data.delete) {
      if (!id) throw new HttpsError("invalid-argument", "Falta la actividad.");
      const entries = await ref.collection(ENTRIES).where("activityId", "==", id).get();
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        tx.update(ref, { activities: (doc.data().activities || []).filter(activity => activity.id !== id), updatedAt: FieldValue.serverTimestamp() });
        for (const entry of entries.docs) tx.delete(entry.ref);
      });
      return respond(ref, profile, { rescored: true });
    }

    let staleEntries = null;
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const activities = doc.data().activities || [];
      const index = id ? activities.findIndex(activity => activity.id === id) : -1;
      if (id && index < 0) throw new HttpsError("not-found", "Esa actividad ya no existe.");
      if (index < 0 && activities.length >= MAX_ACTIVITIES) throw new HttpsError("resource-exhausted", "Llegaste al máximo de actividades.");
      const activity = activityIn(data, index >= 0 ? activities[index] : null);
      // A changed scoring mode drops the old result's points.
      if (index >= 0 && activities[index].mode !== activity.mode) staleEntries = activity.id;
      const next = [...activities];
      if (index >= 0) next[index] = activity;
      else next.push(activity);
      tx.update(ref, { activities: next, updatedAt: FieldValue.serverTimestamp() });
    });
    if (staleEntries) {
      const entries = await ref.collection(ENTRIES).where("activityId", "==", staleEntries).get();
      await Promise.all(entries.docs.map(entry => entry.ref.delete()));
    }
    return respond(ref, profile, { rescored: !!staleEntries });
  });

  // "Cargar actividades típicas": adds the presets the anniversary lacks.
  const addAnniversaryPresets = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const ref = await requireCurrent(getAdminApp, profile);
    await calendarDb(getAdminApp).runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const activities = doc.data().activities || [];
      const names = new Set(activities.map(activity => activity.name.toLocaleLowerCase("es")));
      const added = PRESETS
        .filter(preset => !names.has(preset.name.toLocaleLowerCase("es")))
        .map(preset => activityIn(preset, null))
        .slice(0, Math.max(0, MAX_ACTIVITIES - activities.length));
      tx.update(ref, { activities: [...activities, ...added], updatedAt: FieldValue.serverTimestamp() });
    });
    return respond(ref, profile);
  });

  // Puts (or clears) an activity's result and rewrites its points: by podium,
  // the alianzas in order (1° first); by hand, the points of each alianza.
  const setAnniversaryResult = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const ref = await requireCurrent(getAdminApp, profile);
    const data = request.data || {};
    const activityId = itemId(data.activityId);
    if (!activityId) throw new HttpsError("invalid-argument", "Falta la actividad.");
    const db = calendarDb(getAdminApp);
    const old = await ref.collection(ENTRIES).where("activityId", "==", activityId).get();

    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const anniversary = doc.data();
      const activities = anniversary.activities || [];
      const index = activities.findIndex(activity => activity.id === activityId);
      if (index < 0) throw new HttpsError("not-found", "Esa actividad ya no existe.");
      const activity = activities[index];
      const allianceIds = (anniversary.alliances || []).map(alliance => alliance.id);

      let result = null;
      const entries = [];
      if (activity.mode === "podium" && Array.isArray(data.order) && data.order.length) {
        const order = [...new Set(data.order.filter(id => allianceIds.includes(id)))];
        if (order.length !== data.order.length) throw new HttpsError("invalid-argument", "Revisa el orden de las alianzas.");
        result = order;
        order.forEach((allianceId, place) => {
          const points = activity.points[place] || 0;
          if (points) entries.push({ allianceId, points });
        });
      } else if (activity.mode === "manual" && data.points && typeof data.points === "object") {
        result = {};
        for (const allianceId of allianceIds) {
          const points = pointsIn(data.points[allianceId] ?? 0);
          if (points === null) throw new HttpsError("invalid-argument", "Revisa los puntos.");
          result[allianceId] = points;
          if (points) entries.push({ allianceId, points });
        }
      }

      for (const entry of old.docs) tx.delete(entry.ref);
      for (const entry of entries) {
        tx.set(ref.collection(ENTRIES).doc(), {
          kind: "result",
          activityId,
          allianceId: entry.allianceId,
          points: entry.points,
          reason: activity.name,
          createdBy: profile.uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      const next = [...activities];
      next[index] = { ...activity, result, resultAt: result ? Timestamp.now() : null };
      tx.update(ref, { activities: next, updatedAt: FieldValue.serverTimestamp() });
    });
    return respond(ref, profile, { rescored: true });
  });

  // An addition or deduction with its reason, or deleting one made by mistake.
  const saveAnniversaryEntry = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const ref = await requireCurrent(getAdminApp, profile);
    const data = request.data || {};

    if (data.deleteId) {
      const id = itemId(data.deleteId);
      const entry = id ? await ref.collection(ENTRIES).doc(id).get() : null;
      if (!entry?.exists || entry.data().kind !== "adjust") throw new HttpsError("not-found", "Ese movimiento no se puede borrar.");
      await entry.ref.delete();
      return respond(ref, profile, { rescored: true });
    }

    const anniversary = (await ref.get()).data();
    const allianceId = itemId(data.allianceId);
    if (!allianceId || !(anniversary.alliances || []).some(alliance => alliance.id === allianceId)) {
      throw new HttpsError("invalid-argument", "Elige la alianza.");
    }
    const points = pointsIn(data.points);
    if (!points) throw new HttpsError("invalid-argument", "Escribe cuántos puntos suma o descuenta.");
    const reason = text(data.reason, 160);
    if (reason.length < 3) throw new HttpsError("invalid-argument", "Escribe el motivo: las bases piden justificar cada descuento.");
    await ref.collection(ENTRIES).add({
      kind: "adjust",
      activityId: null,
      allianceId,
      points,
      reason,
      createdBy: profile.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return respond(ref, profile, { rescored: true });
  });

  // Adds, edits or deletes a deadline. Its reminders go out a day and two
  // hours before (remindAnniversaryDeadlines).
  const saveAnniversaryDeadline = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const ref = await requireCurrent(getAdminApp, profile);
    const data = request.data || {};
    const id = itemId(data.id);

    await calendarDb(getAdminApp).runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const deadlines = doc.data().deadlines || [];
      if (data.delete) {
        tx.update(ref, { deadlines: deadlines.filter(deadline => deadline.id !== id), updatedAt: FieldValue.serverTimestamp() });
        return;
      }
      const title = text(data.title, 100);
      if (!title) throw new HttpsError("invalid-argument", "Escribe qué hay que entregar.");
      const dueAt = timeIn(data.dueAt);
      if (!dueAt) throw new HttpsError("invalid-argument", "Elige la fecha del plazo.");
      const index = id ? deadlines.findIndex(deadline => deadline.id === id) : -1;
      if (id && index < 0) throw new HttpsError("not-found", "Ese plazo ya no existe.");
      if (index < 0 && deadlines.length >= MAX_DEADLINES) throw new HttpsError("resource-exhausted", "Llegaste al máximo de plazos.");
      const previous = index >= 0 ? deadlines[index] : null;
      const moved = !previous || millis(previous.dueAt) !== dueAt;
      const deadline = {
        id: previous?.id || newId(),
        title,
        dueAt: Timestamp.fromMillis(dueAt),
        audience: AUDIENCES.includes(data.audience) ? data.audience : "leads",
        // A new date gets its reminders again.
        remindedDay: moved ? false : !!previous.remindedDay,
        remindedSoon: moved ? false : !!previous.remindedSoon,
      };
      const next = [...deadlines];
      if (index >= 0) next[index] = deadline;
      else next.push(deadline);
      next.sort((a, b) => millis(a.dueAt) - millis(b.dueAt));
      tx.update(ref, { deadlines: next, updatedAt: FieldValue.serverTimestamp() });
    });
    return respond(ref, profile);
  });

  // A flash test: an activity that starts now and is announced by push to the
  // leads (or to every student of the alianzas). Its result goes in later, as
  // with any activity.
  const launchFlashTest = onCall({ invoker: "public", timeoutSeconds: 120 }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const ref = await requireCurrent(getAdminApp, profile);
    const data = request.data || {};
    const audience = AUDIENCES.includes(data.audience) ? data.audience : "leads";
    let activity = null;
    await calendarDb(getAdminApp).runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const activities = doc.data().activities || [];
      if (activities.length >= MAX_ACTIVITIES) throw new HttpsError("resource-exhausted", "Llegaste al máximo de actividades.");
      activity = activityIn({ ...data, group: "flash", startsAt: Date.now() }, null);
      if (!activity.text) throw new HttpsError("invalid-argument", "Escribe en qué consiste la prueba.");
      tx.update(ref, { activities: [...activities, activity], updatedAt: FieldValue.serverTimestamp() });
    });
    const anniversary = (await ref.get()).data();
    const sent = await notify(getAdminApp, await audienceUids(getAdminApp, anniversary, audience), {
      title: `Prueba flash: ${activity.name}`,
      body: activity.text.length > 170 ? `${activity.text.slice(0, 169).trimEnd()}…` : activity.text,
    });
    return { ...(await respond(ref, profile)), sent };
  });

  // The students of an alianza's courses, to choose its leads. Only name and
  // course, as the organizer of an event sees its list.
  const listAllianceCandidates = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const ref = await requireCurrent(getAdminApp, profile);
    const alliance = ((await ref.get()).data().alliances || []).find(item => item.id === request.data?.allianceId);
    if (!alliance) throw new HttpsError("not-found", "Esa alianza ya no existe.");
    const people = await studentsOf(getAdminApp, profile.institutionId, alliance.courseIds || []);
    return {
      people: people
        .map(person => ({ uid: person.uid, name: text(person.name, 80) || "Sin nombre", courseId: person.courseId }))
        .sort((a, b) => a.courseId.localeCompare(b.courseId, "es") || a.name.localeCompare(b.name, "es")),
    };
  });

  const setAllianceLeads = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireOrganizer(getAdminApp, request);
    const ref = await requireCurrent(getAdminApp, profile);
    const allianceId = itemId(request.data?.allianceId);
    const wanted = [...new Set((Array.isArray(request.data?.uids) ? request.data.uids : []).filter(uid => typeof uid === "string" && uid.length <= 128))];
    if (wanted.length > MAX_LEADS) throw new HttpsError("invalid-argument", `Cada alianza tiene hasta ${MAX_LEADS} jefes.`);

    const alliance = ((await ref.get()).data().alliances || []).find(item => item.id === allianceId);
    if (!alliance) throw new HttpsError("not-found", "Esa alianza ya no existe.");
    // Only students of the alianza's own courses.
    const allowed = new Set((await studentsOf(getAdminApp, profile.institutionId, alliance.courseIds || [])).map(person => person.uid));
    if (wanted.some(uid => !allowed.has(uid))) throw new HttpsError("invalid-argument", "Los jefes tienen que ser de un curso de la alianza.");

    await calendarDb(getAdminApp).runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const alliances = (doc.data().alliances || []).map(item => (item.id === allianceId ? { ...item, leadUids: wanted } : item));
      tx.update(ref, { alliances, updatedAt: FieldValue.serverTimestamp() });
    });
    return respond(ref, profile);
  });

  // Every 30 minutes: deadlines due within a day, and within two hours, get
  // their reminder once each.
  const remindAnniversaryDeadlines = onSchedule({ schedule: "every 30 minutes", timeZone: TIME_ZONE, timeoutSeconds: 120 }, async () => {
    const now = Date.now();
    const snapshot = await calendarDb(getAdminApp).collection(COLLECTION).where("finished", "==", false).get();
    let sent = 0;
    for (const doc of snapshot.docs) {
      try {
        const anniversary = doc.data();
        const deadlines = anniversary.deadlines || [];
        let changed = false;
        const next = [];
        for (const deadline of deadlines) {
          const dueAt = millis(deadline.dueAt);
          const left = dueAt - now;
          const item = { ...deadline };
          let message = null;
          if (left > 0 && left <= SOON_MS && !deadline.remindedSoon) {
            message = { title: "Plazo en menos de 2 horas", body: `${deadline.title} · ${whenText(dueAt)}.` };
            item.remindedSoon = true;
            item.remindedDay = true;
          } else if (left > SOON_MS && left <= DAY_MS && !deadline.remindedDay) {
            message = { title: "Plazo mañana", body: `${deadline.title} · ${whenText(dueAt)}.` };
            item.remindedDay = true;
          }
          if (message) {
            sent += await notify(getAdminApp, await audienceUids(getAdminApp, anniversary, deadline.audience), message);
            changed = true;
          }
          next.push(item);
        }
        if (changed) await doc.ref.update({ deadlines: next });
      } catch (error) {
        console.error("remindAnniversaryDeadlines", doc.id, error.message);
      }
    }
    console.log("remindAnniversaryDeadlines", { anniversaries: snapshot.size, sent });
  });

  return {
    getAnniversary,
    listAnniversaryCourses,
    saveAnniversary,
    saveAnniversaryActivity,
    addAnniversaryPresets,
    setAnniversaryResult,
    saveAnniversaryEntry,
    saveAnniversaryDeadline,
    launchFlashTest,
    listAllianceCandidates,
    setAllianceLeads,
    remindAnniversaryDeadlines,
  };
}

module.exports = { build, announceToAlliances, PRESETS, COLORS };
