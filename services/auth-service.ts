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

// ─── Onboarding ──────────────────────────────────────────────────────────────
export type OnboardingStep = 'verify-email' | 'join-beta' | 'link' | 'done';

/** Where an account stands on the way from sign-up to its institution. */
export async function getOnboardingStep(user: User | null): Promise<OnboardingStep> {
  if (!user) return 'done';
  if (!user.emailVerified) return 'verify-email';

  const [profile, account] = await Promise.all([
    getDoc(doc(db, 'users', user.uid)),
    getDoc(doc(db, 'accounts', user.uid)),
  ]);
  // A linked profile is the end of the road, however the account got there.
  if (profile.exists()) return 'done';
  return account.data()?.institutionId ? 'link' : 'join-beta';
}

export function routeForStep(step: OnboardingStep) {
  switch (step) {
    case 'verify-email': return '/verify-email' as const;
    case 'join-beta': return '/join-beta' as const;
    // The institutional link screens are not built yet.
    case 'link':
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
      return 'Esta cuenta está desactivada. Contacta a tu institución.';
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
    const result = await httpsCallable(functions, 'syncMyClaims')();
    await user.getIdToken(true);
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
    signOut: () => firebaseSignOut(auth),
  };
}
