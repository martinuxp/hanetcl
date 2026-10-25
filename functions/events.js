const { randomUUID } = require("node:crypto");
const { Buffer } = require("node:buffer");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue, FieldPath, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { readIdQr } = require("./hanet-id");

// HaNet Eventos. Two kinds, in hn-calendar's `hnEvents` collection (closed
// to the app; only these functions read and write it):
//   - regional: concerts, fairs and shows in the city, loaded by the HaNet
//     team (HNT), often from a ticketing page ("Importar desde link").
//   - institution: what the school organizes (anniversary, fairs), published
//     by CEE, Admin or HNT for their institution and a jornada.
// Sign-ups live in hnEvents/{id}/signups/{uid}. With signupMode "list" the
// organizers see who signed up; with "count" only how many are going.
// Reactions, the feed's closed set of emojis: counts in `reactions` and each
// person's in hnEvents/{id}/reactions/{uid}. At an institution event the
// organizers scan the attendees' HN-QR (functions/hanet-id.js) and each
// arrival is kept in hnEvents/{id}/checkins/{uid}.
//
// HaNet shows these events; it does not sell tickets or run them.

const BUCKET = "hanet-edu.firebasestorage.app";
const COLLECTION = "hnEvents";
const USER_AGENT = "HaNetEventos/1.0 (+https://hanet-edu.web.app; muxp@muxp.art)";
const REGIONAL_EDITORS = ["HNT"];
const INSTITUTION_EDITORS = ["CEE", "Admin", "HNT"];
const JORNADAS = ["manana", "tarde", "ambas"];
const SIGNUP_MODES = ["list", "count", "none"];
const CATEGORIES = ["music", "concert", "exhibition", "sports", "theatre", "family", "academic", "community", "other"];
const MAX_LISTED = 60;
// The same closed set of reactions as the feed (functions/feed.js).
const EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "🔥", "👏"];
// Check-in opens a while before the event starts and closes a day after it ends.
const CHECKIN_OPENS_MS = 3 * 60 * 60 * 1000;
const CHECKIN_CLOSES_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Photos of the event or the venue, under the buy button.
const MAX_GALLERY = 6;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Ticketing sites "Importar desde link" reads, and nothing else.
const IMPORT_HOSTS = ["tuacceso.cl", "portaltickets.cl", "portaldisc.com", "ticketplus.cl", "passline.com", "vamoh.cl"];
// TEST ONLY, not for the beta: Vamoh's terms (section 15) forbid automated
// extraction and derived services without written permission. Remove it
// before the beta unless Vamoh authorizes it in writing.
const TEST_ONLY_HOSTS = ["vamoh.cl"];
const SOURCE_NAMES = {
  "tuacceso.cl": "TuAcceso", "portaltickets.cl": "Portal Tickets", "portaldisc.com": "Portal Tickets",
  "ticketplus.cl": "Ticketplus", "passline.com": "Passline", "puntoticket.com": "PuntoTicket", "vamoh.cl": "Vamoh",
};
// Signs of an event not meant for a school audience; the form warns before publishing.
const ADULT_SIGNS = [
  /discoteca/i, /\bdisco\b/i, /\bclub nocturno\b/i, /vida nocturna/i, /\bafter\b/i, /open bar/i, /barra libre/i,
  /\+ ?18/, /mayores de (18|edad)/i, /solo adultos/i, /\bperreo\b/i, /\bfiesta\b/i, /\bcerveza/i, /\bwhisky\b/i, /\bpiscola/i, /\bstand ?up adult/i,
];

function adultWarnings(...values) {
  const textToCheck = values.filter(Boolean).join(" \n ");
  const hits = [...new Set(ADULT_SIGNS.map(sign => textToCheck.match(sign)?.[0]).filter(Boolean))];
  return hits.length ? [`Revisa si es apto para estudiantes: menciona «${hits.slice(0, 3).join("», «")}».`] : [];
}

function calendarDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-calendar");
}

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function text(value, max) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function paragraph(value, max) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
    : "";
}

function millis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : null;
}

function cleanUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 600) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function eventId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(value) ? value : null;
}

