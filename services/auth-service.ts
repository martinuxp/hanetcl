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
  updateProfile
} from 'firebase/auth';
import { auth } from './firebase';
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
  return signInWithEmailAndPassword(auth, email, pass);
}

export async function signUpWithEmail(email: string, pass: string, displayName: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(userCredential.user, { displayName });
  return userCredential;
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
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
