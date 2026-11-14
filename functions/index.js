const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { FieldValue } = require("firebase-admin/firestore");
const ical = require("ical-generator").default;

// We delay the initialization to avoid deployment timeouts
let app;

function normalizeRut(value) {
  return String(value || "")
    .replace(/[^0-9kK]/g, "")
    .toUpperCase();
}

function getAdminApp() {
  if (!app) {
    app = initializeApp();
  }
  return app;
}

// HaNet ID: sign-up profile and email verification by code.
Object.assign(exports, require("./account").build(getAdminApp));

// Institutions, their invitation phrases and rosters, plus the HNT panel.
Object.assign(exports, require("./institutions").build(getAdminApp));

// People of an institution: roles and unlinking, for the HNT panel.
Object.assign(exports, require("./members").build(getAdminApp));

// ClassHall: Halls per subject and course, and joining them by code.
Object.assign(exports, require("./classhall").build(getAdminApp));

// Notas: grades on a Hall's evaluations, uncovered by scratching.
Object.assign(exports, require("./grades").build(getAdminApp));

// HaNet Eventos: city events (HNT) and the institution's own.
Object.assign(exports, require("./events").build(getAdminApp));

// Feed y Comunidad: announcements by Espacios, with reactions.
Object.assign(exports, require("./feed").build(getAdminApp));

// Aniversario: alianzas, their points, deadlines and flash tests.
Object.assign(exports, require("./anniversary").build(getAdminApp));

// HaNet Electividad (Herramientas): the interests test for choosing electivos.
Object.assign(exports, require("./electividad").build(getAdminApp));

// Push notifications: devices register their token here.
Object.assign(exports, require("./classhall-notify").build(getAdminApp));

// The Home's notifications section: what each account was told.
Object.assign(exports, require("./inbox").build(getAdminApp));

// The changing code of the HN-QR, for check-in at events.
Object.assign(exports, require("./hanet-id").build(getAdminApp));

// The course's timetable and the 7:00 summary.
Object.assign(exports, require("./schedule").build(getAdminApp));

// Class suspensions and early dismissals, on top of the timetable.
Object.assign(exports, require("./day-changes").build(getAdminApp));

// Data for the profile screen.
Object.assign(exports, require("./profile").build(getAdminApp));

// Identity link through the institutional email.
Object.assign(exports, require("./link").build(getAdminApp));

// Creates a pending identity-link request. Approval is intentionally separate
// so knowing a RUT is never enough to claim an academic identity.
exports.requestIdentityLink = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const data = request.data;
  const uid = request.auth.uid;

  const rut = normalizeRut(data && data.rut);
  if (!rut || rut.length < 7 || rut.length > 10) {
    throw new HttpsError("invalid-argument", "El RUT no es válido.");
  }

  const adminApp = getAdminApp();
  const enrollmentDb = getFirestore(adminApp, "hn-enrollmentdata");
  const enrollmentRef = enrollmentDb.collection("LCH-enroll-hn").doc(rut);
  const enrollment = await enrollmentRef.get();

  // Keep the response deliberately generic to avoid exposing enrollment data.
  if (!enrollment.exists) {
    throw new HttpsError("not-found", "No pudimos procesar la solicitud.");
  }

  const existing = await enrollmentDb
    .collection("identityLinkRequests")
    .where("firebaseUid", "==", uid)
    .where("rut", "==", rut)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!existing.empty) {
    return { requestId: existing.docs[0].id, status: "pending" };
  }

  const requestRef = enrollmentDb.collection("identityLinkRequests").doc();
  await requestRef.set({
    firebaseUid: uid,
    rut,
    institutionId: data && typeof data.institutionId === "string"
      ? data.institutionId.trim()
      : null,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  return { requestId: requestRef.id, status: "pending" };
});

const CLAIM_ROLES = ["Estudiante", "Directiva", "CEE", "Profesor", "Admin", "HNT"];

