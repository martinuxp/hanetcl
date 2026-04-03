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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
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

export async function signUpWithEmail(email: string, pass: string, rut: string, courseId: string, fullName: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(userCredential.user, { displayName: fullName });
  
  // Save institutional profile to Firestore
  await setDoc(doc(db, 'users', userCredential.user.uid), {
    email,
    rut,
    courseId,
    name: fullName,
    createdAt: new Date().toISOString()
  });
  
  // Mark the RUT as claimed in the enrollment DB
  await setDoc(doc(db, 'LCH-enroll-hn', rut), { linkedUid: userCredential.user.uid }, { merge: true });

  return userCredential;
}

export async function checkEnrollment(rut: string) {
  const cleanRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  const docRef = doc(db, 'LCH-enroll-hn', cleanRut);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    throw new Error('RUT_NOT_FOUND');
  }
  
  const data = docSnap.data() as { fullName?: string, courseId?: string, linkedUid?: string };
  if (data.linkedUid) {
    throw new Error('RUT_ALREADY_LINKED');
  }
  
  return {
    fullName: data.fullName || 'Estudiante',
    courseId: data.courseId || 'unknown'
  };
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
