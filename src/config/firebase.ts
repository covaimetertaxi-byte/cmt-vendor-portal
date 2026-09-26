/// <reference types="vite/client" />
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, setLogLevel, type Firestore } from "firebase/firestore";

// Read strictly from environment variables (.env)
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Silence internal Firestore SDK debug notices in console
try {
  setLogLevel("silent");
} catch {
  // Ignored if unsupported
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export const isFirebaseConfigured = (): boolean => {
  return Boolean(config.projectId && config.apiKey && !config.projectId.includes("YOUR_"));
};

export const getFirebaseDb = (): Firestore | null => {
  if (!isFirebaseConfigured()) {
    return null;
  }

  try {
    if (!app) {
      const existingApps = getApps();
      app = existingApps.length > 0 ? existingApps[0] : initializeApp(config);
    }
    if (!db && app) {
      db = getFirestore(app);
    }
    return db;
  } catch {
    return null;
  }
};
