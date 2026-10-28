const { Buffer } = require("node:buffer");
const crypto = require("node:crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { RESEND_API_KEY, sendEmail, magicLinkEmail, alreadyLinkedEmail, escapeHtml } = require("./email");

// Identity link by institutional email:
//   1. startInstitutionalLink   the student names their institutional email
//   2. confirmInstitutionalLink the link in that mailbox is opened and confirmed
//   3. getInstitutionalLinkStatus shows what the institution holds for them
//   4. completeInstitutionalLink creates the profile and the token claims
//
// linkRequests/{uid}: tokenHash, institutionId, rut, email, status
//   ('sent' | 'email-confirmed'), expiresAt, lastSentAt, sendCount, windowStart

const LINK_MINUTES = 30;
const RESEND_WAIT_SECONDS = 60;
const SENDS_PER_HOUR = 5;
const CONFIRM_URL = "https://hanet-edu.web.app/vincular";

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function requireVerified(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  if (!request.auth.token.email_verified) {
    throw new HttpsError("failed-precondition", "Primero verifica tu correo.");
  }
  return request.auth;
}

function hashToken(uid, token) {
  return crypto.createHash("sha256").update(`${uid}:${token}`).digest("hex");
}

function sameHash(a, b) {
  const left = Buffer.from(String(a), "hex");
  const right = Buffer.from(String(b), "hex");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

async function loadInstitution(db, uid) {
  const account = (await db.collection("accounts").doc(uid).get()).data();
  if (!account?.institutionId) {
    throw new HttpsError("failed-precondition", "Primero ingresa el código de invitación de tu institución.");
  }
  const institution = await db.collection("institutions").doc(account.institutionId).get();
  if (!institution.exists) {
    throw new HttpsError("failed-precondition", "Tu institución ya no está disponible. Contacta a HaNet.");
  }
  return { account, institution };
}

// Minimal page shown in the browser when the emailed link is opened.
function page(title, body, form = "") {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)} · HaNet</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#282829;color:#f9f9fa;font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;">
<main style="width:100%;max-width:420px;box-sizing:border-box;padding:24px;">
<img src="https://hanet-edu.web.app/email/hanet-logo-blanco.png" alt="HaNet" width="147" height="40" style="display:block;margin-bottom:24px;">
<div style="background:#3c3b3e;border-radius:32px;padding:32px;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;letter-spacing:-1px;">${escapeHtml(title)}</h1>
<p style="margin:0;font-size:16px;line-height:1.4;color:#dddde2;">${escapeHtml(body)}</p>
${form}
</div></main></body></html>`;
}

function build(getAdminApp) {
  const startInstitutionalLink = onCall({ secrets: [RESEND_API_KEY] }, async (request) => {
    const auth = requireVerified(request);
    const email = typeof request.data?.email === "string" ? request.data.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
      throw new HttpsError("invalid-argument", "Ese correo no parece válido.");
    }

    const db = identityDb(getAdminApp);
    const { account, institution } = await loadInstitution(db, auth.uid);
    if ((await db.collection("users").doc(auth.uid).get()).exists) {
      throw new HttpsError("already-exists", "Tu HaNet ID ya está vinculado a una institución.");
    }

    const requestRef = db.collection("linkRequests").doc(auth.uid);
    const now = Date.now();
    const token = crypto.randomBytes(32).toString("hex");

    const roster = await institution.ref.collection("roster").where("email", "==", email).limit(1).get();
    const person = roster.empty ? null : roster.docs[0];
    const available = person && (!person.data().linkedUid || person.data().linkedUid === auth.uid);

    await db.runTransaction(async (tx) => {
      const previous = (await tx.get(requestRef)).data();
      const lastSentAt = previous?.lastSentAt?.toMillis() ?? 0;
      const windowStart = previous?.windowStart?.toMillis() ?? 0;
      const inWindow = now - windowStart < 60 * 60 * 1000;
      const sendCount = inWindow ? previous.sendCount || 0 : 0;

      if (now - lastSentAt < RESEND_WAIT_SECONDS * 1000) {
        throw new HttpsError("resource-exhausted", "Espera un momento antes de pedir otro link.");
      }
      if (sendCount >= SENDS_PER_HOUR) {
        throw new HttpsError("resource-exhausted", "Pediste demasiados links. Inténtalo de nuevo en una hora.");
      }

      tx.set(requestRef, {
        institutionId: institution.id,
        email,
        // Without a match there is nothing to confirm; the request still
        // counts toward the limits.
        rut: available ? person.id : null,
        tokenHash: available ? hashToken(auth.uid, token) : null,
        status: "sent",
        expiresAt: Timestamp.fromMillis(now + LINK_MINUTES * 60 * 1000),
        lastSentAt: Timestamp.fromMillis(now),
        windowStart: inWindow ? previous.windowStart : Timestamp.fromMillis(now),
        sendCount: sendCount + 1,
      });
    });

    // The answer is the same whether or not the email is on the roster, so
    // this cannot be used to find out who studies where. A roster email that
    // already belongs to another HaNet ID gets a notice instead of silence, so
    // whoever owns the mailbox knows why no link came.
    if (person && !available) {
      const message = alreadyLinkedEmail({
        institutionName: institution.data().name,
        institutionLogoUrl: institution.data().branding?.logoUrl || null,
        institutionBannerUrl: institution.data().branding?.bannerUrl || null,
        institutionalEmail: email,
      });
      try {
        await sendEmail({ to: email, ...message });
      } catch (error) {
        console.error("startInstitutionalLink", error.message);
        throw new HttpsError("unavailable", "No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.");
      }
    }

    if (available) {
      const message = magicLinkEmail({
        fullName: account.fullName,
        username: account.username || null,
        institutionName: institution.data().name,
        institutionLogoUrl: institution.data().branding?.logoUrl || null,
        institutionBannerUrl: institution.data().branding?.bannerUrl || null,
        institutionalEmail: email,
        url: `${CONFIRM_URL}?u=${encodeURIComponent(auth.uid)}&t=${token}`,
        minutes: LINK_MINUTES,
      });
      try {
        await sendEmail({ to: email, ...message });
      } catch (error) {
        console.error("startInstitutionalLink", error.message);
        throw new HttpsError("unavailable", "No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.");
      }
    }

    return { sent: true, resendInSeconds: RESEND_WAIT_SECONDS };
  });

  // Opened from the email. GET only shows a button: mail scanners follow
  // links on their own, and that must not count as the student confirming.
  const confirmInstitutionalLink = onRequest(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");

    const source = req.method === "POST" ? req.body || {} : req.query;
    const uid = typeof source.u === "string" ? source.u : "";
    const token = typeof source.t === "string" ? source.t : "";
    const invalid = () => res.status(400).send(page(
      "Este link ya no sirve",
      "Puede que haya vencido o que ya lo hayas usado. Vuelve a la app de HaNet y pide uno nuevo.",
    ));

    if (!/^[A-Za-z0-9]{6,128}$/.test(uid) || !/^[a-f0-9]{64}$/.test(token)) return invalid();

    const db = identityDb(getAdminApp);
    const requestRef = db.collection("linkRequests").doc(uid);

    if (req.method === "GET") {
      const stored = (await requestRef.get()).data();
      if (!stored?.tokenHash || stored.expiresAt.toMillis() < Date.now() || !sameHash(stored.tokenHash, hashToken(uid, token))) {
        return invalid();
      }
      if (stored.status === "email-confirmed") {
        return res.send(page("Correo confirmado", "Ya puedes volver a la app de HaNet para terminar de vincular tu cuenta."));
      }
      return res.send(page(
        "Confirma tu correo institucional",
        "Estás a un paso de vincular tu HaNet ID con tu institución.",
        `<form method="post" action="/vincular" style="margin:24px 0 0;">
<input type="hidden" name="u" value="${escapeHtml(uid)}"><input type="hidden" name="t" value="${escapeHtml(token)}">
<button type="submit" style="width:100%;height:56px;border:0;border-radius:360px;background:#c7c6cf;color:#282829;font:700 16px 'DM Sans',system-ui,sans-serif;cursor:pointer;">Confirmar que soy yo</button>
</form>`,
      ));
    }

    if (req.method !== "POST") return res.status(405).send(page("Método no permitido", "Abre el link desde tu correo."));

    const confirmed = await db.runTransaction(async (tx) => {
      const stored = (await tx.get(requestRef)).data();
      if (!stored?.tokenHash || stored.expiresAt.toMillis() < Date.now() || !sameHash(stored.tokenHash, hashToken(uid, token))) {
        return false;
      }
      if (stored.status !== "email-confirmed") {
        tx.update(requestRef, { status: "email-confirmed", confirmedAt: FieldValue.serverTimestamp() });
      }
      return true;
    });

    if (!confirmed) return invalid();
    return res.send(page("Correo confirmado", "Ya puedes volver a la app de HaNet para terminar de vincular tu cuenta."));
  });

  // What the waiting screen polls. Roster data is only returned once the
  // institutional mailbox has confirmed.
  const getInstitutionalLinkStatus = onCall(async (request) => {
    const auth = requireVerified(request);
    const db = identityDb(getAdminApp);
    const { institution } = await loadInstitution(db, auth.uid);
    const base = {
      institutionId: institution.id,
      institutionName: institution.data().name,
      logoUrl: institution.data().branding?.logoUrl || null,
      bannerUrl: institution.data().branding?.bannerUrl || null,
    };

    const stored = (await db.collection("linkRequests").doc(auth.uid).get()).data();
    if (!stored || stored.expiresAt.toMillis() < Date.now()) return { ...base, status: "none" };
    if (stored.status !== "email-confirmed" || !stored.rut) return { ...base, status: "sent", email: stored.email };

    const person = (await institution.ref.collection("roster").doc(stored.rut).get()).data();
    if (!person) return { ...base, status: "none" };

    return {
      ...base,
      status: "email-confirmed",
      email: stored.email,
      person: {
        fullName: `${person.nombres} ${person.apellidos}`,
        rut: person.rut,
        curso: person.curso,
      },
    };
  });

  const completeInstitutionalLink = onCall(async (request) => {
    const auth = requireVerified(request);
    const adminApp = getAdminApp();
    const db = identityDb(getAdminApp);
    const { institution } = await loadInstitution(db, auth.uid);

    const requestRef = db.collection("linkRequests").doc(auth.uid);
    const userRef = db.collection("users").doc(auth.uid);
    const linkRef = db.collection("identityLinks").doc(auth.uid);

    const profile = await db.runTransaction(async (tx) => {
      const stored = (await tx.get(requestRef)).data();
      if (!stored || stored.status !== "email-confirmed" || !stored.rut || stored.expiresAt.toMillis() < Date.now()) {
        throw new HttpsError("failed-precondition", "El link venció. Pide uno nuevo para continuar.");
      }
      if (stored.institutionId !== institution.id) {
        throw new HttpsError("failed-precondition", "Ese link corresponde a otra institución.");
      }

      const personRef = institution.ref.collection("roster").doc(stored.rut);
      const [person, existingUser] = await Promise.all([tx.get(personRef), tx.get(userRef)]);

      if (existingUser.exists) {
        throw new HttpsError("already-exists", "Tu HaNet ID ya está vinculado a una institución.");
      }
      if (!person.exists) {
        throw new HttpsError("not-found", "Tu ficha ya no está en la lista de la institución.");
      }
      const data = person.data();
      if (data.linkedUid && data.linkedUid !== auth.uid) {
        throw new HttpsError("already-exists", "Esa ficha ya está vinculada a otro HaNet ID. Contacta a tu institución.");
      }

      const created = {
        role: "Estudiante",
        courseId: data.curso,
        institutionId: institution.id,
        rut: data.rut,
        name: `${data.nombres} ${data.apellidos}`,
        institutionalEmail: data.email,
        createdAt: FieldValue.serverTimestamp(),
      };

      tx.set(userRef, created);
      tx.set(linkRef, {
        institutionId: institution.id,
        rut: data.rut,
        method: "institutional-email",
        linkedAt: FieldValue.serverTimestamp(),
      });
      tx.update(personRef, { linkedUid: auth.uid, linkedAt: FieldValue.serverTimestamp() });
      tx.delete(requestRef);
      return created;
    });

    // Role and course travel in the token; the calendar rules read them there.
    const adminAuth = getAuth(adminApp);
    const current = (await adminAuth.getUser(auth.uid)).customClaims || {};
    await adminAuth.setCustomUserClaims(auth.uid, { ...current, role: profile.role, courseId: profile.courseId });

    return { linked: true, institutionName: institution.data().name, courseId: profile.courseId };
  });

  return { startInstitutionalLink, confirmInstitutionalLink, getInstitutionalLinkStatus, completeInstitutionalLink };
}

module.exports = { build };
