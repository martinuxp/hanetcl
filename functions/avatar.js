const { randomBytes } = require("node:crypto");
const { getFirestore } = require("firebase-admin/firestore");

// Blobatars (blobatar.dev): the picture of whoever has no photo. Each account
// keeps a random seed (accounts/{uid}.avatarSeed), never its uid, email or
// name, so the image and its address say nothing about the person. "Otro"
// in the profile draws a new seed. The app draws the blob (components/ui/hanet-avatar.tsx).

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

module.exports = { avatarSeeds, avatarSeed, newSeed };
