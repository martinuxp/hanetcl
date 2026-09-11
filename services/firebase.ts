import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

// Firebase JS SDK v12 does not expose getReactNativePersistence from the
// public auth entrypoint. Keep one auth instance for every platform; native
// persistence can be added later with a supported adapter without breaking
// the current build.
const auth = getAuth(app);
const db = getFirestore(app, "hn-enrollmentdata");
const calendarDb = getFirestore(app, "hn-calendar");
// Regional events must remain isolated from institutional enrollment and course calendars.
// Create this Firestore database before enabling the Events screen in production.
const eventsDb = getFirestore(app, "hn-events");

export { auth, db, calendarDb, eventsDb };
export default app;
