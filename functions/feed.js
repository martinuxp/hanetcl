const { randomUUID } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue, FieldPath } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

// Feed y Comunidad: announcements published by Espacios (group accounts),
// never by a person. Students only read and react; there are no comments and
// no posts between students.
//
// Espacios, by the role of whoever publishes:
//   school  "Comunidad <liceo>"   Admin   whole school, a jornada or courses
//   cee     "CEE <liceo>"         CEE     whole school
//   course  "Directiva <curso>"   Directiva, only for their own course
//   hanet   "HaNet"               HNT     every institution with the module
// HNT may publish in any of them, for testing and to help a school.
//
// In hn-calendar, closed to the app (only these functions read and write):
//   feedPosts/{postId}
//     institutionId (null for HaNet), space, courseId, audience { kind,
//     jornada, courseIds }, body, images [{ path, token }], tags, pinned,
//     reactions { emoji: count }, authorUid, authorName, createdAt, updatedAt
//   feedPosts/{postId}/reactions/{uid}   { emojis: [] }
//   feedReports/{postId_uid}             a report for the panel's moderation
// Who wrote a post is kept for moderation only; the app shows the Espacio.
//
// The module is per institution (institutions/{id}.modules). An institution
// without that list yet keeps the feed on, so the pilot works before the
// panel can switch modules; one with the list and without "feed" has it off.

const BUCKET = "hanet-edu.firebasestorage.app";
const POSTS = "feedPosts";
const REPORTS = "feedReports";
const MODULE = "feed";
const SPACES = ["school", "cee", "course", "hanet"];
const SPACE_ROLES = { school: ["Admin", "HNT"], cee: ["CEE", "HNT"], course: ["Directiva", "HNT"], hanet: ["HNT"] };
// Staff see every post of their school, whoever it was meant for.
const SEE_ALL_ROLES = ["Admin", "HNT"];
const PIN_ROLES = ["Admin", "HNT"];
// Reactions are a closed set, with nothing that reads badly out of context.
const EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "🔥", "👏"];
const DEFAULT_TAGS = ["Avisos", "Actividades", "Aniversario", "Becas", "Deportes", "Pruebas", "Salud"];
const MAX_TAGS = 3;
const MAX_IMAGES = 6;
const MAX_BODY = 2000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// The newest posts read per request. One school in the beta: the list is
// read whole and filtered here, without composite indexes.
const SCAN_LIMIT = 300;
const PAGE_SIZE = 40;
const REPORT_REASONS = ["inapropiado", "falso", "acoso", "otro"];

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

function postId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(value) ? value : null;
}

