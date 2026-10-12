const { randomInt, randomUUID } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { applicationDefault } = require("firebase-admin/app");
const { pdfWords, photoWords, docxWords, parseSpecTable } = require("./spec-table");
const { PLANS, findSubject, subjectKey } = require("./subjects");

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
// A specification table names its own skill columns; these are the usual ones.
const DEFAULT_SKILLS = ["Conocimiento", "Aplicación", "Comprensión"];
const MAX_SKILLS = 8;
const MAX_OBJECTIVES = 6;
// An evaluation takes one class block on the course calendar.
const EVALUATION_MINUTES = 90;
// Course calendar events shown inside a Hall: from a month back.
const COURSE_EVENTS_BACK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_COURSE_EVENTS = 30;

// Documents a teacher shares in a Hall. The app uploads to its own staging
// folder (storage.rules) and attachHallDocument moves the file into the Hall;
// nobody reads classhall/ directly, only through the token URL getHall hands
// to the Hall's members.
const BUCKET = "hanet-edu.firebasestorage.app";
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENTS = 100;
// Scans of specification tables per teacher and day, to stay within the free
// Cloud Vision quota (1,000 photos a month).
const MAX_SCANS_PER_DAY = 20;
// Tasks: the teacher publishes one with a due date and students hand it in
// with files, photos or links. Teachers mark a submission as reviewed and
// can leave a comment; there are no grades (the school keeps them elsewhere).
const MAX_TASKS = 80;
const MAX_TASK_SUMMARIES = 40;
const MAX_SUBMISSION_ITEMS = 6;
const MAX_SUBMISSIONS_LISTED = 300;
// Photos from phones also come as HEIC or WebP.
const SUBMISSION_IMAGE_TYPES = { "image/heic": "image", "image/heif": "image", "image/webp": "image" };
const DOCUMENT_TYPES = {
  "application/pdf": "pdf",
  "application/msword": "word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.ms-powerpoint": "powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "powerpoint",
  "application/vnd.ms-excel": "excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "image/jpeg": "image",
  "image/png": "image",
};

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

// Halls made before there were kinds are Plan común.
function hallPlan(data) {
  return PLANS.includes(data?.plan) ? data.plan : "comun";
}

