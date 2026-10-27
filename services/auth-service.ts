import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Platform } from 'react-native';
import { 
  GoogleAuthProvider, 
  signInWithCredential,
  signInWithPopup,
  onAuthStateChanged, 
  User,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, functions } from './firebase';
import { cached, clearCache } from './cache';
import { unregisterDevice } from './push-service';
import { useEffect, useState } from 'react';

// Required for AuthSession to work in browser/modal (native only)
if (Platform.OS !== 'web') {
  WebBrowser.maybeCompleteAuthSession();
}

// ─── Web: uses Firebase's signInWithPopup ────────────────────────────────────
export async function signInWithGoogleWeb(): Promise<void> {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

// ─── Email/Password Auth ─────────────────────────────────────────────────────
export async function signInWithEmail(email: string, pass: string) {
  return signInWithEmailAndPassword(auth, email.trim(), pass);
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email.trim());
}

// ─── HaNet ID sign-up ────────────────────────────────────────────────────────
export type Treatment = 'ella' | 'el' | 'neutro';

export type SignUpProfile = {
  fullName: string;
  username: string;
  treatment: Treatment;
  acceptedTerms: boolean;
};

/**
 * Creates the account and saves its profile. If the profile step fails (for
 * example, the username is taken) the account already exists, so a retry only
 * repeats that step.
 */
export async function signUpWithEmail(email: string, pass: string, profile: SignUpProfile) {
  if (!auth.currentUser) {
    await createUserWithEmailAndPassword(auth, email.trim(), pass);
  }
  await httpsCallable(functions, 'completeSignUp')(profile);
  await auth.currentUser?.reload();
}

export async function sendEmailCode() {
  const result = await httpsCallable<void, { alreadyVerified?: boolean; resendInSeconds?: number }>(functions, 'sendEmailCode')();
  return result.data;
}

export async function verifyEmailCode(code: string) {
  await httpsCallable(functions, 'verifyEmailCode')({ code });
  // Pick up emailVerified in both the user object and the ID token.
  await auth.currentUser?.reload();
  await auth.currentUser?.getIdToken(true);
}

export async function redeemInviteCode(words: string[]) {
  const result = await httpsCallable<{ words: string[] }, { institutionId: string; name: string }>(functions, 'redeemInviteCode')({ words });
  return result.data;
}

// ─── Institutional link ──────────────────────────────────────────────────────
export type LinkStatus = {
  institutionId: string;
  institutionName: string;
  /** The institution's shield and banner (null or missing while it has none). */
  logoUrl?: string | null;
  bannerUrl?: string | null;
  /** 'sent' also covers an email that is not on the roster: the app cannot tell them apart. */
  status: 'none' | 'sent' | 'email-confirmed';
  email?: string;
  person?: { fullName: string; rut: string; curso: string };
};

export async function startInstitutionalLink(email: string) {
  const result = await httpsCallable<{ email: string }, { resendInSeconds: number }>(functions, 'startInstitutionalLink')({ email });
  return result.data;
}

export async function getInstitutionalLinkStatus() {
  const result = await httpsCallable<void, LinkStatus>(functions, 'getInstitutionalLinkStatus')();
  return result.data;
}

export async function completeInstitutionalLink() {
  await httpsCallable(functions, 'completeInstitutionalLink')();
  // The backend just wrote role and course into the token.
  await auth.currentUser?.getIdToken(true);
}

// ─── Profile ─────────────────────────────────────────────────────────────────
export type MyProfile = {
  fullName: string;
  username: string | null;
  treatment: Treatment;
  /** Id of the typeface chosen for the profile name (see constants/name-fonts.ts). */
  nameFont: string;
  linked: boolean;
  role: string | null;
  courseId: string | null;
  institutionName: string | null;
  institutionFullName: string | null;
  institutionLogoUrl: string | null;
  institutionBannerUrl: string | null;
  /** Milliseconds since epoch of the account's creation. */
  memberSince: number | null;
  /** Random seed of the account's blobatar, its picture when it has no photo. */
  avatarSeed: string | null;
  /** The ClassHall notifications switch (on unless turned off). */
  classhallNotifications: boolean;
  morningNotifications: boolean;
  /** The anniversary's flash tests and deadlines (on unless turned off). */
  anniversaryNotifications?: boolean;
};

export function getMyProfile() {
  return cached('profile', async () => (await httpsCallable<void, MyProfile>(functions, 'getMyProfile')()).data);
}

// ─── Welcome ─────────────────────────────────────────────────────────────────
// Set when the link completes and read once by Home, which plays the welcome.
let pendingWelcome: { institutionName?: string } | null = null;

export function setPendingWelcome(institutionName?: string) {
  pendingWelcome = { institutionName };
}

export function consumePendingWelcome() {
  const pending = pendingWelcome;
  pendingWelcome = null;
  return pending;
}

/** First name and treatment for greeting the signed-in account. */
export async function getGreetingProfile(user: User): Promise<{ firstName: string; treatment: Treatment }> {
  const account = (await getDoc(doc(db, 'accounts', user.uid))).data();
  const fullName: string = account?.fullName || user.displayName || '';
  return {
    firstName: fullName.trim().split(/\s+/)[0] ?? '',
    treatment: account?.treatment === 'ella' || account?.treatment === 'el' ? account.treatment : 'neutro',
  };
}

// ─── Onboarding ──────────────────────────────────────────────────────────────
export type OnboardingStep = 'verify-email' | 'join-beta' | 'link' | 'done';

