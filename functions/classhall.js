const { randomInt } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { findSubject, subjectKey } = require("./subjects");

// ClassHall: one Hall per subject and course. Teachers create it and hand
// out its code; students of that course join with the code.

const TEACHER_ROLES = ["Profesor", "Admin", "HNT"];
const THEMES = [
  "math", "geometry", "physics", "biology", "english", "languageArts", "writing",
  "socialStudies", "geography", "read", "backToSchool", "hobby", "gameNight", "sailing",
];

// No 0/O, 1/I/L: the code is read aloud and copied from a whiteboard.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 12;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_HALLS_PER_TEACHER = 40;
const MAX_COURSES = 200;

const MAX_ANNOUNCEMENTS = 50;
const MAX_EVALUATIONS = 60;
const MAX_CONTENTS = 12;
const MAX_POINTS = 999;
// An evaluation takes one class block on the course calendar.
const EVALUATION_MINUTES = 90;
// Course calendar events shown inside a Hall: from a month back.
const COURSE_EVENTS_BACK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_COURSE_EVENTS = 30;

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

// Keeps the author's line breaks, at most two blank lines in a row.
function paragraph(value, max) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
    : "";
}

function points(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(Math.max(number, 0), MAX_POINTS) : 0;
}

function millis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : null;
}

function cleanCode(value) {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

function newCode() {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

// The linked profile says who the caller is in their institution.
async function requireProfile(getAdminApp, request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const snapshot = await identityDb(getAdminApp).collection("users").doc(request.auth.uid).get();
  const profile = snapshot.data();
  if (!profile || !profile.institutionId) {
    throw new HttpsError("failed-precondition", "Primero vincula tu HaNet ID con tu institución.");
  }
  return { uid: request.auth.uid, ...profile };
}

function requireTeacher(profile) {
  if (!TEACHER_ROLES.includes(profile.role)) {
    throw new HttpsError("permission-denied", "Solo los docentes pueden crear un Hall.");
  }
}

// Count the attempt before checking it, so guessing is always paid for.
async function countAttempt(db, uid) {
  const ref = db.collection("hallCodeAttempts").doc(uid);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const previous = (await tx.get(ref)).data();
    const windowStart = previous?.windowStart?.toMillis() ?? 0;
    const inWindow = now - windowStart < ATTEMPT_WINDOW_MS;
    const count = inWindow ? previous.count || 0 : 0;

    if (count >= MAX_ATTEMPTS) {
      throw new HttpsError("resource-exhausted", "Demasiados intentos. Espera 15 minutos y vuelve a probar.");
    }
    tx.set(ref, { count: count + 1, windowStart: inWindow ? previous.windowStart : new Date(now) });
  });
}

// Finds the Hall behind a code and checks the caller may enter it.
async function resolveCode(db, profile, rawCode) {
  const code = cleanCode(rawCode);
  if (code.length !== CODE_LENGTH) {
    throw new HttpsError("invalid-argument", "El código del Hall tiene 6 letras o números.");
  }
  await countAttempt(db, profile.uid);

  const pointer = await db.collection("hallCodes").doc(code).get();
  const hallRef = pointer.exists ? db.collection("halls").doc(pointer.data().hallId) : null;
  const hall = hallRef ? await hallRef.get() : null;
  if (!hall || !hall.exists) {
    throw new HttpsError("not-found", "Ese código no corresponde a ningún Hall.");
  }

  const data = hall.data();
  const sameCourse = data.institutionId === profile.institutionId && data.courseId === profile.courseId;
  if (!sameCourse && data.teacherUid !== profile.uid) {
    throw new HttpsError("permission-denied", "Este Hall es de otro curso, así que no puedes entrar.");
  }
  return { hallRef, data };
}

