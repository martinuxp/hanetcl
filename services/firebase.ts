import { initializeApp } from "firebase/app";
import * as firebaseAuth from 'firebase/auth';
import type { Auth, Persistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDK__CRF5iUlnGnRlembV9XUsnnajkFMaA",
  authDomain: "hanet-edu.firebaseapp.com",
  projectId: "hanet-edu",
  storageBucket: "hanet-edu.firebasestorage.app",
  messagingSenderId: "283230293926",
  appId: "1:283230293926:web:b4b085556dbc5599760967",
  measurementId: "G-Q0GTKJY3VZ"
};

const app = initializeApp(firebaseConfig);

// On native the session has to be stored explicitly or it is lost every time
// the app closes. The React Native build of the SDK ships
// getReactNativePersistence, but its typings do not declare it.
function createAuth(): Auth {
  const getReactNativePersistence = (firebaseAuth as unknown as {
    getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
  }).getReactNativePersistence;

  if (Platform.OS !== 'web' && typeof getReactNativePersistence === 'function') {
    try {
      return firebaseAuth.initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch {
      // Already initialised (fast refresh): fall through to the existing instance.
    }
  }
  return firebaseAuth.getAuth(app);
}

const auth = createAuth();
const db = getFirestore(app, "hn-enrollmentdata");
const calendarDb = getFirestore(app, "hn-calendar");
// Regional events must remain isolated from institutional enrollment and course calendars.
// Create this Firestore database before enabling the Events screen in production.
const eventsDb = getFirestore(app, "hn-events");

const functions = getFunctions(app);
const storage = getStorage(app);

export { auth, db, calendarDb, eventsDb, functions, storage };
export default app;
