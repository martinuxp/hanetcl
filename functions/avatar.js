const { randomBytes } = require("node:crypto");
const { getFirestore } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");

// Blobatars (blobatar.dev): the picture of whoever has no photo. Each account
// keeps a random seed (accounts/{uid}.avatarSeed), never its uid, email or
// name, so the image and its address say nothing about the person. "Otro"
// in the profile draws a new seed.

// Colour comes from the seed; the tone is fixed so every blob is as bright
// as the others on HaNet's dark surfaces. Keep in step with components/ui/hanet-avatar.tsx.
const AVATAR_TONE = 0.5;
const SEED_PATTERN = /^[A-Za-z0-9_-]{12,40}$/;

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function newSeed() {
  return randomBytes(12).toString("base64url");
}

/** Each uid's seed; accounts that have none get one now. */
async function avatarSeeds(getAdminApp, uids) {
  const unique = [...new Set(uids.filter(uid => typeof uid === "string" && uid && !uid.includes("/")))];
  const seeds = new Map();
  if (!unique.length) return seeds;
  const db = identityDb(getAdminApp);
  const accounts = await db.getAll(...unique.map(uid => db.collection("accounts").doc(uid)));
  const batch = db.batch();
  let created = 0;
  accounts.forEach((doc, index) => {
    let seed = doc.data()?.avatarSeed;
    if (typeof seed !== "string" || !SEED_PATTERN.test(seed)) {
      seed = newSeed();
      batch.set(doc.ref, { avatarSeed: seed }, { merge: true });
      created += 1;
    }
    seeds.set(unique[index], seed);
  });
  if (created) await batch.commit();
  return seeds;
}

async function avatarSeed(getAdminApp, uid) {
  return (await avatarSeeds(getAdminApp, [uid])).get(uid) || null;
}

/** Address of a blob as a PNG, for emails (they do not show SVG). */
function avatarPngUrl(seed) {
  return `https://hanet-edu.web.app/avatar/${encodeURIComponent(seed)}.png`;
}

function build(getAdminApp) {
  void getAdminApp;
  // /avatar/<seed>.png: the blob, transparent, 66 × 80 px (the 33 × 40 tile
  // of the emails at 2×). The seed decides it, so it never changes and caches
  // for a year.
  const avatarImage = onRequest({ invoker: "public", memory: "256MiB" }, async (request, response) => {
    const match = String(request.path || "").match(/\/avatar\/([A-Za-z0-9_-]{12,40})\.png$/);
    if (!match) {
      response.status(404).send("Not found");
      return;
    }
    const [{ blobatar }, { Resvg }] = await Promise.all([import("blobatar"), import("@resvg/resvg-js")]);
    const inner = blobatar(match[1], { background: false, tone: AVATAR_TONE, normalize: false }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="66" height="80"><svg x="4" y="11" width="58" height="58" viewBox="0 0 100 100">${inner}</svg></svg>`;
    const png = new Resvg(svg).render().asPng();
    response.set("Content-Type", "image/png");
    response.set("Cache-Control", "public, max-age=31536000, immutable");
    response.status(200).send(png);
  });

  return { avatarImage };
}

module.exports = { build, avatarSeeds, avatarSeed, avatarPngUrl, newSeed, AVATAR_TONE };
