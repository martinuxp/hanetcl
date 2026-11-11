const { randomUUID } = require("node:crypto");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

// The notifications section of the Home: what each account was told, kept so
// it can be read again later. Every push the backend sends to someone is
// also written here, even when that person has no device that takes pushes
// (Expo Go on Android, the web) or turned that kind of push off: the switch
// in Configuraciones silences the phone, not the record.
//
// One document per account, hn-enrollmentdata inbox/{uid}:
//   items: [{ id, kind, title, body, url, at }]   (newest is the largest `at`)
//   seenAt: when the person last opened the section
// A new item is an arrayUnion, so writing costs one write per person and no
// read; the list is trimmed when it is read. Opening the section costs one read.
// The 7:00 summary is not kept: it is the day's agenda, already in Calendar.

const KEEP = 40;
// The list is trimmed once it passes this, so most reads write nothing.
const TRIM_AT = 60;
const KINDS = ["announcement", "material", "task", "taskTomorrow", "reviewed", "grade", "gradeCorrected", "anniversary", "test"];

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function inboxRef(getAdminApp, uid) {
  return identityDb(getAdminApp).collection("inbox").doc(uid);
}

function clean(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function newest(items) {
  return [...items].sort((a, b) => (b.at || 0) - (a.at || 0));
}

/**
 * Keeps a notification for these accounts. Never throws: a failure here must
 * not stop the push, nor undo what was saved.
 *   message: what the push says ({ title, body, data: { url } })
 */
async function recordInbox(getAdminApp, uids, kind, message) {
  try {
    const unique = [...new Set((uids || []).filter(uid => typeof uid === "string" && uid))];
    if (!unique.length || !KINDS.includes(kind)) return 0;
    const item = {
      id: randomUUID(),
      kind,
      title: clean(message.title, 120),
      body: clean(message.body, 240),
      url: typeof message.data?.url === "string" ? message.data.url : null,
      at: Date.now(),
    };
    const db = identityDb(getAdminApp);
    for (let start = 0; start < unique.length; start += 450) {
      const batch = db.batch();
      for (const uid of unique.slice(start, start + 450)) {
        batch.set(db.collection("inbox").doc(uid), { items: FieldValue.arrayUnion(item) }, { merge: true });
      }
      await batch.commit();
    }
    return unique.length;
  } catch (error) {
    console.error("recordInbox", kind, error.message);
    return 0;
  }
}

function build(getAdminApp) {
  // { limit? } → { items (newest first), seenAt, unread }
  const getMyNotifications = onCall({ invoker: "public" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const ref = inboxRef(getAdminApp, request.auth.uid);
    const data = (await ref.get()).data() || {};
    const all = newest(Array.isArray(data.items) ? data.items : []);
    if (all.length > TRIM_AT) await ref.set({ items: all.slice(0, KEEP) }, { merge: true });
    const seenAt = typeof data.seenAt === "number" ? data.seenAt : 0;
    const limit = Number.isInteger(request.data?.limit) ? Math.min(Math.max(request.data.limit, 1), KEEP) : KEEP;
    return {
      items: all.slice(0, limit),
      seenAt,
      unread: all.slice(0, KEEP).filter(item => (item.at || 0) > seenAt).length,
    };
  });

  // Opening the section marks everything up to now as seen.
  const markNotificationsSeen = onCall({ invoker: "public" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const seenAt = Date.now();
    await inboxRef(getAdminApp, request.auth.uid).set({ seenAt }, { merge: true });
    return { seenAt };
  });

  return { getMyNotifications, markNotificationsSeen };
}

module.exports = { build, recordInbox };
