import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// The Firebase web config is public by design (security lives in Firestore
// rules + App Check, not these values), so we hardcode a fallback for each
// field. Cloud Build doesn't inject NEXT_PUBLIC_* at build time, which would
// otherwise leave the deployed client bundle with an empty config.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDSaSZnUsN0mQNvpB1G982y5RWeIgxb_sw",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "fixit-33527.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "fixit-33527",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "fixit-33527.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "341094842696",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:341094842696:web:e703344bd30bbe6b32337d",
};

// Nothing initializes at module load. The container build runs `next build`
// with no env vars present; eagerly calling getAuth()/initializeApp() there
// throws (auth/invalid-api-key) and fails page-data collection. Instead we
// initialize lazily on first *use* — which only happens at runtime, when the
// Cloud Run service has the env vars set.
let app: FirebaseApp | undefined;
let dbInstance: Firestore | undefined;
let authInstance: Auth | undefined;
let storageInstance: FirebaseStorage | undefined;

function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (!firebaseConfig.apiKey) {
    throw new Error(
      "Firebase env vars (NEXT_PUBLIC_FIREBASE_*) are not set — cannot initialize.",
    );
  }
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function getDb(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(getFirebaseApp());
  return authInstance;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInstance) storageInstance = getStorage(getFirebaseApp());
  return storageInstance;
}
