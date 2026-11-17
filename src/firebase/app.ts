import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Values come from `npx -y firebase-tools@latest apps:sdkconfig WEB <APP_ID> --project smallprint-scout`,
// copied into .env.local (gitignored). See .env.example.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
// Empty = the "(default)" database. Set VITE_FIRESTORE_DATABASE_ID for a named (e.g. Enterprise) database.
const databaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID;
export const db = databaseId ? getFirestore(firebaseApp, databaseId) : getFirestore(firebaseApp);