/** Where an account stands on the way from sign-up to its institution. */
// Accounts known to have finished: Home asks on every visit, and once an
// account is linked the answer does not change.
const finishedUids = new Set<string>();

export function isOnboardingKnownDone(user: User | null) {
  return !user || finishedUids.has(user.uid);
}

export async function getOnboardingStep(user: User | null): Promise<OnboardingStep> {
  if (!user || finishedUids.has(user.uid)) return 'done';
  if (!user.emailVerified) return 'verify-email';

  const [profile, account] = await Promise.all([
    getDoc(doc(db, 'users', user.uid)),
    getDoc(doc(db, 'accounts', user.uid)),
  ]);
  // A linked profile is the end of the road, however the account got there.
  if (profile.exists()) {
    finishedUids.add(user.uid);
    return 'done';
  }
  return account.data()?.institutionId ? 'link' : 'join-beta';
}

export function routeForStep(step: OnboardingStep) {
  switch (step) {
    case 'verify-email': return '/verify-email' as const;
    case 'join-beta': return '/join-beta' as const;
    case 'link': return '/link-institution' as const;
    case 'done': return '/(tabs)' as const;
  }
}

/** Message for an error thrown by one of our callables or by Firebase Auth. */
export function describeAuthError(error: unknown, fallback: string) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'El correo o la contraseña no coinciden.';
    case 'auth/email-already-in-use':
      return 'Ese correo ya tiene un HaNet ID. Entra en "Cuenta existente".';
    case 'auth/invalid-email':
      return 'Ese correo no parece válido.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 8 caracteres.';
    case 'auth/user-disabled':
      return 'Esta cuenta está bloqueada.';
    case 'auth/too-many-requests':
      return 'Hubo demasiados intentos. Espera un momento e inténtalo nuevamente.';
    case 'auth/network-request-failed':
      return 'No pudimos conectarnos. Revisa tu conexión a internet.';
  }

  // Our callables already answer in Spanish; "internal" carries no message.
  if (code.startsWith('functions/') && code !== 'functions/internal' && error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

// ─── Claims (role and course in the ID token) ────────────────────────────────
// The calendar rules read role and courseId from the token, so it has to be
// synced and refreshed once per session before touching hn-calendar.
let claimsSync: { uid: string; promise: Promise<void> } | null = null;

export function ensureClaims(user: User): Promise<void> {
  if (claimsSync?.uid === user.uid) return claimsSync.promise;

  const promise = (async () => {
    const result = await httpsCallable<void, { role: string; courseId: string | null }>(functions, 'syncMyClaims')();
    // The token is only refreshed (another round trip) when what it carries
    // is not what the backend just confirmed.
    const { claims } = await user.getIdTokenResult();
    const courseId = typeof claims.courseId === 'string' ? claims.courseId : null;
    if (claims.role !== result.data.role || courseId !== result.data.courseId) await user.getIdToken(true);
    if (__DEV__) {
      const { claims } = await user.getIdTokenResult();
      console.log('[claims]', JSON.stringify({ synced: result.data, token: { role: claims.role, courseId: claims.courseId } }));
    }
  })();
  claimsSync = { uid: user.uid, promise };
  promise.catch(() => {
    if (claimsSync?.promise === promise) claimsSync = null;
  });
  return promise;
}

/**
 * The course in the token's claims without waiting for the sync when the
 * token already carries a role: the sync still runs behind, once per
 * session. A token without claims yet waits for it.
 */
export async function claimedCourse(user: User): Promise<string | null> {
  const sync = ensureClaims(user);
  let { claims } = await user.getIdTokenResult();
  if (typeof claims.role !== 'string') {
    await sync.catch(() => undefined);
    ({ claims } = await user.getIdTokenResult());
  } else {
    sync.catch(() => undefined);
  }
  return typeof claims.courseId === 'string' ? claims.courseId : null;
}

// ─── Native: uses expo-auth-session (PAUSED) ─────────────────────────────────
export function useGoogleAuth() {
  // Logic paused as per user request
  return {
    signIn: () => console.log("Google Sign-In is currently disabled"),
    loading: false,
  };
}

// ─── Session hook (shared for web and native) ────────────────────────────────
export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (initializing) setInitializing(false);
    });
    return unsubscribe;
  }, []);

  return {
    user,
    initializing,
    // The device stops getting this account's notifications first.
    signOut: async () => {
      await unregisterDevice();
      await firebaseSignOut(auth);
      await clearCache();
    },
  };
}

/**
 * The role carried in the token's claims, which is what the Firestore rules
 * check. Null while unknown or signed out. Syncs the claims first so a role
 * changed in the HNT panel shows up without signing in again.
 */
export function useRole() {
  const { user } = useSession();
  const [known, setKnown] = useState<{ uid: string; role: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    ensureClaims(user)
      .catch(() => undefined)
      .then(() => user.getIdTokenResult())
      .then(({ claims }) => { if (active) setKnown({ uid: user.uid, role: String(claims.role ?? 'Estudiante') }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [user]);

  return user && known?.uid === user.uid ? known.role : null;
}

/** The course in the token's claims, or null while unknown or unlinked. */
export function useClaimCourse() {
  const { user } = useSession();
  const [known, setKnown] = useState<{ uid: string; courseId: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    user.getIdTokenResult()
      .then(({ claims }) => {
        if (active) setKnown({ uid: user.uid, courseId: typeof claims.courseId === 'string' ? claims.courseId : null });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [user]);

  return user && known?.uid === user.uid ? known.courseId : null;
}

export const EVENT_EDITOR_ROLES = ['HNT', 'Admin', 'CEE', 'Directiva'];