function storageUrl(path, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** "Segundo Medio K" → "2°K"; anything else stays as it is. */
function courseShort(courseId) {
  const match = /^(Primero|Segundo|Tercero|Cuarto)\s+Medio\s+(\S+)$/i.exec(courseId || "");
  if (!match) return courseId || "";
  const number = { primero: 1, segundo: 2, tercero: 3, cuarto: 4 }[match[1].toLowerCase()];
  return `${number}°${match[2].toUpperCase()}`;
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

// The caller's institution, with the module on.
async function requireModule(getAdminApp, profile) {
  const institution = (await identityDb(getAdminApp).collection("institutions").doc(profile.institutionId).get()).data();
  if (!institution) throw new HttpsError("failed-precondition", "No encontramos tu institución.");
  if (Array.isArray(institution.modules) && !institution.modules.includes(MODULE)) {
    throw new HttpsError("failed-precondition", "Feed y comunidad no está activo en tu institución.");
  }
  return institution;
}

function tagsOf(institution) {
  const custom = Array.isArray(institution?.feed?.tags) ? institution.feed.tags.map(tag => text(tag, 24)).filter(Boolean) : [];
  return custom.length ? custom : DEFAULT_TAGS;
}

/** How an Espacio shows in the app. The panel can rename the school's and the CEE's. */
function spaceOut(space, institution, courseId) {
  const short = institution?.name || "";
  const named = institution?.feed?.spaces?.[space]?.name;
  if (space === "school") return { key: "school", name: text(named, 40) || `Comunidad ${short}`, initials: short.split(/\s+/)[0]?.slice(0, 4) || "LIC", official: true, kind: "Oficial" };
  if (space === "cee") return { key: "cee", name: text(named, 40) || `CEE ${short}`, initials: "CEE", official: false, kind: "Centro de estudiantes" };
  if (space === "course") return { key: `course:${courseId}`, name: `Directiva ${courseShort(courseId)}`, initials: courseShort(courseId).slice(0, 4), official: false, kind: "Directiva de curso" };
  return { key: "hanet", name: "HaNet", initials: "HN", official: true, kind: "Equipo HaNet" };
}

/** The Espacios this person may publish in. */
function spacesFor(profile) {
  return SPACES.filter(space => SPACE_ROLES[space].includes(profile.role) && (space !== "course" || !!profile.courseId));
}

function canManage(profile, post) {
  if (profile.role === "HNT") return true;
  if (post.institutionId !== profile.institutionId) return false;
  if (profile.role === "Admin") return post.space !== "hanet";
  if (!SPACE_ROLES[post.space]?.includes(profile.role)) return false;
  return post.space !== "course" || post.courseId === profile.courseId;
}

// Whether a post reaches this person.
function reaches(post, profile, jornada) {
  if (post.space === "hanet") return true;
  if (post.institutionId !== profile.institutionId) return false;
  if (SEE_ALL_ROLES.includes(profile.role) || canManage(profile, post)) return true;
  if (post.space === "course") return post.courseId === profile.courseId;
  const audience = post.audience || { kind: "all" };
  if (audience.kind === "jornada") return !jornada || audience.jornada === jornada;
  if (audience.kind === "courses") return (audience.courseIds || []).includes(profile.courseId);
  return true;
}

function postOut(doc, institution, mine, profile) {
  const data = doc.data();
  const reactions = data.reactions || {};
  return {
    id: doc.id,
    space: spaceOut(data.space, institution, data.courseId),
    body: data.body || "",
    images: (data.images || []).map(image => storageUrl(image.path, image.token)),
    tags: data.tags || [],
    pinned: data.pinned === true,
    audience: data.audience || { kind: "all" },
    createdAt: millis(data.createdAt),
    edited: !!data.updatedAt && millis(data.updatedAt) - (millis(data.createdAt) || 0) > 60 * 1000,
    reactions: EMOJIS.filter(emoji => reactions[emoji] > 0).map(emoji => ({ emoji, count: reactions[emoji], mine: mine.includes(emoji) })),
    canEdit: canManage(profile, data),
    canPin: profile.role === "HNT" || (profile.role === "Admin" && data.space !== "hanet" && data.institutionId === profile.institutionId),
  };
}

// Moves an image the app uploaded to its staging folder next to the post.
async function moveStagedImage(getAdminApp, uid, uploadPath, id) {
  if (typeof uploadPath !== "string" || !uploadPath.startsWith(`feed-uploads/${uid}/`) || uploadPath.includes("..")) {
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
  const path = `feed/${id}/${randomUUID()}`;
  const token = randomUUID();
  await upload.move(path);
  await bucket.file(path).setMetadata({ contentType: metadata.contentType, metadata: { firebaseStorageDownloadTokens: token } });
  return { path, token };
}

function cleanAudience(input, space) {
  if (space !== "school") return { kind: "all" };
  const kind = ["all", "jornada", "courses"].includes(input?.kind) ? input.kind : "all";
  if (kind === "jornada") {
    if (!["manana", "tarde"].includes(input.jornada)) throw new HttpsError("invalid-argument", "Elige la jornada.");
    return { kind, jornada: input.jornada };
  }
  if (kind === "courses") {
    const courseIds = [...new Set((Array.isArray(input.courseIds) ? input.courseIds : []).map(course => text(course, 60)).filter(Boolean))].slice(0, 60);
    if (!courseIds.length) throw new HttpsError("invalid-argument", "Elige al menos un curso.");
    return { kind, courseIds };
  }
  return { kind: "all" };
}

function build(getAdminApp) {
  const listFeed = onCall({ invoker: "public" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    // The reads that only need the caller go out together: each one is a
    // round trip to the database.
    const [profile, accountSnap, snapshot] = await Promise.all([
      requireProfile(getAdminApp, request),
      identityDb(getAdminApp).collection("accounts").doc(request.auth.uid).get(),
      calendarDb(getAdminApp).collection(POSTS).orderBy("createdAt", "desc").limit(SCAN_LIMIT).get(),
    ]);
    const account = accountSnap.data() || {};
    const jornada = ["manana", "tarde"].includes(account.jornada) ? account.jornada : null;

    const docs = snapshot.docs.filter(doc => reaches(doc.data(), profile, jornada));
    // Pinned posts of the school first, then the newest.
    const ordered = [...docs.filter(doc => doc.data().pinned === true), ...docs.filter(doc => doc.data().pinned !== true)].slice(0, PAGE_SIZE);

    const db = calendarDb(getAdminApp);
    const [institution, mine] = await Promise.all([
      requireModule(getAdminApp, profile),
      ordered.length ? db.getAll(...ordered.map(doc => doc.ref.collection("reactions").doc(profile.uid))) : [],
    ]);

    const spaces = [spaceOut("school", institution), spaceOut("cee", institution)];
    if (profile.courseId) spaces.push(spaceOut("course", institution, profile.courseId));
    spaces.push(spaceOut("hanet", institution));

    return {
      posts: ordered.map((doc, index) => postOut(doc, institution, mine[index]?.data()?.emojis || [], profile)),
      spaces,
      publishAs: spacesFor(profile).map(space => spaceOut(space, institution, profile.courseId)),
      tags: tagsOf(institution),
      emojis: EMOJIS,
      institutionName: institution.name || "",
    };
  });

  const saveFeedPost = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const institution = await requireModule(getAdminApp, profile);
    const input = request.data || {};
    const posts = calendarDb(getAdminApp).collection(POSTS);
    const existingId = postId(input.id);
    const previous = existingId ? (await posts.doc(existingId).get()).data() : null;
    if (existingId && (!previous || !canManage(profile, previous))) {
      throw new HttpsError("not-found", "Esa publicación ya no existe o no puedes editarla.");
    }

    // The Espacio does not change on an edit.
    const space = previous ? previous.space : (SPACES.includes(input.space) ? input.space : spacesFor(profile)[0]);
    if (!previous && (!space || !spacesFor(profile).includes(space))) {
      throw new HttpsError("permission-denied", "Tu rol no publica en el feed.");
    }

    const body = paragraph(input.body, MAX_BODY);
    const catalog = tagsOf(institution);
    const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).filter(tag => catalog.includes(tag)))].slice(0, MAX_TAGS);
    const keep = new Set((Array.isArray(input.keepImages) ? input.keepImages : []).filter(value => typeof value === "string"));
    const kept = (previous?.images || []).filter(image => keep.has(storageUrl(image.path, image.token)));
    const uploads = (Array.isArray(input.uploadPaths) ? input.uploadPaths : []).filter(value => typeof value === "string");
    if (kept.length + uploads.length > MAX_IMAGES) throw new HttpsError("invalid-argument", `Una publicación lleva hasta ${MAX_IMAGES} imágenes.`);
    if (!body && !kept.length && !uploads.length) throw new HttpsError("invalid-argument", "Escribe algo o agrega una imagen.");

    const ref = previous ? posts.doc(existingId) : posts.doc();
    const moved = [];
    for (const uploadPath of uploads) moved.push(await moveStagedImage(getAdminApp, profile.uid, uploadPath, ref.id));

    const fields = {
      body,
      tags,
      images: [...kept, ...moved],
      audience: cleanAudience(input.audience, space),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (PIN_ROLES.includes(profile.role) && typeof input.pinned === "boolean") fields.pinned = input.pinned;

    if (previous) {
      await ref.update(fields);
      const dropped = (previous.images || []).filter(image => !kept.includes(image));
      const bucket = getStorage(getAdminApp()).bucket(BUCKET);
      await Promise.all(dropped.map(image => bucket.file(image.path).delete({ ignoreNotFound: true })));
    } else {
      await ref.set({
        ...fields,
        pinned: fields.pinned === true,
        space,
        institutionId: space === "hanet" ? null : profile.institutionId,
        courseId: space === "course" ? profile.courseId : null,
        reactions: {},
        authorUid: profile.uid,
        authorName: text(profile.name, 80),
        authorRole: profile.role,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { id: ref.id };
  });

  const deleteFeedPost = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const id = postId(request.data?.id);
    if (!id) throw new HttpsError("invalid-argument", "Falta la publicación.");
    const ref = calendarDb(getAdminApp).collection(POSTS).doc(id);
    const data = (await ref.get()).data();
    if (!data) return { ok: true };
    if (!canManage(profile, data)) throw new HttpsError("permission-denied", "No puedes eliminar esta publicación.");
    const reactions = await ref.collection("reactions").get();
    await Promise.all(reactions.docs.map(doc => doc.ref.delete()));
    const bucket = getStorage(getAdminApp()).bucket(BUCKET);
    await Promise.all((data.images || []).map(image => bucket.file(image.path).delete({ ignoreNotFound: true })));
    await ref.delete();
    return { ok: true };
  });

  // Adds or takes back one of the caller's reactions; the counts live on the post.
  const toggleFeedReaction = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    await requireModule(getAdminApp, profile);
    const id = postId(request.data?.id);
    const emoji = request.data?.emoji;
    if (!id || !EMOJIS.includes(emoji)) throw new HttpsError("invalid-argument", "Esa reacción no existe.");
    const account = (await identityDb(getAdminApp).collection("accounts").doc(profile.uid).get()).data() || {};
    const jornada = ["manana", "tarde"].includes(account.jornada) ? account.jornada : null;
    const db = calendarDb(getAdminApp);
    const ref = db.collection(POSTS).doc(id);
    return db.runTransaction(async (tx) => {
      const post = (await tx.get(ref)).data();
      if (!post || !reaches(post, profile, jornada)) throw new HttpsError("not-found", "Esa publicación ya no está disponible.");
      const mineRef = ref.collection("reactions").doc(profile.uid);
      const current = (await tx.get(mineRef)).data()?.emojis || [];
      const had = current.includes(emoji);
      const emojis = had ? current.filter(item => item !== emoji) : [...current, emoji];
      const count = Math.max(0, (post.reactions?.[emoji] || 0) + (had ? -1 : 1));
      tx.update(ref, new FieldPath("reactions", emoji), count);
      if (emojis.length) tx.set(mineRef, { emojis, updatedAt: FieldValue.serverTimestamp() });
      else tx.delete(mineRef);
      return { emoji, count, mine: !had };
    });
  });

  // Fixes a school post at the top, or lets it go.
  const setFeedPostPinned = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    if (!PIN_ROLES.includes(profile.role)) throw new HttpsError("permission-denied", "Solo la administración fija publicaciones.");
    const id = postId(request.data?.id);
    if (!id) throw new HttpsError("invalid-argument", "Falta la publicación.");
    const ref = calendarDb(getAdminApp).collection(POSTS).doc(id);
    const data = (await ref.get()).data();
    if (!data || (profile.role !== "HNT" && (data.space === "hanet" || data.institutionId !== profile.institutionId))) {
      throw new HttpsError("not-found", "Esa publicación ya no existe.");
    }
    const pinned = request.data?.pinned === true;
    await ref.update({ pinned });
    return { pinned };
  });

  // One report per person and post; the panel's moderation reads them.
  const reportFeedPost = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const id = postId(request.data?.id);
    if (!id) throw new HttpsError("invalid-argument", "Falta la publicación.");
    const post = (await calendarDb(getAdminApp).collection(POSTS).doc(id).get()).data();
    if (!post) throw new HttpsError("not-found", "Esa publicación ya no existe.");
    const reason = REPORT_REASONS.includes(request.data?.reason) ? request.data.reason : "otro";
    await calendarDb(getAdminApp).collection(REPORTS).doc(`${id}_${profile.uid}`).set({
      postId: id,
      institutionId: post.institutionId,
      space: post.space,
      reason,
      detail: paragraph(request.data?.detail, 500),
      reporterUid: profile.uid,
      reporterInstitutionId: profile.institutionId,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  });

  return { listFeed, saveFeedPost, deleteFeedPost, toggleFeedReaction, setFeedPostPinned, reportFeedPost };
}

module.exports = { build };