// Loads a Hall the caller teaches or has joined.
async function openHall(getAdminApp, request) {
  const profile = await requireProfile(getAdminApp, request);
  const hallId = typeof request.data?.hallId === "string" ? request.data.hallId : "";
  if (!hallId || hallId.includes("/")) {
    throw new HttpsError("invalid-argument", "Falta el Hall.");
  }
  const hallRef = classhallDb(getAdminApp).collection("halls").doc(hallId);
  const hall = await hallRef.get();
  const data = hall.data();
  const isTeacher = data?.teacherUid === profile.uid;
  if (!data || (!isTeacher && !(data.memberUids || []).includes(profile.uid))) {
    throw new HttpsError("not-found", "No encontramos ese Hall entre tus clases.");
  }
  return { profile, hallRef, data, isTeacher };
}

// Only whoever teaches the Hall publishes in it; nobody else can change what they wrote.
function requireHallTeacher(isTeacher) {
  if (!isTeacher) {
    throw new HttpsError("permission-denied", "Solo el docente del Hall puede publicar aquí.");
  }
}

function childId(value) {
  return typeof value === "string" && value && !value.includes("/") ? value : null;
}

function announcementOut(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    body: data.body,
    authorName: data.authorName,
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
  };
}

function evaluationOut(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    title: data.title,
    date: millis(data.date),
    oa: data.oa || "",
    exigency: data.exigency ?? null,
    contents: data.contents || [],
    authorName: data.authorName,
    updatedAt: millis(data.updatedAt) ?? millis(data.createdAt),
  };
}

// The course calendar shows each evaluation, written by the backend and
// marked as the Hall's so the course's editors cannot change it.
function calendarRef(getAdminApp, hall, hallId, evaluationId) {
  return calendarDb(getAdminApp).collection(`HNC-LCH.${hall.courseId}`).doc(`hall-${hallId}-${evaluationId}`);
}

