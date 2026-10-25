const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// The HN-QR of the profile: "hanet://id/<username>?c=<code>". The code
// changes every 30 seconds, so a screenshot of someone else's QR stops
// working right away. The app computes it from a key only it and this
// backend know (idKeys/{uid} in hn-enrollmentdata, closed to the app), so
// it keeps working without internet once the key is on the phone:
//   code = first 10 hex of sha256("<key>:<30-second step>")
// The QR alone says who the person is; checking someone in at an event
// (functions/events.js) needs the code to be current.

const STEP_MS = 30 * 1000;
// Steps accepted around now: a phone's clock can be a little off, and the
// organizer may scan a QR that was drawn a few seconds ago.
const STEPS_BEHIND = 3;
const STEPS_AHEAD = 1;
const QR_PATTERN = /^hanet:\/\/id\/([A-Za-z0-9._-]{2,128})(?:\?c=([0-9a-f]{10}))?$/;

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function codeFor(key, step) {
  return createHash("sha256").update(`${key}:${step}`).digest("hex").slice(0, 10);
}

async function keyOf(getAdminApp, uid, create) {
  const ref = identityDb(getAdminApp).collection("idKeys").doc(uid);
  const current = (await ref.get()).data()?.key;
  if (current || !create) return current || null;
  const key = randomBytes(24).toString("hex");
  await ref.set({ key, createdAt: FieldValue.serverTimestamp() });
  return key;
}

/**
 * Who an HN-QR belongs to, with its code checked. Throws a message for the
 * organizer when the QR is not a HaNet ID, is old or was copied.
 */
async function readIdQr(getAdminApp, value) {
  const match = QR_PATTERN.exec(typeof value === "string" ? value.trim() : "");
  if (!match) throw new HttpsError("invalid-argument", "Ese código no es un HaNet ID.");
  const [, handle, code] = match;
  const db = identityDb(getAdminApp);
  // The QR carries the username, or the UID for accounts without one.
  const owner = (await db.collection("usernames").doc(handle.toLowerCase()).get()).data();
  const uid = owner?.uid || handle;
  if (!code) throw new HttpsError("failed-precondition", "Ese QR es antiguo. Pídele que abra su HN-QR otra vez con internet.");
  const key = await keyOf(getAdminApp, uid, false);
  if (!key) throw new HttpsError("not-found", "No reconocemos ese HaNet ID.");
  const step = Math.floor(Date.now() / STEP_MS);
  for (let offset = -STEPS_BEHIND; offset <= STEPS_AHEAD; offset += 1) {
    if (timingSafeEqual(Buffer.from(codeFor(key, step + offset)), Buffer.from(code))) return uid;
  }
  throw new HttpsError("permission-denied", "Ese QR ya venció. Pídele que muestre su HN-QR en vivo, no una captura.");
}

function build(getAdminApp) {
  // The key the app uses to draw its changing HN-QR; made the first time.
  const getMyIdKey = onCall({ invoker: "public" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    return { key: await keyOf(getAdminApp, request.auth.uid, true), stepMs: STEP_MS };
  });

  return { getMyIdKey };
}

module.exports = { build, readIdQr };
