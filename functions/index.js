const functions = require("firebase-functions");
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

// Creates a pending identity-link request. Approval is intentionally separate
// so knowing a RUT is never enough to claim an academic identity.
// firebase-functions v6+ exposes the v2 API: onCall receives one `request`
// object with `data` and `auth`, not the v1 (data, context) pair.
exports.requestIdentityLink = functions.https.onCall(async (request) => {
  const { data, auth } = request;
  if (!auth) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const rut = normalizeRut(data && data.rut);
  if (!rut || rut.length < 7 || rut.length > 10) {
    throw new functions.https.HttpsError("invalid-argument", "El RUT no es válido.");
  }

  const adminApp = getAdminApp();
  const enrollmentDb = getFirestore(adminApp, "hn-enrollmentdata");
  const enrollmentRef = enrollmentDb.collection("LCH-enroll-hn").doc(rut);
  const enrollment = await enrollmentRef.get();

  // Keep the response deliberately generic to avoid exposing enrollment data.
  if (!enrollment.exists) {
    throw new functions.https.HttpsError("not-found", "No se pudo procesar la solicitud.");
  }

  const existing = await enrollmentDb
    .collection("identityLinkRequests")
    .where("firebaseUid", "==", auth.uid)
    .where("rut", "==", rut)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!existing.empty) {
    return { requestId: existing.docs[0].id, status: "pending" };
  }

  const requestRef = enrollmentDb.collection("identityLinkRequests").doc();
  await requestRef.set({
    firebaseUid: auth.uid,
    rut,
    institutionId: data && typeof data.institutionId === "string"
      ? data.institutionId.trim()
      : null,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  return { requestId: requestRef.id, status: "pending" };
});

const PANEL_ROLES = ["admin", "docente"];

function normalizeCourses(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => /^[A-Za-z0-9_-]{1,32}$/.test(item)))];
}

// Assigns or removes a panel role (custom claim). Only admins can call it.
// Docentes carry the courses they teach so Firestore rules can scope them.
// The first admin is created with functions/scripts/set-role.js.
exports.setUserRole = functions.https.onCall(async (request) => {
  const { data, auth } = request;
  if (!auth) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  if (auth.token.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Solo un administrador puede asignar roles.");
  }

  const email = data && typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const role = data ? data.role : undefined;
  if (!email) {
    throw new functions.https.HttpsError("invalid-argument", "Falta el correo.");
  }
  if (role !== null && !PANEL_ROLES.includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "El rol debe ser admin, docente o null.");
  }

  const adminApp = getAdminApp();
  const adminAuth = getAuth(adminApp);
  let target;
  try {
    target = await adminAuth.getUserByEmail(email);
  } catch (error) {
    throw new functions.https.HttpsError("not-found", "No existe una cuenta con ese correo.");
  }
  if (target.uid === auth.uid && role !== "admin") {
    throw new functions.https.HttpsError("failed-precondition", "No puedes quitarte tu propio rol de admin.");
  }

  const courses = role === "docente" ? normalizeCourses(data.courses) : [];
  const claims = { ...(target.customClaims || {}) };
  delete claims.role;
  delete claims.courses;
  if (role) {
    claims.role = role;
    if (courses.length) claims.courses = courses;
  }
  await adminAuth.setCustomUserClaims(target.uid, claims);

  await getFirestore(adminApp, "hn-enrollmentdata").collection("roleAssignments").add({
    targetUid: target.uid,
    targetEmail: email,
    role: role || null,
    courses,
    assignedBy: auth.uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { uid: target.uid, role: role || null, courses };
});

exports.icalFeed = functions.https.onRequest(async (req, res) => {
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
