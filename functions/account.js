const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { RESEND_API_KEY, sendEmail, verificationCodeEmail } = require("./email");

const TREATMENTS = ["ella", "el", "neutro"];
const USERNAME_PATTERN = /^[a-z0-9._]{3,24}$/;

const CODE_MINUTES = 15;
const CODE_MAX_ATTEMPTS = 5;
const RESEND_WAIT_SECONDS = 60;
const SENDS_PER_HOUR = 5;

// Global HaNet ID data lives next to the institutional links.
function identityDb(adminApp) {
  return getFirestore(adminApp, "hn-enrollmentdata");
}

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  return request.auth;
}

function hashCode(uid, code) {
  return crypto.createHash("sha256").update(`${uid}:${code}`).digest("hex");
}

function build(getAdminApp) {
  // Saves the profile of a freshly created account and reserves its username.
  const completeSignUp = onCall(async (request) => {
    const { uid } = requireAuth(request);
    const data = request.data || {};

    const fullName = typeof data.fullName === "string" ? data.fullName.trim().replace(/\s+/g, " ") : "";
    const username = typeof data.username === "string" ? data.username.trim().toLowerCase() : "";
    const treatment = TREATMENTS.includes(data.treatment) ? data.treatment : "neutro";

    if (fullName.length < 2 || fullName.length > 80) {
      throw new HttpsError("invalid-argument", "Escribe tus nombres y apellidos.");
    }
    if (!USERNAME_PATTERN.test(username)) {
      throw new HttpsError("invalid-argument", "El HaNet ID debe tener entre 3 y 24 letras, números, puntos o guiones bajos.");
    }
    if (data.acceptedTerms !== true) {
      throw new HttpsError("failed-precondition", "Debes aceptar los Términos y Condiciones.");
    }

    const adminApp = getAdminApp();
    const db = identityDb(adminApp);
    const accountRef = db.collection("accounts").doc(uid);
    const usernameRef = db.collection("usernames").doc(username);

    await db.runTransaction(async (tx) => {
      const [account, taken] = await Promise.all([tx.get(accountRef), tx.get(usernameRef)]);

      if (account.exists) {
        throw new HttpsError("already-exists", "Esta cuenta ya tiene un HaNet ID.");
      }
      if (taken.exists && taken.data().uid !== uid) {
        throw new HttpsError("already-exists", "Ese HaNet ID ya está en uso. Prueba con otro.");
      }

      tx.set(usernameRef, { uid, createdAt: FieldValue.serverTimestamp() });
      tx.set(accountRef, {
        fullName,
        username,
        treatment,
        termsAcceptedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    await getAuth(adminApp).updateUser(uid, { displayName: fullName });
    return { username };
  });

  // Emails a 4-digit code to the account's own address.
  const sendEmailCode = onCall({ secrets: [RESEND_API_KEY] }, async (request) => {
    const auth = requireAuth(request);
    const email = auth.token.email;
    if (!email) {
      throw new HttpsError("failed-precondition", "Tu cuenta no tiene un correo asociado.");
    }
    if (auth.token.email_verified) {
      return { alreadyVerified: true };
    }

    const adminApp = getAdminApp();
    const db = identityDb(adminApp);
    const codeRef = db.collection("emailCodes").doc(auth.uid);
    const now = Date.now();
    const code = String(crypto.randomInt(0, 10000)).padStart(4, "0");

    await db.runTransaction(async (tx) => {
      const previous = (await tx.get(codeRef)).data();
      const lastSentAt = previous?.lastSentAt?.toMillis() ?? 0;
      const windowStart = previous?.windowStart?.toMillis() ?? 0;
      const inWindow = now - windowStart < 60 * 60 * 1000;
      const sendCount = inWindow ? previous.sendCount || 0 : 0;

      if (now - lastSentAt < RESEND_WAIT_SECONDS * 1000) {
        throw new HttpsError("resource-exhausted", "Espera un momento antes de pedir otro código.");
      }
      if (sendCount >= SENDS_PER_HOUR) {
        throw new HttpsError("resource-exhausted", "Pediste demasiados códigos. Inténtalo de nuevo en una hora.");
      }

      tx.set(codeRef, {
        hash: hashCode(auth.uid, code),
        attempts: 0,
        expiresAt: Timestamp.fromMillis(now + CODE_MINUTES * 60 * 1000),
        lastSentAt: Timestamp.fromMillis(now),
        windowStart: inWindow ? previous.windowStart : Timestamp.fromMillis(now),
        sendCount: sendCount + 1,
      });
    });

    const account = (await db.collection("accounts").doc(auth.uid).get()).data() || {};
    const message = verificationCodeEmail({
      fullName: account.fullName,
      username: account.username,
      code,
      minutes: CODE_MINUTES,
    });

    try {
      await sendEmail({ to: email, ...message });
    } catch (error) {
      console.error("sendEmailCode", error.message);
      throw new HttpsError("unavailable", "No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.");
    }

    return { sent: true, resendInSeconds: RESEND_WAIT_SECONDS };
  });

  const verifyEmailCode = onCall(async (request) => {
    const auth = requireAuth(request);
    const code = typeof request.data?.code === "string" ? request.data.code.trim() : "";
    if (!/^\d{4}$/.test(code)) {
      throw new HttpsError("invalid-argument", "Escribe los 4 dígitos del código.");
    }

    const adminApp = getAdminApp();
    const db = identityDb(adminApp);
    const codeRef = db.collection("emailCodes").doc(auth.uid);

    // The transaction returns its verdict instead of throwing so that a
    // failed attempt is still counted.
    const verdict = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(codeRef);
      if (!snapshot.exists) return "missing";

      const stored = snapshot.data();
      if (stored.expiresAt.toMillis() < Date.now()) return "expired";
      if (stored.attempts >= CODE_MAX_ATTEMPTS) return "locked";

      const expected = Buffer.from(stored.hash, "hex");
      const received = Buffer.from(hashCode(auth.uid, code), "hex");
      if (expected.length === received.length && crypto.timingSafeEqual(expected, received)) {
        tx.delete(codeRef);
        return "ok";
      }

      tx.update(codeRef, { attempts: FieldValue.increment(1) });
      return stored.attempts + 1 >= CODE_MAX_ATTEMPTS ? "locked" : "wrong";
    });

    if (verdict === "missing" || verdict === "expired") {
      throw new HttpsError("deadline-exceeded", "El código venció. Pide uno nuevo.");
    }
    if (verdict === "locked") {
      throw new HttpsError("resource-exhausted", "Demasiados intentos. Pide un código nuevo.");
    }
    if (verdict === "wrong") {
      throw new HttpsError("invalid-argument", "El código no coincide. Revísalo e inténtalo de nuevo.");
    }

    await getAuth(adminApp).updateUser(auth.uid, { emailVerified: true });
    await db.collection("accounts").doc(auth.uid).set(
      { emailVerifiedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return { verified: true };
  });

  return { completeSignUp, sendEmailCode, verifyEmailCode };
}

module.exports = { build };