// Copies role and courseId from users/{uid} into the caller's token. The
// hn-calendar rules cannot read hn-enrollmentdata, so they rely on these
// claims; only this backend can set them.
exports.syncMyClaims = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const uid = request.auth.uid;
  const adminApp = getAdminApp();
  const snapshot = await getFirestore(adminApp, "hn-enrollmentdata")
    .collection("users")
    .doc(uid)
    .get();
  const profile = snapshot.exists ? snapshot.data() : {};

  const role = CLAIM_ROLES.includes(profile.role) ? profile.role : "Estudiante";
  // Kept verbatim: the client builds the collection name from this value.
  const courseId = typeof profile.courseId === "string"
    && profile.courseId.length > 0
    && profile.courseId.length <= 64
    && !profile.courseId.includes("/")
    ? profile.courseId
    : null;

  const auth = getAuth(adminApp);
  const current = (await auth.getUser(uid)).customClaims || {};
  const changed = current.role !== role || (current.courseId || null) !== courseId;

  if (changed) {
    const next = { ...current, role };
    if (courseId) next.courseId = courseId;
    else delete next.courseId;
    await auth.setCustomUserClaims(uid, next);
  }

  console.log("syncMyClaims", {
    uid,
    hasProfile: snapshot.exists,
    role,
    courseId,
    rawCourseIdType: typeof profile.courseId,
    changed,
  });

  return { role, courseId, changed };
});

// Subscription feed of a course's Calendar (webcal), for Apple Calendar,
// Google Calendar and Outlook.
//
// Dates go out in UTC ("…Z"). Before, the feed set a calendar timezone
// without a VTIMEZONE block, so ical-generator wrote the UTC clock time
// with no zone and every app read it as local time: each event showed up
// 3 hours late (4 in winter) in Chile.
exports.icalFeed = onRequest(async (req, res) => {
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId.trim() : "";

  if (!courseId || courseId.length > 64 || courseId.includes("/")) {
    res.status(400).send("Falta el parámetro courseId. Uso: ?courseId=Segundo%20Medio%20K");
    return;
  }

  try {
    const adminApp = getAdminApp();
    // Access the specifically named database for events
    const db = getFirestore(adminApp, "hn-calendar");
    const snapshot = await db.collection(`HNC-LCH.${courseId}`).get();

    const calendar = ical({
      name: `HaNet · ${courseId}`,
      description: `Calendar de HaNet de ${courseId}`,
      prodId: { company: "HaNet", product: "Calendar", language: "ES" },
    });

    // How often Apple Calendar and Outlook should check for changes.
    calendar.ttl(60 * 60); // 1 hour

    snapshot.forEach((doc) => {
      const data = doc.data();
      const title = typeof data.title === "string" ? data.title.trim() : "";
      const start = data.startDate && typeof data.startDate.toDate === "function" ? data.startDate.toDate() : null;
      // An event without a title or a date is half-written data: leave it out.
      if (!title || !start || Number.isNaN(start.getTime())) return;

      const parsedEnd = data.endDate && typeof data.endDate.toDate === "function" ? data.endDate.toDate() : null;
      const end = parsedEnd && parsedEnd > start ? parsedEnd : new Date(start.getTime() + 90 * 60000);

      const type = data.type === "Off Topic" ? "Otro" : data.type;
      const typeIndicator = type ? `[${type}] ` : "";
      const subject = typeof data.subject === "string" ? data.subject.trim() : "";
      // Titles copied from ClassHall already end in "· <asignatura>".
      const subjectInd = subject && !title.includes(subject) ? ` (${subject})` : "";
      const cancelled = data.cancelled === true;
      const updated = data.updatedAt && typeof data.updatedAt.toDate === "function" ? data.updatedAt.toDate() : null;

      calendar.createEvent({
        id: doc.id,
        start,
        end,
        summary: `${cancelled ? "Cancelado: " : ""}${typeIndicator}${title}${subjectInd}`,
        description: data.description || undefined,
        location: data.location || "Liceo",
        // A higher sequence tells calendar apps the event changed.
        sequence: updated ? Math.floor(updated.getTime() / 1000) : 0,
        lastModified: updated || undefined,
        status: cancelled ? "CANCELLED" : "CONFIRMED",
      });
    });

    const fileName = courseId.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "curso";
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="hanet-${fileName}.ics"`);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(calendar.toString());
  } catch (error) {
    console.error("Error al generar Node-iCal:", error);
    res.status(500).send("No pudimos generar el calendario.");
  }
});
