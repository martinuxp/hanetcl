const { Buffer } = require("node:buffer");
const { createHash, randomBytes, randomInt, timingSafeEqual } = require("node:crypto");
const { onCall, HttpsError } = require("./regions");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { readIdQr, codeFor, STEP_MS, STEPS_BEHIND, STEPS_AHEAD } = require("./hanet-id");
const { sendPush } = require("./classhall-notify");
const { recordInbox } = require("./inbox");

// Entradas (module "tickets"): single-use tickets for an institution event,
// like the Velada of the anniversary. They live in hn-calendar's
// `hnTickets/{ticketId}` (closed to the app, except that the holder may read
// their own ticket to see the moment it is used at the door):
//   eventId, institutionId, number (N.º x de cap), holderUid (null while it
//   is a link nobody accepted), holderName, courseId, guestName,
//   status: "active" | "link" | "shared" | "printed" | "used" | "voided",
//   issuedBy, issuedAt, usedAt, usedBy, giftedFrom, giftedToName,
//   linkHash, linkExpiresAt, staticHash, history.
// The event keeps its options in hnEvents/{id}.tickets = { enabled, cap,
// giftable, guestLinks, printable, style, note } (saved by functions/events.js)
// and the last number given in `ticketSeq`.
//
// The QR in the app changes every 30 seconds, like the HN-QR:
//   "hanet://ticket/<ticketId>?c=<first 10 hex of sha256('<key>:<step>')>"
// with a key per ticket in hnTickets/{id}/secret/key, so a screenshot does
// not get anyone in. Sharing it as an image or printing it trades that for a
// fixed code ("hanet://t/<CODE>", the same CODE is typed by hand at the
// door); from then on the ticket is no longer in the app. Whatever form it
// takes, the first read at the door wins and the rest answer "ya se usó".
// Giving it away makes a link that works once; accepting it renews the key,
// so the giver's QR stops working.

const MODULE = "tickets";
const TICKETS = "hnTickets";
const EVENTS = "hnEvents";
const ORGANIZERS = ["CEE", "Admin", "HNT"];
const STAFF_ROLES = ["Profesor", "Admin", "HNT"];
const STATUSES = ["active", "link", "shared", "printed", "used", "voided"];
const BUCKET = "hanet-edu.firebasestorage.app";
const WEB_BASE = "https://hanet-app.web.app";
// A gift link works for 24 hours (muxp, 2026-11-19); a guest's link, sent by
// who organizes, lasts until the event or a week, whichever is later.
const GIFT_LINK_MS = 24 * 60 * 60 * 1000;
const GUEST_LINK_DAYS = 7;
const MAX_SCANNERS = 20;
const MAX_PER_PERSON = 10;
const MAX_ISSUE = 2000;
// The door opens a while before the event and closes a day after it ends,
// like "Pasar lista".
const DOOR_OPENS_MS = 3 * 60 * 60 * 1000;
const DOOR_CLOSES_MS = 24 * 60 * 60 * 1000;
// Written codes skip letters that look alike (0/O, 1/I/L).
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TICKET_QR = /^hanet:\/\/ticket\/([A-Za-z0-9]{12,40})\?c=([0-9a-f]{10})$/;
const STATIC_QR = /^hanet:\/\/t\/([2-9A-Z]{4}-?[2-9A-Z]{4})$/;
const TYPED_CODE = /^[2-9A-Z]{4}-?[2-9A-Z]{4}$/;

function calendarDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-calendar");
}

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function text(value, max) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function millis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : null;
}

function docId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(value) ? value : null;
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function newKey() {
  return randomBytes(24).toString("hex");
}

function newToken() {
  return randomBytes(18).toString("base64url");
}

