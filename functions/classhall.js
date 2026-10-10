const { randomInt } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

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

function classhallDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-classhall");
}

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function text(value, max) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
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

    const subject = text(request.data?.subject, 60);
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
    if (mine.docs.some(doc => doc.data().courseId === courseId && doc.data().subject.toLowerCase() === subject.toLowerCase())) {
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

  return { listMyHalls, checkHallCode, joinHall, createHall, listHallCourses };
}

module.exports = { build };