async function requireProfile(getAdminApp, request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const snapshot = await identityDb(getAdminApp).collection("users").doc(request.auth.uid).get();
  const profile = snapshot.data();
  if (!profile || !profile.institutionId) {
    throw new HttpsError("failed-precondition", "Primero vincula tu HaNet ID con tu institución.");
  }
  return { uid: request.auth.uid, ...profile };
}

async function displayName(getAdminApp, profile) {
  const name = text(profile.name, 80);
  if (name) return name;
  const account = await identityDb(getAdminApp).collection("accounts").doc(profile.uid).get();
  return text(account.data()?.fullName, 80) || "HaNet";
}

function canEdit(profile, data) {
  if (data.kind === "regional") return REGIONAL_EDITORS.includes(profile.role);
  return INSTITUTION_EDITORS.includes(profile.role) && data.institutionId === profile.institutionId;
}

function imageUrl(data) {
  if (data.imagePath && data.imageToken) {
    return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(data.imagePath)}?alt=media&token=${data.imageToken}`;
  }
  return data.imageUrl || null;
}

function eventOut(doc, extra = {}) {
  const data = doc.data();
  return {
    id: doc.id,
    kind: data.kind,
    status: data.status,
    title: data.title,
    category: data.category || "other",
    description: data.description || "",
    imageUrl: imageUrl(data),
    gallery: galleryOut(data),
    startsAt: millis(data.startsAt),
    endsAt: millis(data.endsAt),
    venueName: data.venueName || "",
    address: data.address || "",
    city: data.city || "",
    region: data.region || "",
    priceFrom: typeof data.priceFrom === "number" ? data.priceFrom : null,
    isFree: data.isFree === true,
    ticketUrl: data.ticketUrl || "",
    sourceName: data.sourceName || "",
    sourceUrl: data.sourceUrl || "",
    sponsored: data.sponsored === true,
    perk: data.perk || "",
    editorial: data.editorial || null,
    coupon: data.coupon || null,
    palette: data.palette?.source && data.palette.source === imageUrl(data) ? data.palette.colors : [],
    jornada: data.jornada || "ambas",
    signupMode: data.signupMode || "none",
    capacity: typeof data.capacity === "number" ? data.capacity : null,
    authorName: data.authorName || "",
    reactions: EMOJIS.filter(emoji => data.reactions?.[emoji] > 0).map(emoji => ({ emoji, count: data.reactions[emoji], mine: false })),
    ...extra,
  };
}

/** Marks the reactions this person gave. */
function withMine(reactions, mine) {
  return reactions.map(reaction => ({ ...reaction, mine: mine.includes(reaction.emoji) }));
}

/** Whether this person can see the event at all. */
function visibleTo(data, profile, editor) {
  if (!data) return false;
  if (data.kind === "institution" && data.institutionId !== profile.institutionId) return false;
  return data.status === "published" || editor;
}

/** What a feed post shows of an event it shares; null when the event is not there for this person. */
function eventSummary(doc, institutionId) {
  const data = doc.exists ? doc.data() : null;
  if (!data || data.status !== "published") return null;
  if (data.kind === "institution" && data.institutionId !== institutionId) return null;
  return {
    id: doc.id,
    kind: data.kind,
    title: data.title,
    startsAt: millis(data.startsAt),
    endsAt: millis(data.endsAt),
    imageUrl: imageUrl(data),
    venueName: data.venueName || "",
    city: data.city || "",
    palette: data.palette?.source && data.palette.source === imageUrl(data) ? data.palette.colors : [],
  };
}

function checkinOpen(data, now = Date.now()) {
  const start = millis(data.startsAt) || 0;
  const end = millis(data.endsAt) || start;
  return now >= start - CHECKIN_OPENS_MS && now <= end + CHECKIN_CLOSES_MS;
}

// How it stands for the caller: whether they signed up and how many did.
async function withSignups(ref, uid) {
  const [count, mine] = await Promise.all([
    ref.collection("signups").count().get(),
    ref.collection("signups").doc(uid).get(),
  ]);
  return { signupCount: count.data().count, signedUp: mine.exists };
}

// The structured data a ticketing page publishes for search engines
// (schema.org Event in JSON-LD, then Open Graph), as a draft to review.
function readEventPage(html, pageUrl) {
  const draft = { title: "", description: "", imageUrl: "", images: [], startsAt: null, endsAt: null, venueName: "", address: "", city: "", priceFrom: null, ticketUrl: pageUrl };
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  const nodes = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.trim());
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== "object") continue;
        nodes.push(node);
        if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
      }
    } catch {
      // A malformed block is skipped.
    }
  }
  const isEvent = node => [].concat(node["@type"] || []).some(type => /Event$/.test(String(type)));
  const event = nodes.find(isEvent);
  if (event) {
    draft.title = text(event.name, 120);
    draft.description = paragraph(String(event.description || "").replace(/<[^>]+>/g, " "), 3000);
    const images = [].concat(event.image || []).map(image => cleanUrl(typeof image === "string" ? image : image?.url)).filter(Boolean);
    draft.imageUrl = images[0] || "";
    // The other images of the page, for the gallery.
    draft.images = [...new Set(images.slice(1))].slice(0, MAX_GALLERY);
    const start = Date.parse(event.startDate);
    const end = Date.parse(event.endDate);
    draft.startsAt = Number.isFinite(start) ? start : null;
    draft.endsAt = Number.isFinite(end) ? end : null;
    const place = [].concat(event.location || [])[0] || {};
    draft.venueName = text(place.name, 120);
    const address = place.address || {};
    draft.address = text(typeof address === "string" ? address : address.streetAddress, 160);
    draft.city = text(typeof address === "string" ? "" : address.addressLocality, 60);
    const prices = [].concat(event.offers || []).flatMap(offer => [offer?.price, offer?.lowPrice]).map(Number).filter(value => Number.isFinite(value) && value > 0);
    draft.priceFrom = prices.length ? Math.min(...prices) : null;
  }
  const meta = (property) => {
    const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i"));
    return match ? match[1].replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'") : "";
  };
  // Aggregators (Vamoh) answer in an FAQ where it is and where tickets are sold.
  const faq = nodes.find(node => [].concat(node["@type"] || []).includes("FAQPage"));
  for (const entry of [].concat(faq?.mainEntity || [])) {
    const question = String(entry?.name || "");
    const answer = String(entry?.acceptedAnswer?.text || "");
    if (/^¿Dónde es/i.test(question) && !draft.address) {
      const parts = answer.split(",").map(part => part.trim()).filter(Boolean);
      draft.address = text(parts.slice(1, 2).join(", "), 160);
      draft.city = draft.city || text(parts.find(part => /^[0-9]{5,7} /.test(part))?.replace(/^[0-9]+ /, "") || "", 60);
    } else if (/^¿Dónde se compran/i.test(question)) {
      const link = answer.match(/https?:\/\/\S+/);
      if (link) draft.originalTicketUrl = cleanUrl(link[0].replace(/[.,)]+$/, ""));
    } else if (/^¿Qué tipo de evento/i.test(question)) {
      draft.typeLabel = text(answer.replace(/^Es un evento de /i, "").replace(/\.$/, ""), 60);
    }
  }
  draft.title = draft.title || text(meta("og:title"), 120);
  draft.description = draft.description || paragraph(meta("og:description"), 3000);
  draft.imageUrl = draft.imageUrl || cleanUrl(meta("og:image"));
  return draft;
}

// Whether robots.txt lets a general crawler read that path.
function hsl([red, green, blue]) {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/**
 * The cover's most telling colors, most vivid first, for the light behind the
 * event page (the app blends them with HaNet's own). Reads the cover shrunk to
 * a 6×6 grid; null when it cannot be read.
 */
async function coverPalette(url) {
  try {
    if (!/^https:\/\//.test(url)) return null;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES * 2) return null;
    const sharp = require("sharp");
    const raw = await sharp(bytes).resize(6, 6, { fit: "cover" }).removeAlpha().raw().toBuffer();
    const pixels = [];
    for (let index = 0; index + 2 < raw.length; index += 3) pixels.push([raw[index], raw[index + 1], raw[index + 2]]);
    const ranked = pixels
      .map(rgb => ({ rgb, ...hsl(rgb) }))
      .map(pixel => ({ ...pixel, score: pixel.s * Math.max(0, 1 - Math.abs(pixel.l - 0.5) * 2.2) + 0.001 }))
      .sort((a, b) => b.score - a.score);
    const picked = [];
    for (const pixel of ranked) {
      const distinct = picked.every(other => {
        const hueGap = Math.min(Math.abs(other.h - pixel.h), 360 - Math.abs(other.h - pixel.h));
        return hueGap >= 28 || Math.abs(other.l - pixel.l) >= 0.3;
      });
      if (distinct) picked.push(pixel);
      if (picked.length === 4) break;
    }
    const hex = ({ rgb }) => `#${rgb.map(value => value.toString(16).padStart(2, "0")).join("")}`;
    return picked.map(hex);
  } catch (error) {
    console.warn("coverPalette", error.message);
    return null;
  }
}

