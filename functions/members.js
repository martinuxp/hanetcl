const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// People of an institution, for the HNT panel: who is on the roster, who
// already linked their HaNet ID, with which role, and the actions on them.

const ROLES = ["Estudiante", "Directiva", "CEE", "Profesor", "Admin", "HNT"];
const MAX_MEMBERS = 1000;

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

function id(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : "";
}

// Role and course travel in the token; keep the rest of the claims as they are.
async function writeClaims(adminApp, uid, changes) {
  const auth = getAuth(adminApp);
  const current = (await auth.getUser(uid)).customClaims || {};
  const next = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  await auth.setCustomUserClaims(uid, next);
}

function build(getAdminApp) {
  const adminListMembers = onCall(async (request) => {
    requireHnt(request);
    const institutionId = id(request.data?.institutionId);
    const db = identityDb(getAdminApp);
    const institutionRef = db.collection("institutions").doc(institutionId);

    if (!institutionId || !(await institutionRef.get()).exists) {
      throw new HttpsError("not-found", "No encontramos esa institución.");
    }

    const roster = await institutionRef.collection("roster").limit(MAX_MEMBERS).get();
    const linkedRefs = roster.docs
      .filter(doc => doc.data().linkedUid)
      .map(doc => db.collection("users").doc(doc.data().linkedUid));
    const profiles = linkedRefs.length > 0 ? await db.getAll(...linkedRefs) : [];
    const roleByUid = new Map(profiles.filter(doc => doc.exists).map(doc => [doc.id, doc.data().role || "Estudiante"]));
    const blockedUids = new Set(profiles.filter(doc => doc.exists && doc.data().blocked === true).map(doc => doc.id));

    const members = roster.docs.map((doc) => {
      const data = doc.data();
      const linkedUid = data.linkedUid && roleByUid.has(data.linkedUid) ? data.linkedUid : null;
      return {
        rut: data.rut,
        fullName: `${data.nombres} ${data.apellidos}`,
        curso: data.curso,
        email: data.email,
        uid: linkedUid,
        role: linkedUid ? roleByUid.get(linkedUid) : null,
        blocked: linkedUid ? blockedUids.has(linkedUid) : false,
      };
    }).sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));

    return { members, truncated: roster.size >= MAX_MEMBERS };
  });

  const adminSetRole = onCall(async (request) => {
    const caller = requireHnt(request);
    const uid = id(request.data?.uid);
    const role = request.data?.role;

    if (!uid || !ROLES.includes(role)) {
      throw new HttpsError("invalid-argument", "Ese rol no existe.");
    }
    // Changing your own role could leave the panel without anyone able to enter it.
    if (uid === caller.uid) {
      throw new HttpsError("failed-precondition", "No puedes cambiar tu propio rol.");
    }

    const db = identityDb(getAdminApp);
    const userRef = db.collection("users").doc(uid);
    if (!(await userRef.get()).exists) {
      throw new HttpsError("not-found", "Esa persona todavía no ha vinculado su HaNet ID.");
    }

    await userRef.update({ role, roleUpdatedAt: FieldValue.serverTimestamp(), roleUpdatedBy: caller.uid });
    await writeClaims(getAdminApp(), uid, { role });
    return { role };
  });

  // Blocks or unblocks a HaNet ID for breaking the terms. Firebase Auth
  // disables the account, so it cannot sign in and its session stops working
  // (the app shows the blocked screen); the profile keeps the flag for the panel.
  const adminSetBlocked = onCall({ invoker: "public" }, async (request) => {
    const caller = requireHnt(request);
    const uid = id(request.data?.uid);
    const blocked = request.data?.blocked === true;
    if (!uid) {
      throw new HttpsError("invalid-argument", "Falta indicar a quién bloquear.");
    }
    if (uid === caller.uid) {
      throw new HttpsError("failed-precondition", "No puedes bloquearte a ti.");
    }

    const userRef = identityDb(getAdminApp).collection("users").doc(uid);
    if (!(await userRef.get()).exists) {
      throw new HttpsError("not-found", "Esa persona todavía no ha vinculado su HaNet ID.");
    }

    const auth = getAuth(getAdminApp());
    await auth.updateUser(uid, { disabled: blocked });
    if (blocked) await auth.revokeRefreshTokens(uid);
    await userRef.update({
      blocked,
      blockedUpdatedAt: FieldValue.serverTimestamp(),
      blockedUpdatedBy: caller.uid,
    });
    console.log("adminSetBlocked", { by: caller.uid, uid, blocked });
    return { blocked };
  });

  // Undoes the link: the person keeps their HaNet ID but loses the profile,
  // the role and the course, and their roster row becomes available again.
  const adminUnlinkMember = onCall(async (request) => {
    const caller = requireHnt(request);
    const uid = id(request.data?.uid);
    if (!uid) {
      throw new HttpsError("invalid-argument", "Falta indicar a quién desvincular.");
    }
    if (uid === caller.uid) {
      throw new HttpsError("failed-precondition", "No puedes desvincularte a ti.");
    }

    const db = identityDb(getAdminApp);
    const userRef = db.collection("users").doc(uid);
    const linkRef = db.collection("identityLinks").doc(uid);

    await db.runTransaction(async (tx) => {
      const [user, link] = await Promise.all([tx.get(userRef), tx.get(linkRef)]);
      if (!user.exists) {
        throw new HttpsError("not-found", "Esa persona no está vinculada.");
      }

      const institutionId = user.data().institutionId || link.data()?.institutionId;
      const rut = user.data().rut || link.data()?.rut;
      if (institutionId && rut) {
        const personRef = db.collection("institutions").doc(institutionId).collection("roster").doc(rut);
        const person = await tx.get(personRef);
        if (person.exists && person.data().linkedUid === uid) {
          tx.update(personRef, { linkedUid: FieldValue.delete(), linkedAt: FieldValue.delete() });
        }
      }
      tx.delete(userRef);
      tx.delete(linkRef);
    });

    await writeClaims(getAdminApp(), uid, { role: null, courseId: null });
    console.log("adminUnlinkMember", { by: caller.uid, uid });
    return { unlinked: true };
  });

  // Ties the caller's own profile to an institution. Profiles created by
  // hand, before institutions existed, have none.
  const adminJoinInstitution = onCall(async (request) => {
    const caller = requireHnt(request);
    const institutionId = id(request.data?.institutionId);
    const db = identityDb(getAdminApp);

    if (!institutionId || !(await db.collection("institutions").doc(institutionId).get()).exists) {
      throw new HttpsError("not-found", "No encontramos esa institución.");
    }
    const userRef = db.collection("users").doc(caller.uid);
    if (!(await userRef.get()).exists) {
      throw new HttpsError("failed-precondition", "Tu cuenta no tiene un perfil al que asignarle institución.");
    }

    await userRef.update({ institutionId });
    return { institutionId };
  });

  return { adminListMembers, adminSetRole, adminSetBlocked, adminUnlinkMember, adminJoinInstitution };
}

module.exports = { build };
