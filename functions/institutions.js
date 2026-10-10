const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const WORDS = require("./wordlist");

// institutions/{institutionId}
//   name, fullName, methods, inviteHash, inviteUpdatedAt, createdAt
// institutions/{institutionId}/roster/{rut}
//   rut, nombres, apellidos, curso, email, updatedAt, linkedUid?
//
// The invitation phrase leads to an institution, and the institution owns
// the roster that the identity link searches by institutional email.

const WORD_COUNT = 4;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ROSTER_ROWS = 2000;
const WRITE_CHUNK = 400;
const DEFAULT_METHODS = ["institutional-email", "form"];

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function requireHnt(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  if (request.auth.token.role !== "HNT") {
    throw new HttpsError("permission-denied", "Esta acción es solo para el equipo HaNet.");
  }
  return request.auth;
}

function text(value, max) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

// Lowercase, no accents, letters only: "  Árbol " and "arbol" are the same word.
function normalizeWord(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-zñ]/g, "");
}

function hashPhrase(words) {
  return crypto.createHash("sha256").update(`hanet-invite:${words.join(" ")}`).digest("hex");
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Chilean RUT: digits plus a check digit computed with modulo 11.
function normalizeRut(value) {
  const clean = String(value || "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 7 || clean.length > 9) return null;

  const body = clean.slice(0, -1);
  if (!/^\d+$/.test(body)) return null;

  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  const expected = rest === 11 ? "0" : rest === 10 ? "K" : String(rest);
  return expected === clean.slice(-1) ? clean : null;
}

function build(getAdminApp) {
  // ── Student side ──────────────────────────────────────────────────────────

  // Checks an invitation phrase and ties the account to its institution. It
  // grants nothing by itself: academic data still needs the identity link.
  const redeemInviteCode = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    if (!request.auth.token.email_verified) {
      throw new HttpsError("failed-precondition", "Primero verifica tu correo.");
    }

    const raw = Array.isArray(request.data?.words) ? request.data.words : [];
    const words = raw.slice(0, WORD_COUNT).map(normalizeWord);
    if (raw.length !== WORD_COUNT || words.some(word => word.length < 2 || word.length > 24)) {
      throw new HttpsError("invalid-argument", "Escribe las cuatro palabras del código.");
    }

    const uid = request.auth.uid;
    const db = identityDb(getAdminApp);
    const attemptsRef = db.collection("inviteAttempts").doc(uid);
    const now = Date.now();

    // Count the attempt before checking it, so guessing is always paid for.
    await db.runTransaction(async (tx) => {
      const previous = (await tx.get(attemptsRef)).data();
      const windowStart = previous?.windowStart?.toMillis() ?? 0;
      const inWindow = now - windowStart < ATTEMPT_WINDOW_MS;
      const count = inWindow ? previous.count || 0 : 0;

      if (count >= MAX_ATTEMPTS) {
        throw new HttpsError("resource-exhausted", "Demasiados intentos. Espera 15 minutos y vuelve a probar.");
      }
      tx.set(attemptsRef, {
        count: count + 1,
        windowStart: inWindow ? previous.windowStart : Timestamp.fromMillis(now),
      });
    });

    const match = await db.collection("institutions")
      .where("inviteHash", "==", hashPhrase(words))
      .limit(1)
      .get();

    if (match.empty) {
      throw new HttpsError("not-found", "Ese código no coincide con ninguna institución. Revisa las palabras y su orden.");
    }

    const institution = match.docs[0];
    await db.collection("accounts").doc(uid).set(
      { institutionId: institution.id, invitedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await attemptsRef.delete();

    return {
      institutionId: institution.id,
      name: institution.data().name,
      methods: institution.data().methods || DEFAULT_METHODS,
    };
  });

  // ── HaNet team (role HNT) ─────────────────────────────────────────────────

  const adminListInstitutions = onCall(async (request) => {
    requireHnt(request);
    const db = identityDb(getAdminApp);
    const snapshot = await db.collection("institutions").get();

    const institutions = await Promise.all(snapshot.docs.map(async (doc) => {
      const data = doc.data();
      const roster = await doc.ref.collection("roster").count().get();
      return {
        id: doc.id,
        name: data.name,
        fullName: data.fullName || "",
        rosterCount: roster.data().count,
        hasInviteCode: Boolean(data.inviteHash),
        inviteUpdatedAt: data.inviteUpdatedAt ? data.inviteUpdatedAt.toMillis() : null,
      };
    }));

    return { institutions: institutions.sort((a, b) => a.name.localeCompare(b.name, "es")) };
  });

  const adminCreateInstitution = onCall(async (request) => {
    requireHnt(request);
    const name = text(request.data?.name, 40);
    const fullName = text(request.data?.fullName, 120);
    const id = slugify(name);

    if (name.length < 2 || id.length < 2) {
      throw new HttpsError("invalid-argument", "Escribe el nombre corto de la institución, por ejemplo \"LCH Temuco\".");
    }

    const ref = identityDb(getAdminApp).collection("institutions").doc(id);
    if ((await ref.get()).exists) {
      throw new HttpsError("already-exists", "Ya existe una institución con ese nombre.");
    }

    await ref.set({
      name,
      fullName,
      methods: DEFAULT_METHODS,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { id };
  });

  // Replaces the institution's invitation phrase. Only the hash is stored, so
  // the phrase returned here cannot be shown again.
  const adminRotateInviteCode = onCall(async (request) => {
    requireHnt(request);
    const institutionId = text(request.data?.institutionId, 60);
    const db = identityDb(getAdminApp);
    const ref = db.collection("institutions").doc(institutionId);

    if (!institutionId || !(await ref.get()).exists) {
      throw new HttpsError("not-found", "No encontramos esa institución.");
    }

    const picked = [];
    while (picked.length < WORD_COUNT) {
      const word = WORDS[crypto.randomInt(0, WORDS.length)];
      if (!picked.includes(word)) picked.push(word);
    }

    await ref.update({
      inviteHash: hashPhrase(picked),
      inviteUpdatedAt: FieldValue.serverTimestamp(),
    });
    return { words: picked };
  });

  // Loads or updates roster rows. Rows are keyed by RUT, so importing the
  // same sheet twice updates instead of duplicating, and never touches a
  // link that already exists.
  const adminImportRoster = onCall(async (request) => {
    requireHnt(request);
    const institutionId = text(request.data?.institutionId, 60);
    const rows = Array.isArray(request.data?.rows) ? request.data.rows : [];
    const db = identityDb(getAdminApp);
    const ref = db.collection("institutions").doc(institutionId);

    if (!institutionId || !(await ref.get()).exists) {
      throw new HttpsError("not-found", "No encontramos esa institución.");
    }
    if (rows.length === 0) {
      throw new HttpsError("invalid-argument", "La lista está vacía.");
    }
    if (rows.length > MAX_ROSTER_ROWS) {
      throw new HttpsError("invalid-argument", `Carga como máximo ${MAX_ROSTER_ROWS} filas por vez.`);
    }

    const valid = new Map();
    const rejected = [];

    rows.forEach((row, index) => {
      const rut = normalizeRut(row?.rut);
      const nombres = text(row?.nombres, 80);
      const apellidos = text(row?.apellidos, 80);
      const curso = text(row?.curso, 60);
      const email = text(row?.email, 120).toLowerCase();

      const reason = !rut ? "RUT no válido"
        : !nombres || !apellidos ? "faltan nombres o apellidos"
          : !curso ? "falta el curso"
            : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "correo no válido"
              : null;

      if (reason) rejected.push({ row: index + 1, reason });
      else valid.set(rut, { rut, nombres, apellidos, curso, email });
    });

    const entries = [...valid.values()];
    for (let start = 0; start < entries.length; start += WRITE_CHUNK) {
      const batch = db.batch();
      entries.slice(start, start + WRITE_CHUNK).forEach((entry) => {
        batch.set(
          ref.collection("roster").doc(entry.rut),
          { ...entry, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      });
      await batch.commit();
    }

    // Counts only: roster contents never go to the logs.
    console.log("adminImportRoster", { institutionId, imported: entries.length, rejected: rejected.length });
    return { imported: entries.length, rejected: rejected.slice(0, 50), rejectedCount: rejected.length };
  });

  return { redeemInviteCode, adminListInstitutions, adminCreateInstitution, adminRotateInviteCode, adminImportRoster };
}

module.exports = { build, normalizeRut };