function newStaticCode() {
  let code = "";
  for (let index = 0; index < 8; index += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function normalCode(value) {
  const raw = String(value || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : null;
}

function linkUrl(token) {
  return `${WEB_BASE}/tickets/receive?t=${token}`;
}

function imageUrl(data) {
  if (data.imagePath && data.imageToken) {
    return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(data.imagePath)}?alt=media&token=${data.imageToken}`;
  }
  return data.imageUrl || null;
}

function eventOut(id, data, institutionName = "") {
  const image = imageUrl(data);
  return {
    id,
    institutionName,
    title: data.title || "",
    startsAt: millis(data.startsAt),
    endsAt: millis(data.endsAt),
    venueName: data.venueName || "",
    address: data.address || "",
    city: data.city || "",
    imageUrl: image,
    palette: data.palette?.source && data.palette.source === image ? data.palette.colors : [],
    authorName: data.authorName || "",
    cap: ticketCap(data),
    giftable: data.tickets?.giftable !== false,
    printable: data.tickets?.printable === true,
    style: ["simple", "brand", "formal"].includes(data.tickets?.style) ? data.tickets.style : "simple",
    note: text(data.tickets?.note, 120),
  };
}

function ticketCap(event) {
  const cap = event.tickets?.cap ?? event.capacity;
  return typeof cap === "number" && cap > 0 ? Math.floor(cap) : null;
}

/** The full names of these institutions, for the printed ticket. */
async function institutionNames(getAdminApp, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const db = identityDb(getAdminApp);
  const docs = unique.length ? await db.getAll(...unique.map(id => db.collection("institutions").doc(id))) : [];
  return new Map(docs.map(doc => [doc.id, text(doc.data()?.fullName || doc.data()?.name, 120)]));
}

/** What the holder sees of a ticket. */
function ticketOut(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    eventId: data.eventId,
    number: data.number || null,
    holderName: data.holderName || "",
    courseId: data.courseId || "",
    status: STATUSES.includes(data.status) ? data.status : "active",
    giftedFromName: data.giftedFromName || "",
    giftedToName: data.giftedToName || "",
    issuedAt: millis(data.issuedAt),
    usedAt: millis(data.usedAt),
    linkExpiresAt: millis(data.linkExpiresAt),
    receivedAt: millis(data.receivedAt),
  };
}

/** A row of the organizer's list. */
function rowOut(doc) {
  const data = doc.data();
  return {
    ticketId: doc.id,
    number: data.number || null,
    holderUid: data.holderUid || null,
    holderName: data.holderName || "",
    courseId: data.courseId || "",
    guestName: data.guestName || "",
    status: STATUSES.includes(data.status) ? data.status : "active",
    giftedToName: data.giftedToName || "",
    issuedAt: millis(data.issuedAt),
    usedAt: millis(data.usedAt),
  };
}

function doorOpen(event, now = Date.now()) {
  const start = millis(event.startsAt) || 0;
  const end = millis(event.endsAt) || start;
  return now >= start - DOOR_OPENS_MS && now <= end + DOOR_CLOSES_MS;
}

function history(action, uid, extra = {}) {
  return FieldValue.arrayUnion({ action, uid: uid || null, at: Date.now(), ...extra });
}

async function requireAuth(getAdminApp, request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  return request.auth.uid;
}

async function requireProfile(getAdminApp, request) {
  const uid = await requireAuth(getAdminApp, request);
  const profile = (await identityDb(getAdminApp).collection("users").doc(uid).get()).data();
  if (!profile || !profile.institutionId) {
    throw new HttpsError("failed-precondition", "Primero vincula tu HaNet ID con tu institución.");
  }
  return { uid, ...profile };
}

async function nameOf(getAdminApp, uid, profile) {
  const name = text(profile?.name, 80);
  if (name) return name;
  const account = (await identityDb(getAdminApp).collection("accounts").doc(uid).get()).data();
  return text(account?.fullName, 80) || "HaNet";
}

async function moduleOn(getAdminApp, institutionId) {
  const institution = (await identityDb(getAdminApp).collection("institutions").doc(institutionId).get()).data();
  if (!institution) return false;
  return !Array.isArray(institution.modules) || institution.modules.includes(MODULE);
}

function guestLinkExpiry(event) {
  return Math.max(Date.now() + GUEST_LINK_DAYS * 864e5, millis(event.endsAt) || millis(event.startsAt) || 0);
}

function organizes(profile, event) {
  return ORGANIZERS.includes(profile.role) && (profile.role === "HNT" || event.institutionId === profile.institutionId);
}

/**
 * The event, checked to be one with tickets that this person organizes. With
 * `door`, a docente whom the organizers allowed to scan also gets in.
 */
async function organizedEvent(getAdminApp, profile, value, { door = false } = {}) {
  const id = docId(value);
  if (!id) throw new HttpsError("invalid-argument", "Falta el evento.");
  const event = (await calendarDb(getAdminApp).collection(EVENTS).doc(id).get()).data();
  if (!event || event.kind !== "institution") throw new HttpsError("not-found", "Ese evento ya no está disponible.");
  const scanner = door && event.institutionId === profile.institutionId
    && Array.isArray(event.ticketScanners) && event.ticketScanners.includes(profile.uid);
  if (!organizes(profile, event) && !scanner) {
    throw new HttpsError("permission-denied", door ? "Solo quienes organizan el evento, o los docentes que autoricen, escanean en la puerta." : "Solo quienes organizan el evento manejan sus entradas.");
  }
  if (!(await moduleOn(getAdminApp, event.institutionId))) {
    throw new HttpsError("failed-precondition", "Entradas no está activo en tu institución.");
  }
  return { id, event };
}

// ---- The door, fast (muxp 2026-11-19: scanning took too long) ----
//
// Each scan used to read again who scans, the event, the module and two
// counts, one after the other, from a function in Iowa to a database in
// Santiago. Now an instance keeps that for a minute per person and door
// (a scanner removed by who organizes stops within that minute), the ticket
// and its key come in one read, the "used" mark is a single conditional
// write, and "Llegaron" is refreshed in the background every few seconds.
const SESSION_MS = 60 * 1000;
const COUNT_FRESH_MS = 8 * 1000;
const sessions = new Map();

async function doorSession(getAdminApp, request, value) {
  const uid = await requireAuth(getAdminApp, request);
  const key = `${uid}:${docId(value) || ""}`;
  const kept = sessions.get(key);
  if (kept && Date.now() - kept.at < SESSION_MS) return kept;
  const profile = await requireProfile(getAdminApp, request);
  const { id, event } = await organizedEvent(getAdminApp, profile, value, { door: true });
  const db = calendarDb(getAdminApp);
  const [total, used] = await Promise.all([ticketCap(event) ?? issuedCount(db, id), countWhere(db, id, "used")]);
  const session = { at: Date.now(), profile, id, event, total, used, countedAt: Date.now() };
  if (sessions.size > 200) {
    for (const [name, item] of sessions) if (Date.now() - item.at >= SESSION_MS) sessions.delete(name);
  }
  sessions.set(key, session);
  return session;
}

/** "Llegaron": what this instance knows now; a fresh count is on its way if it's old. */
function doorCount(db, session) {
  if (Date.now() - session.countedAt > COUNT_FRESH_MS) {
    session.countedAt = Date.now();
    countWhere(db, session.id, "used").then(count => { session.used = count; }).catch(() => undefined);
  }
  return session.used;
}

/** Whether this account holds a ticket for the event (any state but voided). */
async function hasTicket(db, eventId, uid) {
  if (!eventId || !uid) return false;
  const snapshot = await db.collection(TICKETS).where("eventId", "==", eventId).where("holderUid", "==", uid).limit(3).get();
  return snapshot.docs.some(doc => doc.data().status !== "voided");
}

async function countWhere(db, eventId, status) {
  let query = db.collection(TICKETS).where("eventId", "==", eventId);
  if (status) query = query.where("status", "==", status);
  return (await query.count().get()).data().count;
}

/** Tickets that count against the cap: all but the voided ones. */
async function issuedCount(db, eventId) {
  const [all, voided] = await Promise.all([countWhere(db, eventId), countWhere(db, eventId, "voided")]);
  return all - voided;
}

// Tells the new holders, by push and in their notifications.
async function notifyHolders(getAdminApp, uids, message) {
  try {
    const unique = [...new Set(uids.filter(Boolean))];
    if (!unique.length) return;
    await recordInbox(getAdminApp, unique, "ticket", message);
    const db = identityDb(getAdminApp);
    const tokens = [];
    for (let start = 0; start < unique.length; start += 30) {
      const snapshot = await db.collection("pushTokens").where("uid", "in", unique.slice(start, start + 30)).get();
      for (const doc of snapshot.docs) tokens.push({ id: doc.id, token: doc.data().token });
    }
    if (tokens.length) await sendPush(getAdminApp, tokens, message);
  } catch (error) {
    console.error("tickets notify", error.message);
  }
}

function build(getAdminApp) {
  // ---- The holder ----

  // The account's tickets with their events, newest event first.
  const listMyTickets = onCall({ invoker: "public" }, async (request) => {
    const uid = await requireAuth(getAdminApp, request);
    const db = calendarDb(getAdminApp);
    const snapshot = await db.collection(TICKETS).where("holderUid", "==", uid).limit(100).get();
    const docs = snapshot.docs.filter(doc => doc.data().status !== "voided");
    const eventIds = [...new Set(docs.map(doc => doc.data().eventId))];
    const events = eventIds.length ? await db.getAll(...eventIds.map(id => db.collection(EVENTS).doc(id))) : [];
    const live = events.filter(doc => doc.exists && doc.data().status !== "deleted");
    const names = await institutionNames(getAdminApp, live.map(doc => doc.data().institutionId));
    const byId = new Map(live.map(doc => [doc.id, eventOut(doc.id, doc.data(), names.get(doc.data().institutionId))]));
    const tickets = docs
      .filter(doc => byId.has(doc.data().eventId))
      .map(doc => ({ ...ticketOut(doc), event: byId.get(doc.data().eventId) }))
      .sort((a, b) => (b.event.startsAt || 0) - (a.event.startsAt || 0) || (a.number || 0) - (b.number || 0));
    return { tickets };
  });

  // The key the app draws the changing QR with. Only the holder of an active
  // ticket gets it; it is made the first time.
  const getTicketKey = onCall({ invoker: "public" }, async (request) => {
    const uid = await requireAuth(getAdminApp, request);
    const id = docId(request.data?.ticketId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la entrada.");
    const ref = calendarDb(getAdminApp).collection(TICKETS).doc(id);
    const ticket = (await ref.get()).data();
    if (!ticket || ticket.holderUid !== uid) throw new HttpsError("not-found", "Esa entrada no está en tu cuenta.");
    if (ticket.status !== "active") throw new HttpsError("failed-precondition", "Esa entrada ya no tiene un QR en la app.");
    const secret = ref.collection("secret").doc("key");
    let key = (await secret.get()).data()?.key;
    if (!key) {
      key = newKey();
      await secret.set({ key }, { merge: true });
    }
    return { key, stepMs: STEP_MS };
  });

  // The state of one ticket, for phones that cannot listen to it live.
  const getTicketStatus = onCall({ invoker: "public" }, async (request) => {
    const uid = await requireAuth(getAdminApp, request);
    const id = docId(request.data?.ticketId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la entrada.");
    const doc = await calendarDb(getAdminApp).collection(TICKETS).doc(id).get();
    if (!doc.exists || doc.data().holderUid !== uid) throw new HttpsError("not-found", "Esa entrada no está en tu cuenta.");
    const out = ticketOut(doc);
    return { status: out.status, usedAt: out.usedAt };
  });

  // Gives the ticket away with a link that works once. The QR in the app
  // stops working at once; the link can be cancelled until someone accepts.
  const giftTicket = onCall({ invoker: "public" }, async (request) => {
    const uid = await requireAuth(getAdminApp, request);
    const id = docId(request.data?.ticketId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la entrada.");
    const db = calendarDb(getAdminApp);
    const ref = db.collection(TICKETS).doc(id);
    const token = newToken();
    const expiresAt = Date.now() + GIFT_LINK_MS;
    await db.runTransaction(async (tx) => {
      const ticket = (await tx.get(ref)).data();
      if (!ticket || ticket.holderUid !== uid) throw new HttpsError("not-found", "Esa entrada no está en tu cuenta.");
      if (!["active", "link"].includes(ticket.status)) throw new HttpsError("failed-precondition", "Esa entrada ya no se puede regalar.");
      const event = (await tx.get(db.collection(EVENTS).doc(ticket.eventId))).data();
      if (!event || event.tickets?.giftable === false) throw new HttpsError("failed-precondition", "Las entradas de este evento no se pueden regalar.");
      tx.update(ref, {
        status: "link",
        linkHash: sha(token),
        linkExpiresAt: Timestamp.fromMillis(expiresAt),
        history: history("link", uid),
      });
      tx.set(ref.collection("secret").doc("key"), { key: newKey() }, { merge: true });
    });
    return { url: linkUrl(token), expiresAt };
  });

  // Takes back a link nobody accepted: the ticket gets a new QR.
  const cancelGift = onCall({ invoker: "public" }, async (request) => {
    const uid = await requireAuth(getAdminApp, request);
    const id = docId(request.data?.ticketId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la entrada.");
    const db = calendarDb(getAdminApp);
    const ref = db.collection(TICKETS).doc(id);
    await db.runTransaction(async (tx) => {
      const ticket = (await tx.get(ref)).data();
      if (!ticket || ticket.holderUid !== uid) throw new HttpsError("not-found", "Esa entrada no está en tu cuenta.");
      if (ticket.status !== "link") throw new HttpsError("failed-precondition", "Esa entrada no tiene un link pendiente.");
      tx.update(ref, { status: "active", linkHash: FieldValue.delete(), linkExpiresAt: FieldValue.delete(), history: history("linkCancelled", uid) });
      tx.set(ref.collection("secret").doc("key"), { key: newKey() }, { merge: true });
    });
    return { status: "active" };
  });

  async function ticketByLink(token) {
    const clean = typeof token === "string" && /^[A-Za-z0-9_-]{16,40}$/.test(token) ? token : null;
    if (!clean) throw new HttpsError("invalid-argument", "Ese link no es de una entrada.");
    const snapshot = await calendarDb(getAdminApp).collection(TICKETS).where("linkHash", "==", sha(clean)).limit(1).get();
    const doc = snapshot.docs[0];
    if (!doc || doc.data().status !== "link") throw new HttpsError("not-found", "Ese link ya se usó o lo anularon.");
    if ((millis(doc.data().linkExpiresAt) || 0) < Date.now()) throw new HttpsError("deadline-exceeded", "Ese link venció. Pide que te lo envíen otra vez.");
    return doc;
  }

  // What the link brings, before accepting it. The QR is not sent: the app
  // draws a blurred placeholder until the ticket is accepted.
  const previewGift = onCall({ invoker: "public" }, async (request) => {
    const uid = await requireAuth(getAdminApp, request);
    const doc = await ticketByLink(request.data?.token);
    const ticket = doc.data();
    const event = (await calendarDb(getAdminApp).collection(EVENTS).doc(ticket.eventId).get()).data();
    if (!event) throw new HttpsError("not-found", "Ese evento ya no está disponible.");
    return {
      ticket: { ...ticketOut(doc), holderName: ticket.guestName || "", courseId: "" },
      event: eventOut(ticket.eventId, event, (await institutionNames(getAdminApp, [event.institutionId])).get(event.institutionId)),
      fromName: ticket.holderUid ? ticket.holderName || "" : "",
      organizer: event.authorName || "",
      mine: ticket.holderUid === uid,
    };
  });

  // Accepts a ticket from a link: it moves to this account with a new key.
  const acceptGift = onCall({ invoker: "public" }, async (request) => {
    const uid = await requireAuth(getAdminApp, request);
    const found = await ticketByLink(request.data?.token);
    if (found.data().holderUid === uid) throw new HttpsError("failed-precondition", "Esa entrada ya es tuya. Envía el link a otra persona.");
    const people = identityDb(getAdminApp);
    const profile = (await people.collection("users").doc(uid).get()).data();
    const name = await nameOf(getAdminApp, uid, profile);
    const db = calendarDb(getAdminApp);
    const ref = found.ref;
    const result = await db.runTransaction(async (tx) => {
      const ticket = (await tx.get(ref)).data();
      if (!ticket || ticket.status !== "link" || ticket.linkHash !== found.data().linkHash) {
        throw new HttpsError("not-found", "Ese link ya se usó o lo anularon.");
      }
      tx.update(ref, {
        status: "active",
        holderUid: uid,
        holderName: name,
        courseId: profile?.institutionId === ticket.institutionId ? profile.courseId || "" : "",
        giftedFrom: ticket.holderUid || null,
        giftedFromName: ticket.holderUid ? ticket.holderName || "" : "",
        giftedToName: ticket.holderUid ? name : "",
        receivedAt: FieldValue.serverTimestamp(),
        linkHash: FieldValue.delete(),
        linkExpiresAt: FieldValue.delete(),
        history: history("accepted", uid),
      });
      tx.set(ref.collection("secret").doc("key"), { key: newKey() }, { merge: true });
      return { from: ticket.holderUid };
    });
    return { ticketId: ref.id, giftedFrom: result.from ? true : false };
  });

  // Shares the ticket as an image or downloads it to print. It leaves the
  // app with a fixed code; asking again gives the same code.
  const shareTicket = onCall({ invoker: "public" }, async (request) => {
    const uid = await requireAuth(getAdminApp, request);
    const id = docId(request.data?.ticketId);
    const kind = request.data?.kind === "print" ? "printed" : "shared";
    if (!id) throw new HttpsError("invalid-argument", "Falta la entrada.");
    const db = calendarDb(getAdminApp);
    const ref = db.collection(TICKETS).doc(id);
    const secretRef = ref.collection("secret").doc("key");
    const code = await db.runTransaction(async (tx) => {
      const [ticketDoc, secretDoc] = await Promise.all([tx.get(ref), tx.get(secretRef)]);
      const ticket = ticketDoc.data();
      if (!ticket || ticket.holderUid !== uid) throw new HttpsError("not-found", "Esa entrada no está en tu cuenta.");
      if (["shared", "printed"].includes(ticket.status) && secretDoc.data()?.staticCode) return secretDoc.data().staticCode;
      if (ticket.status !== "active") throw new HttpsError("failed-precondition", "Esa entrada ya no se puede compartir.");
      const event = (await tx.get(db.collection(EVENTS).doc(ticket.eventId))).data();
      if (kind === "printed" && event?.tickets?.printable !== true) throw new HttpsError("failed-precondition", "Las entradas de este evento no se imprimen.");
      const fresh = newStaticCode();
      tx.update(ref, { status: kind, staticHash: sha(`${ticket.eventId}:${fresh}`), history: history(kind, uid) });
      tx.set(secretRef, { key: newKey(), staticCode: fresh }, { merge: true });
      return fresh;
    });
    return { code, qr: `hanet://t/${code}` };
  });

  // ---- The door ----

  // An organizer scans a ticket's QR, a printed one, a typed code, or a
  // HN-QR (that answers with the account's tickets for this event). With
  // `ticketId` it validates that ticket directly, after a HN-QR.
  const validateTicket = onCall({ invoker: "public" }, async (request) => {
    const session = await doorSession(getAdminApp, request, request.data?.eventId);
    const { profile, id: eventId, event } = session;
    if (!doorOpen(event)) throw new HttpsError("failed-precondition", "La puerta se abre 3 horas antes del evento y se cierra un día después.");
    const db = calendarDb(getAdminApp);
    // Opening the scanner: wakes this instance and keeps the session ready.
    if (request.data?.warm === true) return { warm: true, count: doorCount(db, session), total: session.total };
    const raw = typeof request.data?.qr === "string" ? request.data.qr.trim() : "";
    let ref = null;
    let rotating = null;
    let found = null;

    if (docId(request.data?.ticketId)) {
      ref = db.collection(TICKETS).doc(request.data.ticketId);
    } else if (raw.startsWith("hanet://id/")) {
      const uid = await readIdQr(getAdminApp, raw);
      const [person, snapshot] = await Promise.all([
        identityDb(getAdminApp).collection("users").doc(uid).get().then(doc => doc.data()),
        db.collection(TICKETS).where("eventId", "==", eventId).where("holderUid", "==", uid).get(),
      ]);
      const tickets = snapshot.docs.filter(doc => doc.data().status !== "voided").map(rowOut).sort((a, b) => (a.number || 0) - (b.number || 0));
      return {
        result: "account",
        name: text(person?.name, 80) || await nameOf(getAdminApp, uid, person),
        courseId: person?.institutionId === event.institutionId ? person.courseId || "" : "",
        tickets,
        count: doorCount(db, session),
        total: session.total,
      };
    } else {
      const ticketMatch = TICKET_QR.exec(raw);
      if (ticketMatch) {
        ref = db.collection(TICKETS).doc(ticketMatch[1]);
        rotating = ticketMatch[2];
      } else {
        const staticMatch = STATIC_QR.exec(raw);
        const code = normalCode(staticMatch ? staticMatch[1] : TYPED_CODE.test(raw.toUpperCase()) ? raw : "");
        if (!code) throw new HttpsError("invalid-argument", "Ese código no es una entrada de HaNet.");
        const snapshot = await db.collection(TICKETS).where("staticHash", "==", sha(`${eventId}:${code}`)).limit(1).get();
        if (!snapshot.docs[0]) throw new HttpsError("not-found", "No encontramos esa entrada en este evento.");
        found = snapshot.docs[0];
        ref = found.ref;
      }
    }

    // The ticket and its key in one read.
    if (!found) {
      const [doc, keyDoc] = rotating ? await db.getAll(ref, ref.collection("secret").doc("key")) : [await ref.get(), null];
      found = doc;
      if (rotating) {
        const key = keyDoc.data()?.key;
        const step = Math.floor(Date.now() / STEP_MS);
        let fresh = false;
        for (let offset = -STEPS_BEHIND; offset <= STEPS_AHEAD && key && !fresh; offset += 1) {
          fresh = timingSafeEqual(Buffer.from(codeFor(key, step + offset)), Buffer.from(rotating));
        }
        // An old QR of a ticket already used says so instead of "venció".
        if (!fresh && !(doc.data()?.eventId === eventId && doc.data()?.status === "used")) {
          throw new HttpsError("permission-denied", "Ese QR ya venció o es una captura. Pide que abran la entrada en la app.");
        }
      }
    }

    const ticket = found.data();
    if (!ticket || ticket.eventId !== eventId) throw new HttpsError("not-found", "Esa entrada no es de este evento.");
    if (ticket.status === "voided") throw new HttpsError("failed-precondition", "Esa entrada fue anulada.");
    if (ticket.status === "link") throw new HttpsError("failed-precondition", "Esa entrada se regaló y nadie la ha aceptado todavía.");
    let outcome = { result: ticket.status === "used" ? "used" : "valid", ticket };
    if (outcome.result === "valid") {
      const used = {
        status: "used",
        usedAt: FieldValue.serverTimestamp(),
        usedBy: profile.uid,
        usedVia: rotating ? "app" : request.data?.ticketId ? "account" : "code",
        history: history("used", profile.uid),
      };
      try {
        // Written only if nobody touched it since the read (two doors at once,
        // a gift right then); else the transaction below decides.
        await ref.update(used, { lastUpdateTime: found.updateTime });
      } catch (error) {
        if (error.code !== 9) throw error;
        outcome = await db.runTransaction(async (tx) => {
          const current = (await tx.get(ref)).data();
          if (!current || current.status === "voided") throw new HttpsError("failed-precondition", "Esa entrada fue anulada.");
          if (current.status === "link") throw new HttpsError("failed-precondition", "Esa entrada se regaló y nadie la ha aceptado todavía.");
          if (current.status === "used") return { result: "used", ticket: current };
          tx.update(ref, used);
          return { result: "valid", ticket: current };
        });
      }
      if (outcome.result === "valid") session.used += 1;
    }
    const t = outcome.ticket;
    return {
      result: outcome.result,
      ticket: {
        ticketId: ref.id,
        number: t.number || null,
        holderName: t.holderName || t.guestName || "",
        courseId: t.courseId || "",
        usedAt: outcome.result === "used" ? millis(t.usedAt) : Date.now(),
      },
      count: doorCount(db, session),
      total: session.total,
    };
  });

  // ---- Who organizes ----

  // Issues tickets: one per student of some courses (or N per course to one
  // person), one to a person of the school, or a link for a guest.
  const issueTickets = onCall({ invoker: "public", timeoutSeconds: 120 }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const input = request.data || {};
    const { id: eventId, event } = await organizedEvent(getAdminApp, profile, input.eventId);
    if (event.tickets?.enabled === false) throw new HttpsError("failed-precondition", "Este evento no tiene entradas.");
    const mode = ["courses", "single", "guest"].includes(input.mode) ? input.mode : null;
    if (!mode) throw new HttpsError("invalid-argument", "Elige cómo emitir las entradas.");
    const people = identityDb(getAdminApp);
    const db = calendarDb(getAdminApp);
    const perStudent = Math.min(MAX_PER_PERSON, Math.max(1, Math.floor(Number(input.perStudent) || 1)));
    // Each planned ticket: { uid, name, courseId } or a guest.
    const planned = [];
    let skipped = 0;

    if (mode === "courses") {
      const courseIds = Array.isArray(input.courseIds) ? [...new Set(input.courseIds.map(c => text(c, 80)).filter(Boolean))] : [];
      if (!courseIds.length) throw new HttpsError("invalid-argument", "Elige al menos un curso.");
      const snapshot = await people.collection("users").where("institutionId", "==", event.institutionId).get();
      const holders = await db.collection(TICKETS).where("eventId", "==", eventId).select("holderUid", "status").get();
      const already = new Set(holders.docs.filter(doc => doc.data().status !== "voided").map(doc => doc.data().holderUid).filter(Boolean));
      if (input.holder === "courseLead") {
        // Each course's Presidente de curso, unless the call names someone else.
        const leads = input.leadUids && typeof input.leadUids === "object" ? input.leadUids : {};
        for (const courseId of courseIds) {
          const leadUid = docId(leads[courseId]) ? leads[courseId] : null;
          const lead = leadUid
            ? snapshot.docs.find(doc => doc.id === leadUid && doc.data().courseId === courseId)
            : snapshot.docs.find(doc => doc.data().courseId === courseId && doc.data().courseLead === true);
          if (!lead) throw new HttpsError("invalid-argument", `${courseId} no tiene Presidente de curso. Asígnalo o elige a quién darle sus entradas.`);
          if (already.has(lead.id)) { skipped += perStudent; continue; }
          for (let n = 0; n < perStudent; n += 1) planned.push({ uid: lead.id, profile: lead.data(), courseId });
        }
      } else {
        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (!courseIds.includes(data.courseId) || STAFF_ROLES.includes(data.role)) continue;
          if (already.has(doc.id)) { skipped += 1; continue; }
          for (let n = 0; n < perStudent; n += 1) planned.push({ uid: doc.id, profile: data, courseId: data.courseId });
        }
      }
    } else if (mode === "single") {
      const uid = docId(input.uid);
      const person = uid ? (await people.collection("users").doc(uid).get()).data() : null;
      if (!person || person.institutionId !== event.institutionId) throw new HttpsError("invalid-argument", "Esa persona no es de tu institución.");
      const count = Math.min(MAX_PER_PERSON, Math.max(1, Math.floor(Number(input.count) || 1)));
      for (let n = 0; n < count; n += 1) planned.push({ uid, profile: person, courseId: person.courseId || "" });
    } else {
      if (event.tickets?.guestLinks === false) throw new HttpsError("failed-precondition", "Este evento no admite invitados con link.");
      const guestName = text(input.guestName, 80);
      if (!guestName) throw new HttpsError("invalid-argument", "Escribe el nombre de la persona invitada.");
      planned.push({ guestName });
    }

    if (planned.length > MAX_ISSUE) throw new HttpsError("invalid-argument", `Son más de ${MAX_ISSUE} entradas de una vez.`);
    const issued = await issuedCount(db, eventId);
    const cap = ticketCap(event);
    const remaining = cap === null ? null : Math.max(0, cap - issued);
    if (remaining !== null && planned.length > remaining) {
      throw new HttpsError("resource-exhausted", `Quedan ${remaining} entradas y quieres emitir ${planned.length}.`);
    }
    if (input.dryRun === true || !planned.length) {
      return { count: planned.length, skipped, issued, cap, remaining };
    }

    // Numbers come from the event's counter, reserved in one go.
    const eventRef = db.collection(EVENTS).doc(eventId);
    const first = await db.runTransaction(async (tx) => {
      const current = (await tx.get(eventRef)).data();
      const seq = typeof current?.ticketSeq === "number" ? current.ticketSeq : 0;
      tx.update(eventRef, { ticketSeq: seq + planned.length });
      return seq + 1;
    });
    const names = new Map();
    for (const item of planned) {
      if (item.uid && !names.has(item.uid)) names.set(item.uid, await nameOf(getAdminApp, item.uid, item.profile));
    }
    let link = null;
    for (let start = 0; start < planned.length; start += 200) {
      const batch = db.batch();
      planned.slice(start, start + 200).forEach((item, offset) => {
        const ref = db.collection(TICKETS).doc();
        const base = {
          eventId,
          institutionId: event.institutionId,
          number: first + start + offset,
          issuedBy: profile.uid,
          issuedAt: FieldValue.serverTimestamp(),
          history: [{ action: "issued", uid: profile.uid, at: Date.now() }],
        };
        if (item.guestName) {
          const token = newToken();
          const expiresAt = guestLinkExpiry(event);
          batch.set(ref, { ...base, holderUid: null, holderName: "", courseId: "", guestName: item.guestName, status: "link", linkHash: sha(token), linkExpiresAt: Timestamp.fromMillis(expiresAt) });
          link = { ticketId: ref.id, url: linkUrl(token) };
        } else {
          batch.set(ref, { ...base, holderUid: item.uid, holderName: names.get(item.uid), courseId: item.courseId || "", guestName: "", status: "active" });
        }
        batch.set(ref.collection("secret").doc("key"), { key: newKey() });
      });
      await batch.commit();
    }

    const holders = planned.map(item => item.uid).filter(Boolean);
    if (holders.length) {
      await notifyHolders(getAdminApp, holders, {
        title: "Tienes una entrada",
        body: `${event.title || "Un evento"}: ya está en tu perfil, en Entradas.`,
        data: { url: "/tickets" },
      });
    }
    return { count: planned.length, skipped, issued: issued + planned.length, cap, remaining: remaining === null ? null : remaining - planned.length, link: link || undefined };
  });

  // Every ticket of the event, with the totals for "Llegaron X de Y".
  const listEventTickets = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const { id: eventId, event } = await organizedEvent(getAdminApp, profile, request.data?.eventId);
    const snapshot = await calendarDb(getAdminApp).collection(TICKETS).where("eventId", "==", eventId).get();
    const rows = snapshot.docs.map(rowOut).sort((a, b) => (a.number || 0) - (b.number || 0));
    const totals = { issued: 0, active: 0, link: 0, shared: 0, printed: 0, used: 0, voided: 0, gifted: 0, cap: ticketCap(event) };
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const status = STATUSES.includes(data.status) ? data.status : "active";
      totals[status] += 1;
      if (status !== "voided") totals.issued += 1;
      if (data.giftedFrom) totals.gifted += 1;
    }
    const scannerUids = Array.isArray(event.ticketScanners) ? event.ticketScanners : [];
    const people = identityDb(getAdminApp);
    const scannerDocs = scannerUids.length ? await people.getAll(...scannerUids.map(uid => people.collection("users").doc(uid))) : [];
    const scanners = await Promise.all(scannerDocs.map(async doc => ({ uid: doc.id, name: await nameOf(getAdminApp, doc.id, doc.data()) })));
    return { rows, totals, scanners };
  });

  // Voids a ticket. With `replace`, the same holder (or guest) gets a new
  // one with the same number.
  const voidTicket = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const { id: eventId, event } = await organizedEvent(getAdminApp, profile, request.data?.eventId);
    const id = docId(request.data?.ticketId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la entrada.");
    const db = calendarDb(getAdminApp);
    const ref = db.collection(TICKETS).doc(id);
    const replacementRef = db.collection(TICKETS).doc();
    const token = newToken();
    const replace = request.data?.replace === true;
    const old = await db.runTransaction(async (tx) => {
      const ticket = (await tx.get(ref)).data();
      if (!ticket || ticket.eventId !== eventId) throw new HttpsError("not-found", "Esa entrada no es de este evento.");
      if (ticket.status === "voided") throw new HttpsError("failed-precondition", "Esa entrada ya estaba anulada.");
      if (ticket.status === "used" && replace) throw new HttpsError("failed-precondition", "Esa entrada ya se usó.");
      tx.update(ref, {
        status: "voided",
        linkHash: FieldValue.delete(),
        staticHash: FieldValue.delete(),
        voidedAt: FieldValue.serverTimestamp(),
        voidedBy: profile.uid,
        history: history("voided", profile.uid),
      });
      tx.delete(ref.collection("secret").doc("key"));
      if (replace) {
        const guest = !ticket.holderUid;
        tx.set(replacementRef, {
          eventId,
          institutionId: ticket.institutionId,
          number: ticket.number || null,
          holderUid: ticket.holderUid || null,
          holderName: ticket.holderName || "",
          courseId: ticket.courseId || "",
          guestName: ticket.guestName || "",
          status: guest ? "link" : "active",
          ...(guest ? { linkHash: sha(token), linkExpiresAt: Timestamp.fromMillis(guestLinkExpiry(event)) } : {}),
          replaces: id,
          issuedBy: profile.uid,
          issuedAt: FieldValue.serverTimestamp(),
          history: [{ action: "reissued", uid: profile.uid, at: Date.now() }],
        });
        tx.set(replacementRef.collection("secret").doc("key"), { key: newKey() });
      }
      return ticket;
    });
    if (!replace) return { voided: true };
    if (old.holderUid) {
      await notifyHolders(getAdminApp, [old.holderUid], {
        title: "Tu entrada se renovó",
        body: "La anterior ya no sirve. Abre Entradas para ver el QR nuevo.",
        data: { url: "/tickets" },
      });
    }
    return { voided: true, replacement: { ticketId: replacementRef.id, url: old.holderUid ? undefined : linkUrl(token) } };
  });

  // A new link for a guest ticket (the one before stops working).
  const resendTicketLink = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const id = docId(request.data?.ticketId);
    if (!id) throw new HttpsError("invalid-argument", "Falta la entrada.");
    const db = calendarDb(getAdminApp);
    const ref = db.collection(TICKETS).doc(id);
    const ticket = (await ref.get()).data();
    if (!ticket) throw new HttpsError("not-found", "Esa entrada no existe.");
    const { event } = await organizedEvent(getAdminApp, profile, ticket.eventId);
    if (ticket.status !== "link" || ticket.holderUid) throw new HttpsError("failed-precondition", "Solo las entradas de invitados sin aceptar tienen link.");
    const token = newToken();
    await ref.update({ linkHash: sha(token), linkExpiresAt: Timestamp.fromMillis(guestLinkExpiry(event)), history: history("linkResent", profile.uid) });
    return { url: linkUrl(token) };
  });

  // Lets a docente of the institution scan at the door of this event, or
  // takes it back. Who organizes always can.
  const setTicketScanner = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const { id: eventId, event } = await organizedEvent(getAdminApp, profile, request.data?.eventId);
    const uid = docId(request.data?.uid);
    const on = request.data?.on !== false;
    if (!uid) throw new HttpsError("invalid-argument", "Falta la persona.");
    if (on) {
      const person = (await identityDb(getAdminApp).collection("users").doc(uid).get()).data();
      if (!person || person.institutionId !== event.institutionId || person.role !== "Profesor") {
        throw new HttpsError("invalid-argument", "Solo se puede dar acceso a docentes de tu institución.");
      }
      if ((event.ticketScanners || []).length >= MAX_SCANNERS && !(event.ticketScanners || []).includes(uid)) {
        throw new HttpsError("resource-exhausted", `Son ${MAX_SCANNERS} docentes como máximo.`);
      }
    }
    await calendarDb(getAdminApp).collection(EVENTS).doc(eventId).update({
      ticketScanners: on ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid),
    });
    return { on };
  });

  // The events whose door this docente may scan (who organizes sees theirs
  // in listOrganizedEvents, functions/events.js).
  const listMyDoorEvents = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const snapshot = await calendarDb(getAdminApp).collection(EVENTS).where("ticketScanners", "array-contains", profile.uid).limit(30).get();
    const events = snapshot.docs
      .filter(doc => doc.data().institutionId === profile.institutionId && doc.data().status !== "deleted")
      .map(doc => eventOut(doc.id, doc.data()))
      .filter(event => !event.endsAt || event.endsAt + DOOR_CLOSES_MS > Date.now())
      .sort((a, b) => (a.startsAt || 0) - (b.startsAt || 0));
    return { events };
  });

  // Presidente de curso (muxp, 2026-11-19): a cargo on top of the role, one
  // per course, that CEE, Admin or HNT give. It is who receives the course's
  // tickets with holder "courseLead". It does not change what the role can do.
  const setCourseLead = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    if (!ORGANIZERS.includes(profile.role)) throw new HttpsError("permission-denied", "Solo CEE, Administración o el equipo HaNet asignan Presidentes de curso.");
    const uid = docId(request.data?.uid);
    const on = request.data?.on !== false;
    if (!uid) throw new HttpsError("invalid-argument", "Falta la persona.");
    const people = identityDb(getAdminApp);
    const person = (await people.collection("users").doc(uid).get()).data();
    if (!person || person.institutionId !== profile.institutionId || !person.courseId || STAFF_ROLES.includes(person.role)) {
      throw new HttpsError("invalid-argument", "Esa persona no es estudiante de tu institución.");
    }
    const batch = people.batch();
    if (on) {
      const current = await people.collection("users").where("institutionId", "==", profile.institutionId).where("courseLead", "==", true).get();
      for (const doc of current.docs) {
        if (doc.id !== uid && doc.data().courseId === person.courseId) batch.update(doc.ref, { courseLead: FieldValue.delete() });
      }
      batch.update(people.collection("users").doc(uid), { courseLead: true });
    } else {
      batch.update(people.collection("users").doc(uid), { courseLead: FieldValue.delete() });
    }
    await batch.commit();
    return { on, courseId: person.courseId };
  });

  // Each course's Presidente de curso, for who reparte the tickets.
  const listCourseLeads = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    if (!ORGANIZERS.includes(profile.role)) throw new HttpsError("permission-denied", "Solo CEE, Administración o el equipo HaNet ven los Presidentes de curso.");
    const snapshot = await identityDb(getAdminApp).collection("users").where("institutionId", "==", profile.institutionId).where("courseLead", "==", true).get();
    const leads = await Promise.all(snapshot.docs.map(async doc => ({ courseId: doc.data().courseId || "", uid: doc.id, name: await nameOf(getAdminApp, doc.id, doc.data()) })));
    return { leads: leads.sort((a, b) => a.courseId.localeCompare(b.courseId, "es")) };
  });

  return {
    listMyTickets,
    getTicketKey,
    getTicketStatus,
    giftTicket,
    cancelGift,
    previewGift,
    acceptGift,
    shareTicket,
    validateTicket,
    issueTickets,
    listEventTickets,
    voidTicket,
    resendTicketLink,
    setTicketScanner,
    listMyDoorEvents,
    setCourseLead,
    listCourseLeads,
  };
}

module.exports = { build, hasTicket };