// A Plan común Hall belongs to its whole course: every account of it is in.
function inCourse(data, profile) {
  return data.institutionId === profile.institutionId && data.courseId === profile.courseId;
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
  // Plan común stays within its course; electivos and dominios gather
  // students of several courses of the same institution.
  const allowed = hallPlan(data) === "comun" ? inCourse(data, profile) : data.institutionId === profile.institutionId;
  if (!allowed && data.teacherUid !== profile.uid) {
    throw new HttpsError(
      "permission-denied",
      hallPlan(data) === "comun" ? "Este Hall es de otro curso, así que no puedes entrar." : "Este Hall es de otra institución.",
    );
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
  const member = (data?.memberUids || []).includes(profile.uid) || (hallPlan(data) === "comun" && inCourse(data, profile));
  if (!data || (!isTeacher && !member)) {
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

function documentUrl(data) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(data.path)}?alt=media&token=${data.token}`;
}

function documentOut(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name,
    kind: DOCUMENT_TYPES[data.contentType] || "file",
    size: data.size || 0,
    url: documentUrl(data),
    authorName: data.authorName,
    announcementId: data.announcementId || null,
    evaluationId: data.evaluationId || null,
    taskId: data.taskId || null,
    createdAt: millis(data.createdAt),
  };
}

// File names keep their letters and extension, without path characters.
function safeFileName(value) {
  const name = text(value, 120).replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, "-").replace(/^\.+/, "");
  return name || "documento";
}

// Removes documents (file and record) from a Hall.
async function removeDocuments(getAdminApp, docs) {
  const bucket = getStorage(getAdminApp()).bucket(BUCKET);
  await Promise.all(docs.map(async (doc) => {
    await bucket.file(doc.data().path).delete({ ignoreNotFound: true });
    await doc.ref.delete();
  }));
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

// Evaluations saved before the table had its own columns kept three fixed
// ones (con, apl, com) and a single objective code.
function evaluationTable(data) {
  const skills = Array.isArray(data.skills) && data.skills.length ? data.skills : DEFAULT_SKILLS;
  const contents = (data.contents || []).map(row => ({
    name: row.name || "",
    detail: row.detail || "",
    points: Array.isArray(row.points) ? row.points : [row.con || 0, row.apl || 0, row.com || 0],
  }));
  const objectives = Array.isArray(data.objectives) ? data.objectives : data.oa ? [{ code: data.oa, text: "" }] : [];
  return { skills, contents, objectives };
}

function evaluationOut(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    title: data.title,
    date: millis(data.date),
    exigency: data.exigency ?? null,
    ...evaluationTable(data),
    prep: data.prep || "",
    authorName: data.authorName,
    updatedAt: millis(data.updatedAt) ?? millis(data.createdAt),
  };
}

// The course calendar shows each evaluation, written by the backend and
// marked as the Hall's so the course's editors cannot change it.
function calendarRef(getAdminApp, courseId, hallId, evaluationId) {
  return calendarDb(getAdminApp).collection(`HNC-LCH.${courseId}`).doc(`hall-${hallId}-${evaluationId}`);
}

// Courses whose Calendar shows the Hall's evaluations: its own, plus those
// of the students who joined an electivo or dominio from other courses.
async function calendarCourses(getAdminApp, data) {
  const courses = new Set([data.courseId]);
  const uids = hallPlan(data) === "comun" ? [] : (data.memberUids || []);
  if (uids.length) {
    const users = identityDb(getAdminApp).collection("users");
    const profiles = await identityDb(getAdminApp).getAll(...uids.map(uid => users.doc(uid)));
    for (const profile of profiles) {
      const courseId = profile.data()?.courseId;
      if (typeof courseId === "string" && courseId && !courseId.includes("/")) courses.add(courseId);
    }
  }
  return [...courses];
}

// Students of a Plan común Hall: its course on the roster.
async function courseSize(getAdminApp, data) {
  const count = await identityDb(getAdminApp)
    .collection("institutions").doc(data.institutionId)
    .collection("roster").where("curso", "==", data.courseId).count().get();
  return count.data().count;
}

function hallOut(doc, profile, extra = {}) {
  const data = doc.data();
  const isTeacher = data.teacherUid === profile.uid;
  return {
    id: doc.id,
    subject: data.subject,
    courseId: data.courseId,
    teacherName: data.teacherName,
    theme: data.theme,
    plan: hallPlan(data),
    isTeacher,
    // Only whoever teaches the Hall can read its code and size.
    code: isTeacher ? data.code : null,
    memberCount: isTeacher ? (data.memberUids || []).length : null,
    ...extra,
  };
}

// Profiles made by hand have no name; the sign-up one is the fallback.
async function displayName(getAdminApp, profile, fallback) {
  const name = text(profile.name, 80);
  if (name) return name;
  const account = await identityDb(getAdminApp).collection("accounts").doc(profile.uid).get();
  return text(account.data()?.fullName, 80) || fallback;
}

// Students the Hall counts on: its course on the roster, or those who joined.
async function hallSize(getAdminApp, data) {
  return hallPlan(data) === "comun" ? courseSize(getAdminApp, data) : (data.memberUids || []).length;
}

// Only http and https links, so a submission never carries a script or an app link.
function cleanLink(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 600) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function taskOut(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    title: data.title,
    instructions: data.instructions || "",
    dueAt: millis(data.dueAt),
    acceptLate: data.acceptLate === true,
    authorName: data.authorName,
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
  };
}

function submissionItemOut(item) {
  if (item.kind === "link") return { id: item.id, kind: "link", name: item.name, url: item.url };
  return {
    id: item.id,
    kind: "file",
    name: item.name,
    fileKind: DOCUMENT_TYPES[item.contentType] || SUBMISSION_IMAGE_TYPES[item.contentType] || "file",
    size: item.size || 0,
    url: documentUrl(item),
  };
}

function submissionOut(doc) {
  const data = doc.data();
  return {
    uid: doc.id,
    studentName: data.studentName,
    courseId: data.courseId || "",
    items: (data.items || []).map(submissionItemOut),
    note: data.note || "",
    submittedAt: millis(data.submittedAt),
    late: data.late === true,
    reviewed: data.reviewed === true,
    feedback: data.feedback || "",
    reviewedAt: millis(data.reviewedAt),
  };
}

// The course Calendar shows each task on its due date, like an evaluation.
function taskCalendarRef(getAdminApp, courseId, hallId, taskId) {
  return calendarRef(getAdminApp, courseId, hallId, `task-${taskId}`);
}

// Removes a submission's files from Storage.
async function removeSubmissionFiles(getAdminApp, items) {
  const bucket = getStorage(getAdminApp()).bucket(BUCKET);
  await Promise.all(items.filter(item => item.kind === "file" && item.path)
    .map(item => bucket.file(item.path).delete({ ignoreNotFound: true })));
}

function build(getAdminApp) {
  const listMyHalls = onCall(async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const halls = classhallDb(getAdminApp).collection("halls");
    const [joined, taught, course] = await Promise.all([
      halls.where("memberUids", "array-contains", profile.uid).get(),
      halls.where("teacherUid", "==", profile.uid).get(),
      // The Plan común Halls of the caller's course, which nobody joins by hand.
      profile.courseId
        ? halls.where("institutionId", "==", profile.institutionId).where("courseId", "==", profile.courseId).get()
        : Promise.resolve({ docs: [] }),
    ]);

    const byId = new Map();
    const commonOfCourse = course.docs.filter(doc => hallPlan(doc.data()) === "comun");
    for (const doc of [...taught.docs, ...joined.docs, ...commonOfCourse]) {
      if (byId.has(doc.id)) continue;
      byId.set(doc.id, hallOut(doc, profile));
    }
    // A teacher's Plan común Hall counts its course on the roster.
    await Promise.all(taught.docs.filter(doc => hallPlan(doc.data()) === "comun").map(async (doc) => {
      byId.get(doc.id).memberCount = await courseSize(getAdminApp, doc.data());
    }));

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
      plan: hallPlan(data),
      alreadyMember: (data.memberUids || []).includes(profile.uid) || (hallPlan(data) === "comun" && inCourse(data, profile)),
    };
  });

  const joinHall = onCall(async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const { hallRef, data } = await resolveCode(classhallDb(getAdminApp), profile, request.data?.code);

    // In a Plan común Hall of their own course they already are.
    if (data.teacherUid !== profile.uid && !(hallPlan(data) === "comun" && inCourse(data, profile))) {
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
    const plan = PLANS.includes(request.data?.plan) ? request.data.plan : "comun";

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
        plan,
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
    const [announcements, evaluations, calendar, documents, tasks] = await Promise.all([
      hallRef.collection("announcements").orderBy("createdAt", "desc").limit(MAX_ANNOUNCEMENTS).get(),
      hallRef.collection("evaluations").orderBy("date", "asc").limit(MAX_EVALUATIONS).get(),
      calendarDb(getAdminApp).collection(`HNC-LCH.${data.courseId}`)
        .where("startDate", ">=", Timestamp.fromMillis(Date.now() - COURSE_EVENTS_BACK_MS)).get(),
      hallRef.collection("documents").orderBy("createdAt", "desc").limit(MAX_DOCUMENTS).get(),
      hallRef.collection("tasks").orderBy("dueAt", "desc").limit(MAX_TASK_SUMMARIES).get(),
    ]);

    // Each task says how it stands: for a student, their own submission;
    // for the teacher, how many handed it in.
    const taskSummaries = tasks.docs.map(taskOut);
    if (isTeacher) {
      await Promise.all(taskSummaries.map(async (task) => {
        const count = await hallRef.collection("tasks").doc(task.id).collection("submissions").count().get();
        task.submittedCount = count.data().count;
      }));
    } else if (taskSummaries.length) {
      const mine = await classhallDb(getAdminApp).getAll(...taskSummaries
        .map(task => hallRef.collection("tasks").doc(task.id).collection("submissions").doc(profile.uid)));
      mine.forEach((doc, index) => {
        const submission = doc.data();
        taskSummaries[index].mySubmission = submission
          ? { submittedAt: millis(submission.submittedAt), late: submission.late === true, reviewed: submission.reviewed === true }
          : null;
      });
    }

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
          verified: event.verified === true,
          verifier: event.verifier || null,
          verificationRequested: event.verificationRequested === true,
        };
      })
      .sort((a, b) => a.startDate - b.startDate)
      .slice(0, MAX_COURSE_EVENTS);
    const hall = hallOut({ id: hallRef.id, data: () => data }, profile);
    if (isTeacher && hall.plan === "comun") hall.memberCount = await courseSize(getAdminApp, data);
    return {
      hall,
      announcements: announcements.docs.map(announcementOut),
      evaluations: evaluations.docs.map(evaluationOut),
      courseEvents,
      documents: documents.docs.map(documentOut),
      tasks: taskSummaries,
      expectedSubmissions: isTeacher ? hall.memberCount ?? await hallSize(getAdminApp, data) : null,
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
    const plan = PLANS.includes(request.data?.plan) ? request.data.plan : hallPlan(data);
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

    await hallRef.update({ subject, subjectId: key, theme, plan, updatedAt: FieldValue.serverTimestamp() });

    // The Hall's evaluations on the course Calendar carry the subject in
    // their title; they follow the new name.
    if (subject !== data.subject) {
      const [evaluations, tasks] = await Promise.all([hallRef.collection("evaluations").get(), hallRef.collection("tasks").get()]);
      const targets = [
        ...evaluations.docs.flatMap(doc => (doc.data().calendarCourses || [data.courseId])
          .map(courseId => ({ ref: calendarRef(getAdminApp, courseId, hallRef.id, doc.id), title: doc.data().title }))),
        ...tasks.docs.flatMap(doc => (doc.data().calendarCourses || [data.courseId])
          .map(courseId => ({ ref: taskCalendarRef(getAdminApp, courseId, hallRef.id, doc.id), title: doc.data().title }))),
      ];
      const events = targets.length ? await calendarDb(getAdminApp).getAll(...targets.map(target => target.ref)) : [];
      const batch = calendarDb(getAdminApp).batch();
      events.forEach((event, index) => {
        if (!event.exists) return;
        batch.update(event.ref, {
          title: `${targets[index].title} · ${subject}`.slice(0, 120),
          subject: subject.slice(0, 60),
        });
      });
      if (events.some(event => event.exists)) await batch.commit();
    }

    return { hallId: hallRef.id, subject, theme, plan };
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
    const attached = await hallRef.collection("documents").where("announcementId", "==", id).get();
    await Promise.all([hallRef.collection("announcements").doc(id).delete(), removeDocuments(getAdminApp, attached.docs)]);
    return { ok: true };
  });

  const saveHallEvaluation = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);

    const title = text(request.data?.title, 80);
    const date = Number(request.data?.date);
    const prep = paragraph(request.data?.prep, 1500);
    const skills = (Array.isArray(request.data?.skills) ? request.data.skills : [])
      .map(skill => text(skill, 40)).filter(Boolean).slice(0, MAX_SKILLS);
    const objectives = (Array.isArray(request.data?.objectives) ? request.data.objectives : [])
      .map(objective => ({ code: text(objective?.code, 40), text: paragraph(objective?.text, 600) }))
      .filter(objective => objective.code || objective.text)
      .slice(0, MAX_OBJECTIVES);
    const rawExigency = request.data?.exigency;
    const exigency = rawExigency === null || rawExigency === undefined || rawExigency === "" ? null : Math.round(Number(rawExigency));
    const contents = (Array.isArray(request.data?.contents) ? request.data.contents : [])
      .slice(0, MAX_CONTENTS)
      .map(row => ({
        name: text(row?.name, 80),
        detail: text(row?.detail, 160),
        // One value per skill column, in the same order.
        points: skills.map((_, index) => points(Array.isArray(row?.points) ? row.points[index] : 0)),
      }))
      .filter(row => row.name);

    if (title.length < 2) {
      throw new HttpsError("invalid-argument", "Escribe el nombre de la evaluación.");
    }
    if (contents.length > 0 && skills.length === 0) {
      throw new HttpsError("invalid-argument", "Agrega al menos una habilidad a la tabla.");
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
    // An evaluation the course put on its Calendar can be taken into the Hall,
    // so the teacher completes its table here; the Calendar keeps one event,
    // now the Hall's.
    const adoptedId = existingId ? null : childId(request.data?.calendarEventId);
    const adoptedRef = adoptedId ? calendarDb(getAdminApp).collection(`HNC-LCH.${data.courseId}`).doc(adoptedId) : null;
    if (adoptedRef) {
      const adopted = (await adoptedRef.get()).data();
      if (!adopted || adopted.source) {
        throw new HttpsError("not-found", "Ese evento ya no está en el Calendar del curso.");
      }
      if (subjectKey(adopted.subject) !== (data.subjectId || subjectKey(data.subject))) {
        throw new HttpsError("failed-precondition", "Ese evento es de otra asignatura.");
      }
    }

    if (!existingId) {
      const count = await hallRef.collection("evaluations").count().get();
      if (count.data().count >= MAX_EVALUATIONS) {
        throw new HttpsError("resource-exhausted", "Este Hall llegó al máximo de evaluaciones.");
      }
    }

    const start = Timestamp.fromMillis(date);
    // Electivos and dominios reach the Calendar of every course their students come from.
    const courses = await calendarCourses(getAdminApp, data);
    const previous = existingId ? (await ref.get()).data()?.calendarCourses || [data.courseId] : [];
    const fields = {
      title, date: start, exigency, skills, contents, objectives, prep,
      authorName: data.teacherName,
      calendarCourses: courses,
    };
    if (existingId) {
      // The old single objective code stops applying.
      await ref.update({ ...fields, oa: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    } else {
      await ref.set({ ...fields, createdAt: FieldValue.serverTimestamp() });
    }

    const total = contents.reduce((sum, row) => sum + row.points.reduce((rowSum, value) => rowSum + value, 0), 0);
    const summary = [
      objectives.length > 0 && `Objetivos: ${objectives.map(objective => objective.code || objective.text.slice(0, 40)).join(", ")}.`,
      total > 0 && `Total ${total} puntos.`,
      exigency !== null && `Exigencia ${exigency} %.`,
      contents.length > 0 && `Contenidos: ${contents.map(row => row.name).join(", ")}.`,
    ].filter(Boolean).join("\n");

    const event = {
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
    };
    const batch = calendarDb(getAdminApp).batch();
    for (const courseId of courses) batch.set(calendarRef(getAdminApp, courseId, hallRef.id, ref.id), event);
    if (adoptedRef) batch.delete(adoptedRef);
    // A course none of its students is in any more stops showing it.
    for (const courseId of previous.filter(courseId => !courses.includes(courseId))) {
      batch.delete(calendarRef(getAdminApp, courseId, hallRef.id, ref.id));
    }
    await batch.commit();

    return { evaluationId: ref.id };
  });

  // Takes a file the teacher uploaded to their staging folder into the Hall.
  // Attached to an announcement or as an evaluation's T.E. it replaces the
  // previous one there.
  const attachHallDocument = onCall({ invoker: "public" }, async (request) => {
    const { profile, hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);

    const uploadPath = typeof request.data?.uploadPath === "string" ? request.data.uploadPath : "";
    if (!uploadPath.startsWith(`classhall-uploads/${profile.uid}/`) || uploadPath.includes("..")) {
      throw new HttpsError("invalid-argument", "No encontramos el archivo subido.");
    }
    const announcementId = childId(request.data?.announcementId);
    const evaluationId = childId(request.data?.evaluationId);
    const taskId = childId(request.data?.taskId);
    if (taskId && !(await hallRef.collection("tasks").doc(taskId).get()).exists) {
      throw new HttpsError("not-found", "Esa tarea ya no existe.");
    }
    if (announcementId && !(await hallRef.collection("announcements").doc(announcementId).get()).exists) {
      throw new HttpsError("not-found", "Ese anuncio ya no existe.");
    }
    if (evaluationId && !(await hallRef.collection("evaluations").doc(evaluationId).get()).exists) {
      throw new HttpsError("not-found", "Esa evaluación ya no existe.");
    }
    const count = await hallRef.collection("documents").count().get();
    if (count.data().count >= MAX_DOCUMENTS) {
      throw new HttpsError("resource-exhausted", "Este Hall llegó al máximo de documentos.");
    }

    const bucket = getStorage(getAdminApp()).bucket(BUCKET);
    const upload = bucket.file(uploadPath);
    const [exists] = await upload.exists();
    if (!exists) throw new HttpsError("not-found", "No encontramos el archivo subido.");
    const [metadata] = await upload.getMetadata();
    const size = Number(metadata.size) || 0;
    if (!DOCUMENT_TYPES[metadata.contentType] || size <= 0 || size > MAX_DOCUMENT_BYTES) {
      await upload.delete({ ignoreNotFound: true });
      throw new HttpsError("invalid-argument", "Sube un PDF, Word, PowerPoint, Excel o imagen de hasta 10 MB.");
    }

    const docRef = hallRef.collection("documents").doc();
    const name = safeFileName(request.data?.name);
    const path = `classhall/${hallRef.id}/${docRef.id}/${name}`;
    const token = randomUUID();
    await upload.move(path);
    await bucket.file(path).setMetadata({
      contentType: metadata.contentType,
      contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      metadata: { firebaseStorageDownloadTokens: token },
    });

    // One attachment per announcement and task, and one T.E. per evaluation.
    const previous = announcementId
      ? await hallRef.collection("documents").where("announcementId", "==", announcementId).get()
      : evaluationId ? await hallRef.collection("documents").where("evaluationId", "==", evaluationId).get()
        : taskId ? await hallRef.collection("documents").where("taskId", "==", taskId).get() : null;
    if (previous) await removeDocuments(getAdminApp, previous.docs);

    await docRef.set({
      name,
      contentType: metadata.contentType,
      size,
      path,
      token,
      authorName: data.teacherName,
      announcementId: announcementId || null,
      evaluationId: evaluationId || null,
      taskId: taskId || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return documentOut(await docRef.get());
  });

  // Reads a specification table the teacher uploaded (PDF, Word or photo) into a
  // draft for the evaluation form. The file stays in their upload folder, so
  // after saving it can become the evaluation's T.E.
  const scanSpecTable = onCall({ invoker: "public", memory: "512MiB", timeoutSeconds: 60 }, async (request) => {
    const { profile, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);

    const uploadPath = typeof request.data?.uploadPath === "string" ? request.data.uploadPath : "";
    if (!uploadPath.startsWith(`classhall-uploads/${profile.uid}/`) || uploadPath.includes("..")) {
      throw new HttpsError("invalid-argument", "No encontramos el archivo subido.");
    }

    const db = classhallDb(getAdminApp);
    const today = new Date().toISOString().slice(0, 10);
    const counterRef = db.collection("scanCounts").doc(profile.uid);
    await db.runTransaction(async (tx) => {
      const counter = (await tx.get(counterRef)).data();
      const count = counter?.day === today ? counter.count || 0 : 0;
      if (count >= MAX_SCANS_PER_DAY) {
        throw new HttpsError("resource-exhausted", "Llegaste al máximo de escaneos de hoy. Completa la tabla a mano o vuelve mañana.");
      }
      tx.set(counterRef, { day: today, count: count + 1 });
    });

    const file = getStorage(getAdminApp()).bucket(BUCKET).file(uploadPath);
    const [exists] = await file.exists();
    if (!exists) throw new HttpsError("not-found", "No encontramos el archivo subido.");
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType;
    if (Number(metadata.size) > MAX_DOCUMENT_BYTES) {
      throw new HttpsError("invalid-argument", "El archivo pesa más de 10 MB.");
    }
    const [buffer] = await file.download();

    let words;
    if (contentType === "application/pdf") {
      words = await pdfWords(buffer);
      if (words.length < 10) {
        throw new HttpsError("failed-precondition", "Este PDF es una imagen escaneada y no trae texto. Sube una foto de la tabla o complétala a mano.");
      }
    } else if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      try {
        words = docxWords(buffer);
      } catch (error) {
        console.error("scanSpecTable docx", error.message);
        words = [];
      }
      if (words.length < 10) {
        throw new HttpsError("failed-precondition", "No encontramos texto en este Word. Guárdalo como PDF o completa la tabla a mano.");
      }
    } else if (contentType === "image/jpeg" || contentType === "image/png") {
      try {
        const { access_token: token } = await applicationDefault().getAccessToken();
        words = await photoWords(buffer, token);
      } catch (error) {
        console.error("scanSpecTable vision", error.message);
        if (error.status === 403) {
          throw new HttpsError("failed-precondition", "Escanear fotos todavía no está activado. Sube la tabla en PDF o complétala a mano.");
        }
        throw new HttpsError("unavailable", "No pudimos leer la foto. Inténtalo nuevamente.");
      }
    } else {
      throw new HttpsError("invalid-argument", "Escanea una tabla en PDF, Word (.docx) o una foto (JPG o PNG).");
    }

    return parseSpecTable(words);
  });

  const deleteHallDocument = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);
    const id = childId(request.data?.documentId);
    if (!id) throw new HttpsError("invalid-argument", "Falta el documento.");
    const doc = await hallRef.collection("documents").doc(id).get();
    if (doc.exists) await removeDocuments(getAdminApp, [doc]);
    return { ok: true };
  });

  // The teacher of the subject confirms an event the course's directiva wrote
  // on its Calendar; it then shows as verified by them.
  const verifyCalendarEvent = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);
    const eventId = childId(request.data?.eventId);
    if (!eventId) throw new HttpsError("invalid-argument", "Falta el evento.");

    const eventRef = calendarDb(getAdminApp).collection(`HNC-LCH.${data.courseId}`).doc(eventId);
    const event = (await eventRef.get()).data();
    if (!event || event.source) {
      throw new HttpsError("not-found", "Ese evento ya no está en el Calendar del curso.");
    }
    if (subjectKey(event.subject) !== (data.subjectId || subjectKey(data.subject))) {
      throw new HttpsError("failed-precondition", "Ese evento es de otra asignatura.");
    }

    await eventRef.update({
      verified: true,
      verifier: data.teacherName,
      verifiedBy: data.teacherUid,
      verifiedHallId: hallRef.id,
      verifiedAt: FieldValue.serverTimestamp(),
      verificationRequested: false,
    });
    return { verified: true, verifier: data.teacherName };
  });

  const deleteHallEvaluation = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);
    const id = childId(request.data?.evaluationId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la evaluación.");
    const evaluationRef = hallRef.collection("evaluations").doc(id);
    const courses = (await evaluationRef.get()).data()?.calendarCourses || [data.courseId];
    const attached = await hallRef.collection("documents").where("evaluationId", "==", id).get();
    await removeDocuments(getAdminApp, attached.docs);
    const batch = calendarDb(getAdminApp).batch();
    for (const courseId of courses) batch.delete(calendarRef(getAdminApp, courseId, hallRef.id, id));
    await Promise.all([evaluationRef.delete(), batch.commit()]);
    return { ok: true };
  });

  const saveHallTask = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);

    const title = text(request.data?.title, 80);
    const instructions = paragraph(request.data?.instructions, 3000);
    const due = Number(request.data?.dueAt);
    const acceptLate = request.data?.acceptLate === true;
    if (title.length < 2) {
      throw new HttpsError("invalid-argument", "Escribe el nombre de la tarea.");
    }
    if (!Number.isFinite(due) || due <= 0) {
      throw new HttpsError("invalid-argument", "Elige hasta cuándo se puede entregar.");
    }

    const existingId = childId(request.data?.taskId);
    const ref = existingId ? hallRef.collection("tasks").doc(existingId) : hallRef.collection("tasks").doc();
    const existing = existingId ? (await ref.get()).data() : null;
    if (existingId && !existing) {
      throw new HttpsError("not-found", "Esa tarea ya no existe.");
    }
    if (!existingId) {
      const count = await hallRef.collection("tasks").count().get();
      if (count.data().count >= MAX_TASKS) {
        throw new HttpsError("resource-exhausted", "Este Hall llegó al máximo de tareas.");
      }
    }

    const dueAt = Timestamp.fromMillis(due);
    const courses = await calendarCourses(getAdminApp, data);
    const previous = existing?.calendarCourses || [];
    const fields = { title, instructions, dueAt, acceptLate, authorName: data.teacherName, calendarCourses: courses };
    if (existingId) await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
    else await ref.set({ ...fields, createdAt: FieldValue.serverTimestamp() });

    const event = {
      title: `${title} · ${data.subject}`.slice(0, 120),
      description: (instructions || `Tarea del Hall de ${data.subject}.`).slice(0, 1000),
      startDate: dueAt,
      endDate: dueAt,
      location: "ClassHall",
      subject: data.subject.slice(0, 60),
      type: "Tarea",
      verificationRequested: false,
      verified: true,
      verifier: data.teacherName,
      authorUid: data.teacherUid,
      authorName: data.teacherName,
      source: "classhall",
      hallId: hallRef.id,
      taskId: ref.id,
      createdAt: FieldValue.serverTimestamp(),
    };
    const batch = calendarDb(getAdminApp).batch();
    for (const courseId of courses) batch.set(taskCalendarRef(getAdminApp, courseId, hallRef.id, ref.id), event);
    for (const courseId of previous.filter(courseId => !courses.includes(courseId))) {
      batch.delete(taskCalendarRef(getAdminApp, courseId, hallRef.id, ref.id));
    }
    await batch.commit();

    return { taskId: ref.id };
  });

  // Deleting a task takes its submissions and their files with it.
  const deleteHallTask = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);
    const id = childId(request.data?.taskId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la tarea.");
    const taskRef = hallRef.collection("tasks").doc(id);
    const task = (await taskRef.get()).data();
    if (!task) return { ok: true };

    const [submissions, attached] = await Promise.all([
      taskRef.collection("submissions").get(),
      hallRef.collection("documents").where("taskId", "==", id).get(),
    ]);
    await Promise.all(submissions.docs.map(async (doc) => {
      await removeSubmissionFiles(getAdminApp, doc.data().items || []);
      await doc.ref.delete();
    }));
    await removeDocuments(getAdminApp, attached.docs);
    const batch = calendarDb(getAdminApp).batch();
    for (const courseId of task.calendarCourses || [data.courseId]) batch.delete(taskCalendarRef(getAdminApp, courseId, hallRef.id, id));
    await Promise.all([taskRef.delete(), batch.commit()]);
    return { ok: true };
  });

  // A task with what the caller may see of its submissions: their own, or,
  // for the teacher, all of them.
  const getHallTask = onCall({ invoker: "public" }, async (request) => {
    const { profile, hallRef, data, isTeacher } = await openHall(getAdminApp, request);
    const id = childId(request.data?.taskId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la tarea.");
    const taskRef = hallRef.collection("tasks").doc(id);
    const [task, attached] = await Promise.all([
      taskRef.get(),
      hallRef.collection("documents").where("taskId", "==", id).limit(1).get(),
    ]);
    if (!task.exists) throw new HttpsError("not-found", "Esa tarea ya no existe.");

    const result = {
      task: taskOut(task),
      attachment: attached.docs[0] ? documentOut(attached.docs[0]) : null,
      subject: data.subject,
      isTeacher,
    };
    if (isTeacher) {
      const submissions = await taskRef.collection("submissions").orderBy("submittedAt", "desc").limit(MAX_SUBMISSIONS_LISTED).get();
      result.submissions = submissions.docs.map(submissionOut);
      result.expectedSubmissions = await hallSize(getAdminApp, data);
    } else {
      const mine = await taskRef.collection("submissions").doc(profile.uid).get();
      result.mySubmission = mine.exists ? submissionOut(mine) : null;
    }
    return result;
  });

  // A student hands in a task, or changes what they handed in: the items
  // they keep, new files from their upload folder and links.
  const submitHallTask = onCall({ invoker: "public", memory: "512MiB" }, async (request) => {
    const { profile, hallRef, isTeacher } = await openHall(getAdminApp, request);
    if (isTeacher) throw new HttpsError("permission-denied", "Las entregas son de los estudiantes del Hall.");
    const id = childId(request.data?.taskId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la tarea.");
    const taskRef = hallRef.collection("tasks").doc(id);
    const task = (await taskRef.get()).data();
    if (!task) throw new HttpsError("not-found", "Esa tarea ya no existe.");

    const now = Date.now();
    const late = now > (millis(task.dueAt) ?? 0);
    if (late && task.acceptLate !== true) {
      throw new HttpsError("failed-precondition", "El plazo de esta tarea terminó y no recibe entregas atrasadas.");
    }

    const submissionRef = taskRef.collection("submissions").doc(profile.uid);
    const previous = (await submissionRef.get()).data();
    const keepIds = new Set((Array.isArray(request.data?.keep) ? request.data.keep : []).filter(value => typeof value === "string"));
    const kept = (previous?.items || []).filter(item => keepIds.has(item.id));
    const dropped = (previous?.items || []).filter(item => !keepIds.has(item.id));

    const uploads = (Array.isArray(request.data?.uploads) ? request.data.uploads : []).slice(0, MAX_SUBMISSION_ITEMS);
    const links = (Array.isArray(request.data?.links) ? request.data.links : []).slice(0, MAX_SUBMISSION_ITEMS);
    const note = paragraph(request.data?.note, 1000);

    const cleanLinks = links.map((link) => {
      const url = cleanLink(link?.url);
      if (!url) throw new HttpsError("invalid-argument", "Uno de los vínculos no es una dirección web válida.");
      return { id: randomUUID(), kind: "link", url, name: text(link?.name, 120) || new URL(url).hostname };
    });
    if (kept.length + uploads.length + cleanLinks.length > MAX_SUBMISSION_ITEMS) {
      throw new HttpsError("invalid-argument", `Una entrega lleva hasta ${MAX_SUBMISSION_ITEMS} archivos o vínculos.`);
    }
    if (kept.length + uploads.length + cleanLinks.length === 0 && !note) {
      throw new HttpsError("invalid-argument", "Agrega un archivo, una foto o un vínculo.");
    }

    // Files move from the student's upload folder into the task, with a token
    // URL only the student and the teacher get.
    const bucket = getStorage(getAdminApp()).bucket(BUCKET);
    const moved = [];
    try {
      for (const upload of uploads) {
        const uploadPath = typeof upload?.uploadPath === "string" ? upload.uploadPath : "";
        if (!uploadPath.startsWith(`classhall-submissions/${profile.uid}/`) || uploadPath.includes("..")) {
          throw new HttpsError("invalid-argument", "No encontramos uno de los archivos subidos.");
        }
        const file = bucket.file(uploadPath);
        const [exists] = await file.exists();
        if (!exists) throw new HttpsError("not-found", "No encontramos uno de los archivos subidos.");
        const [metadata] = await file.getMetadata();
        const size = Number(metadata.size) || 0;
        const type = metadata.contentType;
        if (!(DOCUMENT_TYPES[type] || SUBMISSION_IMAGE_TYPES[type]) || size <= 0 || size > MAX_DOCUMENT_BYTES) {
          await file.delete({ ignoreNotFound: true });
          throw new HttpsError("invalid-argument", "Cada archivo puede ser PDF, Word, PowerPoint, Excel o imagen, de hasta 10 MB.");
        }
        const itemId = randomUUID();
        const name = safeFileName(upload?.name);
        const path = `classhall/${hallRef.id}/tasks/${id}/${profile.uid}/${itemId}-${name}`;
        const token = randomUUID();
        await file.move(path);
        await bucket.file(path).setMetadata({
          contentType: type,
          contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
          metadata: { firebaseStorageDownloadTokens: token },
        });
        moved.push({ id: itemId, kind: "file", name, contentType: type, size, path, token });
      }
    } catch (error) {
      await removeSubmissionFiles(getAdminApp, moved);
      throw error;
    }

    const studentName = previous?.studentName || await displayName(getAdminApp, profile, "Estudiante");
    // Handing in again sends it back to the teacher, as not reviewed.
    await submissionRef.set({
      uid: profile.uid,
      studentName,
      courseId: profile.courseId || "",
      items: [...kept, ...moved, ...cleanLinks],
      note,
      late,
      submittedAt: FieldValue.serverTimestamp(),
      reviewed: false,
      feedback: previous?.feedback || "",
      reviewedAt: null,
    });
    await removeSubmissionFiles(getAdminApp, dropped);
    return submissionOut(await submissionRef.get());
  });

  // A student takes back a submission the teacher has not reviewed.
  const withdrawHallSubmission = onCall({ invoker: "public" }, async (request) => {
    const { profile, hallRef } = await openHall(getAdminApp, request);
    const id = childId(request.data?.taskId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la tarea.");
    const taskRef = hallRef.collection("tasks").doc(id);
    const submissionRef = taskRef.collection("submissions").doc(profile.uid);
    const [task, submission] = await Promise.all([taskRef.get().then(doc => doc.data()), submissionRef.get().then(doc => doc.data())]);
    if (!submission) return { ok: true };
    if (submission.reviewed === true) {
      throw new HttpsError("failed-precondition", "Tu docente ya revisó esta entrega, así que no se puede retirar.");
    }
    // Once closed, taking it back would leave the task without a way to hand it in again.
    if (task && Date.now() > (millis(task.dueAt) ?? 0) && task.acceptLate !== true) {
      throw new HttpsError("failed-precondition", "El plazo terminó, así que la entrega ya no se puede retirar.");
    }
    await removeSubmissionFiles(getAdminApp, submission.items || []);
    await submissionRef.delete();
    return { ok: true };
  });

  // The teacher marks a submission as reviewed and can leave a comment for the student.
  const reviewHallSubmission = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, isTeacher } = await openHall(getAdminApp, request);
    requireHallTeacher(isTeacher);
    const id = childId(request.data?.taskId);
    const studentUid = childId(request.data?.studentUid);
    if (!id || !studentUid) throw new HttpsError("invalid-argument", "Falta la entrega.");
    const submissionRef = hallRef.collection("tasks").doc(id).collection("submissions").doc(studentUid);
    if (!(await submissionRef.get()).exists) {
      throw new HttpsError("not-found", "Esa entrega ya no existe.");
    }
    const reviewed = request.data?.reviewed !== false;
    await submissionRef.update({
      reviewed,
      feedback: paragraph(request.data?.feedback, 1000),
      reviewedAt: reviewed ? FieldValue.serverTimestamp() : null,
    });
    return submissionOut(await submissionRef.get());
  });

  return {
    listMyHalls, checkHallCode, joinHall, createHall, listHallCourses,
    getHall, updateHall, saveHallAnnouncement, deleteHallAnnouncement, saveHallEvaluation, deleteHallEvaluation, verifyCalendarEvent,
    attachHallDocument, deleteHallDocument, scanSpecTable,
    saveHallTask, deleteHallTask, getHallTask, submitHallTask, withdrawHallSubmission, reviewHallSubmission,
  };
}

module.exports = { build };