/** Reads the cover's colors and keeps them with the event. */
async function keepCoverPalette(ref, cover) {
  const colors = await coverPalette(cover);
  if (colors) await ref.update({ palette: { source: cover, colors } }).catch(() => {});
  return colors;
}

async function robotsAllow(url) {
  try {
    const response = await fetch(`${url.origin}/robots.txt`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return true;
    const lines = (await response.text()).split(/\r?\n/);
    let applies = false;
    const disallowed = [];
    for (const raw of lines) {
      const line = raw.replace(/#.*/, "").trim();
      const [key, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (/^user-agent$/i.test(key)) applies = value === "*";
      else if (applies && /^disallow$/i.test(key) && value) disallowed.push(value);
    }
    // Rules can carry * and a final $ (Disallow: /ticket*).
    const matches = rule => new RegExp(`^${rule.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`).test(url.pathname);
    return !disallowed.some(matches);
  } catch {
    return true;
  }
}

function storageUrl(path, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

function galleryOut(data) {
  return (data.gallery || []).map(item => (item.path ? storageUrl(item.path, item.token) : item.url)).filter(Boolean);
}

// Moves an image the app uploaded to its staging folder next to the event.
async function moveStagedImage(getAdminApp, uid, uploadPath, eventId) {
  if (typeof uploadPath !== "string" || !uploadPath.startsWith(`events-uploads/${uid}/`) || uploadPath.includes("..")) {
    throw new HttpsError("invalid-argument", "No encontramos la imagen subida.");
  }
  const bucket = getStorage(getAdminApp()).bucket(BUCKET);
  const upload = bucket.file(uploadPath);
  const [exists] = await upload.exists();
  if (!exists) throw new HttpsError("not-found", "No encontramos la imagen subida.");
  const [metadata] = await upload.getMetadata();
  if (!IMAGE_TYPES.includes(metadata.contentType) || Number(metadata.size) > MAX_IMAGE_BYTES) {
    await upload.delete({ ignoreNotFound: true });
    throw new HttpsError("invalid-argument", "Las imágenes tienen que ser JPG, PNG o WebP de hasta 5 MB.");
  }
  const path = `events/${eventId}/${randomUUID()}`;
  const token = randomUUID();
  await upload.move(path);
  await bucket.file(path).setMetadata({ contentType: metadata.contentType, metadata: { firebaseStorageDownloadTokens: token } });
  return { path, token };
}

function build(getAdminApp) {
  const listEvents = onCall({ invoker: "public" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const kind = request.data?.kind === "institution" ? "institution" : "regional";
    const events = calendarDb(getAdminApp).collection(COLLECTION);
    const since = Timestamp.fromMillis(Date.now() - 12 * 60 * 60 * 1000);
    // The reads that only need the caller go out together: each one is a
    // round trip to the database.
    const [profile, snapshot, accountSnap] = await Promise.all([
      requireProfile(getAdminApp, request),
      // One range on the date (no composite index needed); the rest is
      // filtered here, the list is short.
      events.where("startsAt", ">=", since).orderBy("startsAt", "asc").limit(400).get(),
      identityDb(getAdminApp).collection("accounts").doc(request.auth.uid).get(),
    ]);

    // A jornada sees its own events and those for both.
    const account = accountSnap.data() || {};
    const jornada = ["manana", "tarde"].includes(account.jornada) ? account.jornada : null;
    const docs = snapshot.docs.filter((doc) => {
      const data = doc.data();
      if (data.kind !== kind || data.status !== "published") return false;
      if (kind === "regional") return true;
      return data.institutionId === profile.institutionId && (!jornada || [jornada, "ambas"].includes(data.jornada || "ambas"));
    }).slice(0, MAX_LISTED);

    const [list, institutionName] = await Promise.all([
      Promise.all(docs.map(async (doc) => (
        kind === "institution" && doc.data().signupMode !== "none"
          ? eventOut(doc, await withSignups(doc.ref, profile.uid))
          : eventOut(doc)
      ))),
      kind === "institution"
        ? identityDb(getAdminApp).collection("institutions").doc(profile.institutionId).get().then(doc => doc.data()?.name || null)
        : null,
    ]);
    return {
      events: list,
      jornada,
      institutionName,
      canPublish: kind === "regional" ? REGIONAL_EDITORS.includes(profile.role) : INSTITUTION_EDITORS.includes(profile.role),
    };
  });

  const getEvent = onCall({ invoker: "public" }, async (request) => {
    const id = eventId(request.data?.id);
    if (!id) throw new HttpsError("invalid-argument", "Falta el evento.");
    const ref = calendarDb(getAdminApp).collection(COLLECTION).doc(id);
    const [profile, doc] = await Promise.all([requireProfile(getAdminApp, request), ref.get()]);
    const data = doc.data();
    const editor = data ? canEdit(profile, data) : false;
    if (!visibleTo(data, profile, editor)) {
      throw new HttpsError("not-found", "Ese evento ya no está disponible.");
    }
    const mine = (await ref.collection("reactions").doc(profile.uid).get()).data()?.emojis || [];
    const extra = { canEdit: editor, emojis: EMOJIS };
    // The cover's colors are read when the event is saved; events saved
    // before that get them here, once.
    const cover = imageUrl(data);
    if (cover && data.palette?.source !== cover) {
      const colors = await keepCoverPalette(ref, cover);
      if (colors) extra.palette = colors;
    }
    if (data.kind === "institution" && data.signupMode !== "none") {
      Object.assign(extra, await withSignups(ref, profile.uid));
      // Organizers see who signed up when the event keeps a list.
      if (editor && data.signupMode === "list") {
        const signups = await ref.collection("signups").orderBy("createdAt", "asc").limit(500).get();
        extra.signups = signups.docs.map(item => ({ name: item.data().name, courseId: item.data().courseId || "", createdAt: millis(item.data().createdAt) }));
      }
    }
    if (data.kind === "institution") {
      if (editor) {
        const checkins = await ref.collection("checkins").orderBy("at", "desc").limit(500).get();
        extra.checkins = checkins.docs.map(item => ({ name: item.data().name, courseId: item.data().courseId || "", at: millis(item.data().at) }));
        extra.canCheckIn = checkinOpen(data);
      } else {
        extra.checkedIn = (await ref.collection("checkins").doc(profile.uid).get()).exists;
      }
    }
    const out = eventOut(doc, extra);
    return { ...out, reactions: withMine(out.reactions, mine) };
  });

  const saveEvent = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const input = request.data || {};
    const kind = input.kind === "institution" ? "institution" : "regional";
    const allowed = kind === "regional" ? REGIONAL_EDITORS : INSTITUTION_EDITORS;
    if (!allowed.includes(profile.role)) {
      throw new HttpsError("permission-denied", kind === "regional" ? "Solo el equipo HaNet publica eventos de la ciudad." : "Solo el CEE y la administración publican eventos del liceo.");
    }

    const title = text(input.title, 120);
    const startsAt = Number(input.startsAt);
    const endsAt = input.endsAt ? Number(input.endsAt) : null;
    if (title.length < 3) throw new HttpsError("invalid-argument", "Escribe el nombre del evento.");
    if (!Number.isFinite(startsAt) || startsAt <= 0) throw new HttpsError("invalid-argument", "Elige cuándo empieza.");
    if (endsAt !== null && (!Number.isFinite(endsAt) || endsAt < startsAt)) throw new HttpsError("invalid-argument", "El término tiene que ser después del inicio.");

    const fields = {
      kind,
      status: input.status === "draft" ? "draft" : "published",
      title,
      category: CATEGORIES.includes(input.category) ? input.category : "other",
      description: paragraph(input.description, 4000),
      startsAt: Timestamp.fromMillis(startsAt),
      endsAt: endsAt ? Timestamp.fromMillis(endsAt) : null,
      venueName: text(input.venueName, 120),
      address: text(input.address, 160),
      city: text(input.city, 60),
      region: text(input.region, 60),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (kind === "regional") {
      const price = Number(input.priceFrom);
      Object.assign(fields, {
        priceFrom: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
        isFree: input.isFree === true,
        ticketUrl: cleanUrl(input.ticketUrl),
        sourceName: text(input.sourceName, 60),
        sourceUrl: cleanUrl(input.sourceUrl),
        sponsored: input.sponsored === true,
        perk: text(input.perk, 80),
        // A discount HaNet got for its community; only shown when there is one.
        coupon: input.coupon && text(input.coupon.code, 40)
          ? { code: text(input.coupon.code, 40), description: text(input.coupon.description, 120) }
          : null,
        imageUrl: cleanUrl(input.imageUrl),
        editorial: input.editorial && text(input.editorial.subject, 80)
          ? {
            subject: text(input.editorial.subject, 80),
            summary: paragraph(input.editorial.summary, 2000),
            sourceName: text(input.editorial.sourceName, 60),
            sourceUrl: cleanUrl(input.editorial.sourceUrl),
          }
          : null,
      });
    } else {
      const capacity = Number(input.capacity);
      Object.assign(fields, {
        institutionId: profile.institutionId,
        jornada: JORNADAS.includes(input.jornada) ? input.jornada : "ambas",
        signupMode: SIGNUP_MODES.includes(input.signupMode) ? input.signupMode : "none",
        capacity: Number.isFinite(capacity) && capacity > 0 ? Math.round(capacity) : null,
      });
    }

    const events = calendarDb(getAdminApp).collection(COLLECTION);
    const existingId = eventId(input.id);
    const ref = existingId ? events.doc(existingId) : events.doc();
    if (existingId) {
      const previous = (await ref.get()).data();
      if (!previous || previous.kind !== kind || !canEdit(profile, previous)) {
        throw new HttpsError("not-found", "Ese evento ya no existe o no puedes editarlo.");
      }
      await ref.update(fields);
    } else {
      await ref.set({ ...fields, authorUid: profile.uid, authorName: await displayName(getAdminApp, profile), createdAt: FieldValue.serverTimestamp() });
    }

    const bucket = getStorage(getAdminApp()).bucket(BUCKET);
    const current = (await ref.get()).data() || {};

    // A new cover replaces the previous one.
    if (typeof input.uploadPath === "string" && input.uploadPath) {
      const moved = await moveStagedImage(getAdminApp, profile.uid, input.uploadPath, ref.id);
      await ref.update({ imagePath: moved.path, imageToken: moved.token });
      if (current.imagePath) await bucket.file(current.imagePath).delete({ ignoreNotFound: true });
    }

    // The gallery: the photos kept (by their address), new uploads and, for
    // city events, images of the ticketing page.
    if (Array.isArray(input.galleryKeep) || Array.isArray(input.galleryUploads) || Array.isArray(input.galleryUrls)) {
      const keep = new Set((Array.isArray(input.galleryKeep) ? input.galleryKeep : []).filter(value => typeof value === "string"));
      const previous = current.gallery || [];
      const kept = previous.filter(item => keep.has(item.path ? storageUrl(item.path, item.token) : item.url));
      const dropped = previous.filter(item => !kept.includes(item));
      const external = kind === "regional"
        ? (Array.isArray(input.galleryUrls) ? input.galleryUrls : []).map(cleanUrl).filter(Boolean).map(url => ({ url }))
        : [];
      const uploads = (Array.isArray(input.galleryUploads) ? input.galleryUploads : []).slice(0, MAX_GALLERY);
      if (kept.length + external.length + uploads.length > MAX_GALLERY) {
        throw new HttpsError("invalid-argument", `Un evento lleva hasta ${MAX_GALLERY} fotos.`);
      }
      const moved = [];
      for (const uploadPath of uploads) moved.push(await moveStagedImage(getAdminApp, profile.uid, uploadPath, ref.id));
      await ref.update({ gallery: [...kept, ...external.filter(item => !kept.some(old => old.url === item.url)), ...moved] });
      await Promise.all(dropped.filter(item => item.path).map(item => bucket.file(item.path).delete({ ignoreNotFound: true })));
    }

    // The cover's colors, so opening the event does not have to read them.
    const saved = (await ref.get()).data() || {};
    const cover = imageUrl(saved);
    if (cover && saved.palette?.source !== cover) await keepCoverPalette(ref, cover);
    return { id: ref.id };
  });

  // Cancelled events stay visible as cancelled until they pass; deleting
  // takes them and their sign-ups away.
  const deleteEvent = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const id = eventId(request.data?.id);
    if (!id) throw new HttpsError("invalid-argument", "Falta el evento.");
    const ref = calendarDb(getAdminApp).collection(COLLECTION).doc(id);
    const data = (await ref.get()).data();
    if (!data) return { ok: true };
    if (!canEdit(profile, data)) throw new HttpsError("permission-denied", "No puedes eliminar este evento.");
    const children = await Promise.all(["signups", "reactions", "checkins"].map(name => ref.collection(name).get()));
    await Promise.all(children.flatMap(snapshot => snapshot.docs).map(doc => doc.ref.delete()));
    const bucket = getStorage(getAdminApp()).bucket(BUCKET);
    const files = [data.imagePath, ...(data.gallery || []).map(item => item.path)].filter(Boolean);
    await Promise.all(files.map(path => bucket.file(path).delete({ ignoreNotFound: true })));
    await ref.delete();
    return { ok: true };
  });

  // A student signs up for an institution event or takes it back.
  const toggleEventSignup = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const id = eventId(request.data?.id);
    if (!id) throw new HttpsError("invalid-argument", "Falta el evento.");
    const ref = calendarDb(getAdminApp).collection(COLLECTION).doc(id);
    const name = await displayName(getAdminApp, profile);
    const signedUp = await calendarDb(getAdminApp).runTransaction(async (tx) => {
      const event = (await tx.get(ref)).data();
      if (!event || event.kind !== "institution" || event.institutionId !== profile.institutionId || event.status !== "published") {
        throw new HttpsError("not-found", "Ese evento ya no está disponible.");
      }
      if (event.signupMode === "none") throw new HttpsError("failed-precondition", "Este evento no lleva inscripción.");
      if ((millis(event.endsAt) ?? millis(event.startsAt)) < Date.now()) throw new HttpsError("failed-precondition", "Este evento ya pasó.");
      const mineRef = ref.collection("signups").doc(profile.uid);
      const mine = await tx.get(mineRef);
      if (mine.exists) {
        tx.delete(mineRef);
        return false;
      }
      if (event.capacity) {
        const count = (await tx.get(ref.collection("signups").count())).data().count;
        if (count >= event.capacity) throw new HttpsError("resource-exhausted", "Se acabaron los cupos de este evento.");
      }
      tx.set(mineRef, {
        uid: profile.uid,
        // The name only when organizers keep a list.
        name: event.signupMode === "list" ? name : "",
        courseId: event.signupMode === "list" ? profile.courseId || "" : "",
        createdAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    return { signedUp, ...(await withSignups(ref, profile.uid)) };
  });

  // Adds or takes back one of the caller's reactions to an event.
  const toggleEventReaction = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const id = eventId(request.data?.id);
    const emoji = request.data?.emoji;
    if (!id || !EMOJIS.includes(emoji)) throw new HttpsError("invalid-argument", "Esa reacción no existe.");
    const db = calendarDb(getAdminApp);
    const ref = db.collection(COLLECTION).doc(id);
    return db.runTransaction(async (tx) => {
      const event = (await tx.get(ref)).data();
      if (!event || event.status !== "published" || !visibleTo(event, profile, false)) throw new HttpsError("not-found", "Ese evento ya no está disponible.");
      const mineRef = ref.collection("reactions").doc(profile.uid);
      const current = (await tx.get(mineRef)).data()?.emojis || [];
      const had = current.includes(emoji);
      const emojis = had ? current.filter(item => item !== emoji) : [...current, emoji];
      const count = Math.max(0, (event.reactions?.[emoji] || 0) + (had ? -1 : 1));
      tx.update(ref, new FieldPath("reactions", emoji), count);
      if (emojis.length) tx.set(mineRef, { emojis, updatedAt: FieldValue.serverTimestamp() });
      else tx.delete(mineRef);
      return { emoji, count, mine: !had };
    });
  });

  // An organizer scans an attendee's HN-QR at the door. Only people of the
  // event's institution count; scanning someone twice is harmless.
  const checkInEventAttendee = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const id = eventId(request.data?.id);
    if (!id) throw new HttpsError("invalid-argument", "Falta el evento.");
    const ref = calendarDb(getAdminApp).collection(COLLECTION).doc(id);
    const event = (await ref.get()).data();
    if (!event || event.kind !== "institution" || !canEdit(profile, event)) {
      throw new HttpsError("permission-denied", "Solo quienes organizan el evento pasan lista.");
    }
    if (!checkinOpen(event)) throw new HttpsError("failed-precondition", "La lista se abre 3 horas antes del evento y se cierra un día después.");

    const uid = await readIdQr(getAdminApp, request.data?.qr);
    const person = (await identityDb(getAdminApp).collection("users").doc(uid).get()).data();
    if (!person || person.institutionId !== event.institutionId) {
      throw new HttpsError("failed-precondition", "Esa persona no es de tu institución.");
    }
    const name = await displayName(getAdminApp, { ...person, uid });
    const checkinRef = ref.collection("checkins").doc(uid);
    const [previous, signup] = await Promise.all([checkinRef.get(), ref.collection("signups").doc(uid).get()]);
    if (!previous.exists) {
      await checkinRef.set({ uid, name, courseId: person.courseId || "", at: FieldValue.serverTimestamp(), byUid: profile.uid });
    }
    const count = (await ref.collection("checkins").count().get()).data().count;
    return {
      name,
      courseId: person.courseId || "",
      already: previous.exists,
      signedUp: event.signupMode === "none" ? null : signup.exists,
      count,
    };
  });

  // Panel HNT: reads a ticketing page and returns a draft for the form.
  const importEventFromUrl = onCall({ invoker: "public", timeoutSeconds: 30 }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    if (!REGIONAL_EDITORS.includes(profile.role)) throw new HttpsError("permission-denied", "Esta acción es solo para el equipo HaNet.");
    const raw = cleanUrl(request.data?.url);
    if (!raw) throw new HttpsError("invalid-argument", "Pega el link completo del evento.");
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    const site = IMPORT_HOSTS.find(allowed => host === allowed || host.endsWith(`.${allowed}`));
    if (!site) throw new HttpsError("invalid-argument", `Por ahora se importa desde ${IMPORT_HOSTS.join(", ")}.`);
    if (!(await robotsAllow(url))) throw new HttpsError("failed-precondition", "Ese sitio pide no leer esa página automáticamente. Carga el evento a mano.");

    let html;
    try {
      const response = await fetch(url.toString(), {
        headers: { "User-Agent": USER_AGENT, "Accept": "text/html" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      html = (await response.text()).slice(0, 2_000_000);
    } catch (error) {
      console.error("importEventFromUrl", host, error.message);
      throw new HttpsError("unavailable", "No pudimos abrir esa página. Inténtalo de nuevo o carga el evento a mano.");
    }
    const draft = readEventPage(html, url.toString());
    if (!draft.title) throw new HttpsError("not-found", "Esa página no trae los datos del evento. Cárgalo a mano.");
    const warnings = adultWarnings(draft.title, draft.description, draft.typeLabel);
    const testOnly = TEST_ONLY_HOSTS.includes(site);
    // From an aggregator, tickets are bought at the original site; that is the source shown.
    let sourceName = SOURCE_NAMES[site];
    let ticketUrl = draft.ticketUrl;
    if (testOnly) {
      warnings.unshift("Prueba: los términos de Vamoh no permiten reutilizar sus datos. No publiques esto en la beta.");
      if (draft.originalTicketUrl) {
        ticketUrl = draft.originalTicketUrl;
        const original = new URL(draft.originalTicketUrl).hostname.replace(/^www\./, "");
        sourceName = `${SOURCE_NAMES[original] || original} (vía Vamoh)`;
      }
    }
    const { originalTicketUrl, typeLabel, ...fields } = draft;
    void originalTicketUrl;
    return { ...fields, ticketUrl, sourceName, sourceUrl: url.toString(), typeLabel: typeLabel || "", warnings, testOnly };
  });

  return { listEvents, getEvent, saveEvent, deleteEvent, toggleEventSignup, toggleEventReaction, checkInEventAttendee, importEventFromUrl };
}

module.exports = { build, readEventPage, eventSummary };
