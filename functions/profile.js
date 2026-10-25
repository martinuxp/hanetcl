const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { avatarSeed, newSeed } = require("./avatar");

// Typefaces offered for the profile name. Keep in step with constants/name-fonts.ts.
const NAME_FONTS = ["dm-sans", "fraunces", "unbounded", "space-mono", "caveat"];

function build(getAdminApp) {
  // Saves the choices a person makes about how their own profile looks.
  const updateMyProfile = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const accountRef = getFirestore(getAdminApp(), "hn-enrollmentdata").collection("accounts").doc(request.auth.uid);

    // "Otro" in the profile: a new blob, drawn here so the seed stays random.
    if (request.data?.newAvatar === true) {
      const seed = newSeed();
      await accountRef.set({ avatarSeed: seed }, { merge: true });
      return { avatarSeed: seed };
    }

    // The student's jornada, for the institution's events.
    if (["manana", "tarde"].includes(request.data?.jornada)) {
      await accountRef.set({ jornada: request.data.jornada }, { merge: true });
      return { jornada: request.data.jornada };
    }

    // The switch for ClassHall's push notifications.
    if (typeof request.data?.classhallNotifications === "boolean") {
      const classhall = request.data.classhallNotifications;
      await accountRef.set({ notifications: { classhall } }, { merge: true });
      return { classhallNotifications: classhall };
    }

    // The switch for the 7:00 summary of the day.
    if (typeof request.data?.morningNotifications === "boolean") {
      const morning = request.data.morningNotifications;
      await accountRef.set({ notifications: { morning } }, { merge: true });
      return { morningNotifications: morning };
    }

    const nameFont = request.data?.nameFont;
    if (!NAME_FONTS.includes(nameFont)) {
      throw new HttpsError("invalid-argument", "Esa letra no está disponible.");
    }

    await accountRef.set({ nameFont }, { merge: true });
    return { nameFont };
  });

  // Everything the profile screen shows about the signed-in account. The
  // institution document also holds its invitation hash, so the client
  // cannot read it directly and gets the name from here instead.
  const getMyProfile = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const uid = request.auth.uid;
    const adminApp = getAdminApp();
    const db = getFirestore(adminApp, "hn-enrollmentdata");

    const [accountSnap, userSnap, authUser, seed] = await Promise.all([
      db.collection("accounts").doc(uid).get(),
      db.collection("users").doc(uid).get(),
      getAuth(adminApp).getUser(uid),
      avatarSeed(getAdminApp, uid),
    ]);
    const account = accountSnap.data() || {};
    const linked = userSnap.data() || null;

    const institutionId = linked?.institutionId || account.institutionId || null;
    const institution = institutionId
      ? (await db.collection("institutions").doc(institutionId).get()).data() || null
      : null;

    return {
      fullName: account.fullName || linked?.name || authUser.displayName || "",
      username: account.username || null,
      treatment: account.treatment || "neutro",
      nameFont: NAME_FONTS.includes(account.nameFont) ? account.nameFont : NAME_FONTS[0],
      linked: Boolean(linked),
      role: linked?.role || null,
      courseId: linked?.courseId || null,
      institutionName: institution?.name || null,
      institutionFullName: institution?.fullName || institution?.name || null,
      institutionLogoUrl: institution?.branding?.logoUrl || null,
      institutionBannerUrl: institution?.branding?.bannerUrl || null,
      memberSince: Date.parse(authUser.metadata.creationTime) || null,
      avatarSeed: seed,
      classhallNotifications: account.notifications?.classhall !== false,
      morningNotifications: account.notifications?.morning !== false,
      jornada: ["manana", "tarde"].includes(account.jornada) ? account.jornada : null,
    };
  });

  return { getMyProfile, updateMyProfile };
}

module.exports = { build };
