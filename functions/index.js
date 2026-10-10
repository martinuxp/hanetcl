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
    throw new HttpsError("not-found", "No se pudo procesar la solicitud.");
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

const CLAIM_ROLES = ["Estudiante", "Directiva", "CEE", "Admin", "HNT"];

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

exports.icalFeed = onRequest(async (req, res) => {
  const courseId = req.query.courseId;
  
  if (!courseId) {
    res.status(400).send("Falta el parámetro courseId. Uso: ?courseId=2k");
    return;
  }

  try {
    const adminApp = getAdminApp();
    // Access the specifically named database for events
    const db = getFirestore(adminApp, "hn-calendar");
    const eventsRef = db.collection(`HNC-LCH.${courseId}`);
    const snapshot = await eventsRef.get();

    const calendar = ical({
      name: `HaNet Calendar - ${courseId.toUpperCase()}`,
      description: `Calendario Institucional Oficial (HaNet) para el curso ${courseId}`,
      timezone: "America/Santiago",
    });

    // We add a TTL (Time To Live) so Apple Calendar natively knows how often to sync
    calendar.ttl(60 * 60); // 1 hour

    snapshot.forEach((doc) => {
      const data = doc.data();
      const start = data.startDate ? data.startDate.toDate() : new Date();
      const end = data.endDate ? data.endDate.toDate() : new Date(start.getTime() + 90 * 60000);

      const typeIndicator = data.type ? `[${data.type}] ` : '';
      const subjectInd = data.subject ? ` (${data.subject})` : '';
      
      calendar.createEvent({
        id: doc.id,
        start: start,
        end: end,
        summary: `${typeIndicator}${data.title}${subjectInd}`,
        description: data.description || "Evento programado. Administrado por HaNet Institucional.",
        location: data.location || "Liceo",
        // Apple Calendar support tweaks
        sequence: 0,
        status: data.cancelled ? 'CANCELLED' : 'CONFIRMED'
      });
    });

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="hanet-${courseId}.ics"`);
    res.send(calendar.toString());

  } catch (error) {
    console.error("Error al generar Node-iCal:", error);
    res.status(500).send("Error interno generando el calendario.");
  }
});
