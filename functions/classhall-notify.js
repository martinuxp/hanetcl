const { createHash } = require("node:crypto");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

// ClassHall's push notifications, sent through Expo's push service: a new
// announcement, task or material reaches the Hall's students, the day before
// a task is due those who have not handed it in get a reminder, and a student
// hears when their submission was reviewed.
//
// Each device registers its Expo push token in hn-enrollmentdata
// pushTokens/{sha256(token)} with the uid signed in on it; signing in with
// another account moves the device to that account. Whoever turned ClassHall
// notifications off (accounts/{uid}.notifications.classhall = false) is left
// out. A failure is logged and never undoes what the teacher saved.

const STAFF_ROLES = ["Profesor", "Admin", "HNT"];
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;
const MAX_TOKENS_PER_ACCOUNT = 10;
// Android shows ClassHall's notifications in their own channel (services/push-service.ts).
const ANDROID_CHANNEL = "classhall";

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function tokenId(token) {
  return createHash("sha256").update(token).digest("hex");
}

function truncate(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** "lunes 27 de abril, 23:59", in Chile's time zone. */
function dueText(ms) {
  const date = new Date(ms);
  const day = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", weekday: "long", day: "numeric", month: "long" }).format(date);
  const time = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${day.replace(",", "")}, ${time}`;
}

async function hallStudentUids(getAdminApp, hall) {
  const db = identityDb(getAdminApp);
  let profiles;
  if ((hall.plan || "comun") === "comun") {
    const snapshot = await db.collection("users")
      .where("institutionId", "==", hall.institutionId)
      .where("courseId", "==", hall.courseId)
      .get();
    profiles = snapshot.docs;
  } else {
    const uids = hall.memberUids || [];
    profiles = uids.length ? await db.getAll(...uids.map(uid => db.collection("users").doc(uid))) : [];
  }
  return profiles
    .filter(doc => doc.exists && !STAFF_ROLES.includes(doc.data().role) && doc.id !== hall.teacherUid)
    .map(doc => doc.id);
}

// The tokens of these accounts, without those who turned ClassHall off.
async function tokensFor(getAdminApp, uids) {
  const unique = [...new Set(uids)];
  if (!unique.length) return [];
  const db = identityDb(getAdminApp);
  const accounts = await db.getAll(...unique.map(uid => db.collection("accounts").doc(uid)));
  const wanted = unique.filter((uid, index) => accounts[index].data()?.notifications?.classhall !== false);
  const tokens = [];
  for (let start = 0; start < wanted.length; start += 30) {
    const snapshot = await db.collection("pushTokens").where("uid", "in", wanted.slice(start, start + 30)).get();
    for (const doc of snapshot.docs) tokens.push({ id: doc.id, token: doc.data().token });
  }
  return tokens;
}

// Sends through Expo, 100 per request. A device that no longer takes
// notifications (the app was removed) loses its token. Returns Expo's ticket
// for each token, in order.
async function sendPush(getAdminApp, tokens, message) {
  const db = identityDb(getAdminApp);
  const all = [];
  for (let start = 0; start < tokens.length; start += 100) {
    const chunk = tokens.slice(start, start + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(chunk.map(item => ({ to: item.token, sound: "default", channelId: ANDROID_CHANNEL, ...message }))),
    });
    if (!response.ok) throw new Error(`Expo push answered ${response.status}`);
    const tickets = (await response.json()).data || [];
    all.push(...tickets);
    await Promise.all(tickets.map((ticket, index) => (
      ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered"
        ? db.collection("pushTokens").doc(chunk[index].id).delete()
        : null
    )));
  }
  return all;
}

// What each notification says and which screen it opens.
function messageFor(kind, hallId, hall, item) {
  const subject = hall.subject;
  if (kind === "announcement") {
    return { title: `Anuncio nuevo · ${subject}`, body: truncate(item.body, 160), data: { url: `/classhall/hall?id=${hallId}` } };
  }
  if (kind === "material") {
    return { title: `Material nuevo · ${subject}`, body: truncate(item.name, 120), data: { url: `/classhall/hall?id=${hallId}` } };
  }
  if (kind === "task") {
    return { title: `Tarea nueva · ${subject}`, body: `${truncate(item.title, 80)} · Se entrega el ${dueText(item.dueAt)}.`, data: { url: `/classhall/task?hallId=${hallId}&id=${item.id}` } };
  }
  if (kind === "taskTomorrow") {
    return { title: `Se entrega mañana · ${subject}`, body: `${truncate(item.title, 80)}. Todavía no la entregas.`, data: { url: `/classhall/task?hallId=${hallId}&id=${item.id}` } };
  }
  // reviewed
  return {
    title: `Tu entrega fue revisada · ${subject}`,
    body: item.feedback ? `${truncate(item.title, 60)}: “${truncate(item.feedback, 100)}”` : truncate(item.title, 120),
    data: { url: `/classhall/task?hallId=${hallId}&id=${item.id}` },
  };
}

/**
 * Notifies a Hall's students about something new.
 *   kind: "material" | "task" | "taskTomorrow" | "announcement" | "reviewed"
 *   onlyUids: the reminder's students who have not handed in, or the
 *   student whose submission was reviewed
 */
async function notifyHall(getAdminApp, { kind, hallId, hall, item, onlyUids }) {
  try {
    let uids = kind === "reviewed" ? (onlyUids || []) : await hallStudentUids(getAdminApp, hall);
    if (onlyUids && kind !== "reviewed") uids = uids.filter(uid => onlyUids.includes(uid));
    const tokens = await tokensFor(getAdminApp, uids);
    if (!tokens.length) return 0;
    await sendPush(getAdminApp, tokens, messageFor(kind, hallId, hall, item));
    return tokens.length;
  } catch (error) {
    console.error("notifyHall", kind, hallId, error.message);
    return 0;
  }
}

function build(getAdminApp) {
  // The app registers the device's token after the person allows
  // notifications, and again on each start (tokens can change).
  const registerPushToken = onCall({ invoker: "public" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const token = typeof request.data?.token === "string" ? request.data.token.trim() : "";
    if (!TOKEN_PATTERN.test(token)) throw new HttpsError("invalid-argument", "Ese token de notificaciones no es válido.");
    const platform = ["ios", "android", "web"].includes(request.data?.platform) ? request.data.platform : "unknown";

    const db = identityDb(getAdminApp);
    const uid = request.auth.uid;
    await db.collection("pushTokens").doc(tokenId(token)).set({ uid, token, platform, updatedAt: FieldValue.serverTimestamp() });

    // An account keeps its most recent devices.
    const mine = await db.collection("pushTokens").where("uid", "==", uid).get();
    if (mine.size > MAX_TOKENS_PER_ACCOUNT) {
      const stale = mine.docs
        .sort((a, b) => (a.data().updatedAt?.toMillis() ?? 0) - (b.data().updatedAt?.toMillis() ?? 0))
        .slice(0, mine.size - MAX_TOKENS_PER_ACCOUNT);
      await Promise.all(stale.map(doc => doc.ref.delete()));
    }
    return { ok: true };
  });

  // Signing out takes the device off the account.
  const unregisterPushToken = onCall({ invoker: "public" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const token = typeof request.data?.token === "string" ? request.data.token.trim() : "";
    if (!TOKEN_PATTERN.test(token)) return { ok: true };
    const ref = identityDb(getAdminApp).collection("pushTokens").doc(tokenId(token));
    const doc = await ref.get();
    if (doc.exists && doc.data().uid === request.auth.uid) await ref.delete();
    return { ok: true };
  });

  // Panel HNT: a test notification to the caller's devices or to an
  // account by its HaNet ID, ignoring its ClassHall switch. Answers what Expo
  // said for each device, to see why one does not arrive.
  const adminSendTestPush = onCall({ invoker: "public" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    if (request.auth.token.role !== "HNT") throw new HttpsError("permission-denied", "Esta acción es solo para el equipo HaNet.");

    const db = identityDb(getAdminApp);
    const handle = typeof request.data?.username === "string" ? request.data.username.trim().replace(/^@/, "").toLowerCase() : "";
    let uid = request.auth.uid;
    if (handle) {
      if (!/^[a-z0-9._-]{2,40}$/.test(handle)) throw new HttpsError("invalid-argument", "Ese HaNet ID no es válido.");
      const owner = (await db.collection("usernames").doc(handle).get()).data();
      if (!owner?.uid) throw new HttpsError("not-found", `No hay ninguna cuenta @${handle}.`);
      uid = owner.uid;
    }

    const title = truncate(request.data?.title, 80) || "Prueba de HaNet";
    const body = truncate(request.data?.body, 200) || "Si ves esto, las notificaciones funcionan.";
    const route = typeof request.data?.url === "string" && /^\/classhall\/(hall|task)\?[A-Za-z0-9_=&-]+$/.test(request.data.url) ? request.data.url : null;

    const snapshot = await db.collection("pushTokens").where("uid", "==", uid).get();
    const devices = snapshot.docs.map(doc => ({ id: doc.id, token: doc.data().token, platform: doc.data().platform || "unknown", updatedAt: doc.data().updatedAt?.toMillis() ?? null }));
    if (!devices.length) return { devices: [] };

    const tickets = await sendPush(getAdminApp, devices, { title, body, ...(route ? { data: { url: route } } : {}) });
    return {
      devices: devices.map((device, index) => ({
        platform: device.platform,
        updatedAt: device.updatedAt,
        // The end of the token, to tell devices apart without showing it.
        token: `…${device.token.slice(-8, -1)}`,
        ok: tickets[index]?.status === "ok",
        error: tickets[index]?.status === "error" ? (tickets[index].details?.error || tickets[index].message || "Error") : null,
      })),
    };
  });

  return { registerPushToken, unregisterPushToken, adminSendTestPush };
}

module.exports = { build, notifyHall, hallStudentUids };
