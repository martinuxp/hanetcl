import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { Platform } from 'react-native';

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

// On web, getReactNativePersistence is not available. Use getAuth() instead.
// On native, use initializeAuth with AsyncStorage persistence.
let auth: ReturnType<typeof getAuth>;

if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactNativeAsyncStorage = require('@react-native-async-storage/async-storage').default;
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
}

export { auth };
export default app;