function build(getAdminApp) {
  const listMyHalls = onCall(async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const halls = classhallDb(getAdminApp).collection("halls");
    const [joined, taught] = await Promise.all([
      halls.where("memberUids", "array-contains", profile.uid).get(),
      halls.where("teacherUid", "==", profile.uid).get(),
    ]);

    const byId = new Map();
    for (const doc of [...taught.docs, ...joined.docs]) {
      if (byId.has(doc.id)) continue;
      const data = doc.data();
      const isTeacher = data.teacherUid === profile.uid;
      byId.set(doc.id, {
        id: doc.id,
        subject: data.subject,
        courseId: data.courseId,
        teacherName: data.teacherName,
        theme: data.theme,
        isTeacher,
        // Only whoever teaches the Hall can read its code and size.
        code: isTeacher ? data.code : null,
        memberCount: isTeacher ? (data.memberUids || []).length : null,
      });
    }

    // The card says when the Hall's next evaluation comes up.
    const now = Timestamp.now();
    await Promise.all([...byId.values()].map(async (hall) => {
      const next = await halls.doc(hall.id).collection("evaluations")
        .where("date", ">=", now).orderBy("date", "asc").limit(1).get();
      const data = next.docs[0]?.data();
      hall.nextEvaluation = data ? { title: data.title, date: millis(data.date) } : null;
    }));

    return {
      halls: [...byId.values()].sort((a, b) => a.subject.localeCompare(b.subject, "es")),
      canCreate: TEACHER_ROLES.includes(profile.role),
    };
  });

  // Tells which Hall a code opens, so the student confirms before joining.
  const checkHallCode = onCall(async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const { hallRef, data } = await resolveCode(classhallDb(getAdminApp), profile, request.data?.code);
    return {
      hallId: hallRef.id,
      subject: data.subject,
      courseId: data.courseId,
      alreadyMember: (data.memberUids || []).includes(profile.uid),
    };
  });

  const joinHall = onCall(async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const { hallRef, data } = await resolveCode(classhallDb(getAdminApp), profile, request.data?.code);

    if (data.teacherUid !== profile.uid) {
      await hallRef.update({ memberUids: FieldValue.arrayUnion(profile.uid) });
    }
    return { hallId: hallRef.id, subject: data.subject };
  });

  const createHall = onCall(async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    requireTeacher(profile);

    // A subject of the shared catalog is stored by its catalog name, so the
    // Hall and the course Calendar call it the same.
    const typed = text(request.data?.subject, 60);
    const subject = findSubject(typed)?.name || typed;
    const courseId = text(request.data?.courseId, 64);
    const theme = THEMES.includes(request.data?.theme) ? request.data.theme : "backToSchool";

    if (subject.length < 2) {
      throw new HttpsError("invalid-argument", "Escribe el nombre de la asignatura.");
    }
    if (!courseId || courseId.includes("/")) {
      throw new HttpsError("invalid-argument", "Elige el curso de este Hall.");
    }

    const db = classhallDb(getAdminApp);
    const courseExists = await identityDb(getAdminApp)
      .collection("institutions").doc(profile.institutionId)
      .collection("roster").where("curso", "==", courseId).limit(1).get();
    if (courseExists.empty) {
      throw new HttpsError("not-found", "Ese curso no está en la nómina de tu institución.");
    }

    const mine = await db.collection("halls").where("teacherUid", "==", profile.uid).get();
    if (mine.size >= MAX_HALLS_PER_TEACHER) {
      throw new HttpsError("resource-exhausted", "Llegaste al máximo de Halls por docente.");
    }
    if (mine.docs.some(doc => doc.data().courseId === courseId && subjectKey(doc.data().subject) === subjectKey(subject))) {
      throw new HttpsError("already-exists", "Ya tienes un Hall de esa asignatura para ese curso.");
    }

    // Profiles made by hand have no name; the sign-up one is the fallback.
    let teacherName = text(profile.name, 80);
    if (!teacherName) {
      const account = await identityDb(getAdminApp).collection("accounts").doc(profile.uid).get();
      teacherName = text(account.data()?.fullName, 80) || "Docente";
    }

    const hallRef = db.collection("halls").doc();
    // A fresh code can collide with an existing one; create() fails and we draw again.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newCode();
      const batch = db.batch();
      batch.create(db.collection("hallCodes").doc(code), { hallId: hallRef.id });
      batch.create(hallRef, {
        institutionId: profile.institutionId,
        courseId,
        subject,
        theme,
        code,
        teacherUid: profile.uid,
        teacherName,
        subjectId: subjectKey(subject),
        memberUids: [],
        createdAt: FieldValue.serverTimestamp(),
      });
      try {
        await batch.commit();
        return { hallId: hallRef.id, code };
      } catch (error) {
        if (error.code !== 6) throw error; // 6 = ALREADY_EXISTS
      }
    }
    throw new HttpsError("unavailable", "No pudimos generar el código. Inténtalo nuevamente.");
  });

  // Courses of the caller's institution, for the form that creates a Hall.
  const listHallCourses = onCall(async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    requireTeacher(profile);

    const roster = await identityDb(getAdminApp)
      .collection("institutions").doc(profile.institutionId)
      .collection("roster").select("curso").get();
    const courses = [...new Set(roster.docs.map(doc => doc.data().curso).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es"))
      .slice(0, MAX_COURSES);
    return { courses };
  });

  // The inside of a Hall: its announcements and evaluations.
  const getHall = onCall({ invoker: "public" }, async (request) => {
    const { profile, hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    const [announcements, evaluations, calendar] = await Promise.all([
      hallRef.collection("announcements").orderBy("createdAt", "desc").limit(MAX_ANNOUNCEMENTS).get(),
      hallRef.collection("evaluations").orderBy("date", "asc").limit(MAX_EVALUATIONS).get(),
      calendarDb(getAdminApp).collection(`HNC-LCH.${data.courseId}`)
        .where("startDate", ">=", Timestamp.fromMillis(Date.now() - COURSE_EVENTS_BACK_MS)).get(),
    ]);

    // What the course Calendar has for this subject, written by the course
    // (the Hall's own evaluations are already listed above).
    const key = data.subjectId || subjectKey(data.subject);
    const courseEvents = calendar.docs
      .filter(doc => !doc.data().source && subjectKey(doc.data().subject) === key)
      .map(doc => {
        const event = doc.data();
        return {
          id: doc.id,
          title: event.title || "Sin título",
          type: event.type || "",
          startDate: millis(event.startDate),
          cancelled: event.cancelled === true,
          authorName: event.authorName || "",
        };
      })
      .sort((a, b) => a.startDate - b.startDate)
      .slice(0, MAX_COURSE_EVENTS);
    return {
      hall: {
        id: hallRef.id,
        subject: data.subject,
        courseId: data.courseId,
        teacherName: data.teacherName,
        theme: data.theme,
        isTeacher,
        code: isTeacher ? data.code : null,
        memberCount: isTeacher ? (data.memberUids || []).length : null,
      },
      announcements: announcements.docs.map(announcementOut),
      evaluations: evaluations.docs.map(evaluationOut),
      courseEvents,
      viewerUid: profile.uid,
    };
  });

  // The teacher renames the Hall's subject or changes its cover. The course
  // stays: moving it would move its students and its Calendar.
  const updateHall = onCall({ invoker: "public" }, async (request) => {
    const { profile, hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);

    const typed = text(request.data?.subject, 60);
    const subject = findSubject(typed)?.name || typed;
    const theme = THEMES.includes(request.data?.theme) ? request.data.theme : data.theme;
    if (subject.length < 2) {
      throw new HttpsError("invalid-argument", "Escribe el nombre de la asignatura.");
    }

    const key = subjectKey(subject);
    if (key !== (data.subjectId || subjectKey(data.subject))) {
      const mine = await classhallDb(getAdminApp).collection("halls").where("teacherUid", "==", profile.uid).get();
      if (mine.docs.some(doc => doc.id !== hallRef.id && doc.data().courseId === data.courseId && subjectKey(doc.data().subject) === key)) {
        throw new HttpsError("already-exists", "Ya tienes un Hall de esa asignatura para ese curso.");
      }
    }

    await hallRef.update({ subject, subjectId: key, theme, updatedAt: FieldValue.serverTimestamp() });

    // The Hall's evaluations on the course Calendar carry the subject in
    // their title; they follow the new name.
    if (subject !== data.subject) {
      const evaluations = await hallRef.collection("evaluations").get();
      const refs = evaluations.docs.map(doc => calendarRef(getAdminApp, data, hallRef.id, doc.id));
      const events = refs.length ? await calendarDb(getAdminApp).getAll(...refs) : [];
      const batch = calendarDb(getAdminApp).batch();
      events.forEach((event, index) => {
        if (!event.exists) return;
        batch.update(event.ref, {
          title: `${evaluations.docs[index].data().title} · ${subject}`.slice(0, 120),
          subject: subject.slice(0, 60),
        });
      });
      if (events.some(event => event.exists)) await batch.commit();
    }

    return { hallId: hallRef.id, subject, theme };
  });

  const saveHallAnnouncement = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);

    const body = paragraph(request.data?.body, 2000);
    if (!body) {
      throw new HttpsError("invalid-argument", "Escribe el anuncio.");
    }

    const existingId = childId(request.data?.announcementId);
    if (existingId) {
      const ref = hallRef.collection("announcements").doc(existingId);
      if (!(await ref.get()).exists) {
        throw new HttpsError("not-found", "Ese anuncio ya no existe.");
      }
      await ref.update({ body, updatedAt: FieldValue.serverTimestamp() });
      return { announcementId: existingId };
    }

    const ref = hallRef.collection("announcements").doc();
    await ref.set({ body, authorName: data.teacherName, createdAt: FieldValue.serverTimestamp() });
    return { announcementId: ref.id };
  });

  const deleteHallAnnouncement = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);
    const id = childId(request.data?.announcementId);
    if (!id) throw new HttpsError("invalid-argument", "Falta el anuncio.");
    await hallRef.collection("announcements").doc(id).delete();
    return { ok: true };
  });

  const saveHallEvaluation = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);

    const title = text(request.data?.title, 80);
    const oa = text(request.data?.oa, 40);
    const date = Number(request.data?.date);
    const rawExigency = request.data?.exigency;
    const exigency = rawExigency === null || rawExigency === undefined || rawExigency === "" ? null : Math.round(Number(rawExigency));
    const contents = (Array.isArray(request.data?.contents) ? request.data.contents : [])
      .slice(0, MAX_CONTENTS)
      .map(row => ({
        name: text(row?.name, 80),
        detail: text(row?.detail, 160),
        con: points(row?.con),
        apl: points(row?.apl),
        com: points(row?.com),
      }))
      .filter(row => row.name);

    if (title.length < 2) {
      throw new HttpsError("invalid-argument", "Escribe el nombre de la evaluación.");
    }
    if (!Number.isFinite(date) || date <= 0) {
      throw new HttpsError("invalid-argument", "Elige el día de la evaluación.");
    }
    if (exigency !== null && (!Number.isFinite(exigency) || exigency < 1 || exigency > 100)) {
      throw new HttpsError("invalid-argument", "La exigencia va de 1 a 100 %.");
    }

    const existingId = childId(request.data?.evaluationId);
    const ref = existingId ? hallRef.collection("evaluations").doc(existingId) : hallRef.collection("evaluations").doc();
    if (existingId && !(await ref.get()).exists) {
      throw new HttpsError("not-found", "Esa evaluación ya no existe.");
    }
    if (!existingId) {
      const count = await hallRef.collection("evaluations").count().get();
      if (count.data().count >= MAX_EVALUATIONS) {
        throw new HttpsError("resource-exhausted", "Este Hall llegó al máximo de evaluaciones.");
      }
    }

    const start = Timestamp.fromMillis(date);
    const fields = { title, date: start, oa, exigency, contents, authorName: data.teacherName };
    if (existingId) {
      await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
    } else {
      await ref.set({ ...fields, createdAt: FieldValue.serverTimestamp() });
    }

    const total = contents.reduce((sum, row) => sum + row.con + row.apl + row.com, 0);
    const summary = [
      oa && `Objetivo: ${oa}.`,
      total > 0 && `Total ${total} puntos.`,
      exigency !== null && `Exigencia ${exigency} %.`,
      contents.length > 0 && `Contenidos: ${contents.map(row => row.name).join(", ")}.`,
    ].filter(Boolean).join("\n");

    const event = calendarRef(getAdminApp, data, hallRef.id, ref.id);
    await event.set({
      title: `${title} · ${data.subject}`.slice(0, 120),
      description: summary || `Evaluación del Hall de ${data.subject}.`,
      startDate: start,
      endDate: Timestamp.fromMillis(date + EVALUATION_MINUTES * 60 * 1000),
      location: "Sala de clases",
      subject: data.subject.slice(0, 60),
      type: "Evaluación",
      verificationRequested: false,
      verified: true,
      verifier: data.teacherName,
      authorUid: data.teacherUid,
      authorName: data.teacherName,
      source: "classhall",
      hallId: hallRef.id,
      evaluationId: ref.id,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { evaluationId: ref.id };
  });

  const deleteHallEvaluation = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);
    const id = childId(request.data?.evaluationId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la evaluación.");
    await Promise.all([
      hallRef.collection("evaluations").doc(id).delete(),
      calendarRef(getAdminApp, data, hallRef.id, id).delete(),
    ]);
    return { ok: true };
  });

  return {
    listMyHalls, checkHallCode, joinHall, createHall, listHallCourses,
    getHall, updateHall, saveHallAnnouncement, deleteHallAnnouncement, saveHallEvaluation, deleteHallEvaluation,
  };
}

module.exports = { build };
