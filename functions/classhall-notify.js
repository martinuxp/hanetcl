const { randomBytes } = require("node:crypto");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { sendEmailBatch } = require("./email");
const { classhallEmail } = require("./classhall-email");
const { findSubject } = require("./subjects");
const { avatarSeed, avatarPngUrl } = require("./avatar");

// Sends ClassHall's emails to the students of a Hall: its whole course for a
// Plan común, those who joined for an electivo or a dominio. Whoever turned
// ClassHall emails off (accounts/{uid}.emailNotifications.classhall = false)
// is left out. A failure is logged and never undoes what the teacher saved.

const STAFF_ROLES = ["Profesor", "Admin", "HNT"];

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
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

// Name, username and the token of each account's preferences link; a token
// is made the first time an account gets one of these emails.
async function recipients(getAdminApp, uids) {
  if (!uids.length) return [];
  const db = identityDb(getAdminApp);
  const accounts = await db.getAll(...uids.map(uid => db.collection("accounts").doc(uid)));
  const wanted = [];
  const batch = db.batch();
  let newTokens = 0;
  accounts.forEach((doc, index) => {
    const data = doc.data() || {};
    if (data.emailNotifications?.classhall === false) return;
    let token = typeof data.emailToken === "string" ? data.emailToken : "";
    if (!token) {
      token = randomBytes(18).toString("base64url");
      batch.set(doc.ref, { emailToken: token }, { merge: true });
      newTokens += 1;
    }
    wanted.push({ uid: uids[index], fullName: data.fullName || "", username: data.username || "", token });
  });
  if (newTokens) await batch.commit();

  // The address is the account's own (its HaNet ID email), from Auth.
  const byUid = new Map();
  for (let start = 0; start < wanted.length; start += 100) {
    const result = await getAuth(getAdminApp()).getUsers(wanted.slice(start, start + 100).map(item => ({ uid: item.uid })));
    for (const user of result.users) {
      if (user.email && !user.disabled) byUid.set(user.uid, user.email);
    }
  }
  return wanted.filter(item => byUid.has(item.uid)).map(item => ({ ...item, email: byUid.get(item.uid) }));
}

async function institutionLook(getAdminApp, institutionId) {
  const institution = await identityDb(getAdminApp).collection("institutions").doc(institutionId).get();
  const branding = institution.data()?.branding || {};
  return { logoUrl: branding.logoUrl || null, bannerUrl: branding.bannerUrl || null };
}

/**
 * Emails a Hall's students about something new.
 *   kind: "material" | "task" | "taskTomorrow" | "announcement"
 *   hallId, hall: the Hall's id and data
 *   item: what the email is about (see classhallEmail)
 *   onlyUids: when set, only these students (the task reminder skips who handed in)
 */
async function notifyHall(getAdminApp, { kind, hallId, hall, item, onlyUids }) {
  try {
    let uids = await hallStudentUids(getAdminApp, hall);
    if (onlyUids) uids = uids.filter(uid => onlyUids.includes(uid));
    const [people, institution, teacherSeed] = await Promise.all([
      recipients(getAdminApp, uids),
      institutionLook(getAdminApp, hall.institutionId),
      avatarSeed(getAdminApp, hall.teacherUid),
    ]);
    if (!people.length) return 0;
    const hallInfo = {
      id: hallId,
      subject: hall.subject,
      plan: hall.plan || "comun",
      area: findSubject(hall.subject)?.area || null,
      teacherName: hall.teacherName || "Tu docente",
      teacherAvatarUrl: teacherSeed ? avatarPngUrl(teacherSeed) : null,
    };
    await sendEmailBatch(people.map((recipient) => {
      const message = classhallEmail({ kind, hall: hallInfo, institution, recipient, item });
      return { to: recipient.email, ...message };
    }));
    return people.length;
  } catch (error) {
    console.error("notifyHall", kind, hallId, error.message);
    return 0;
  }
}

module.exports = { notifyHall, hallStudentUids };
