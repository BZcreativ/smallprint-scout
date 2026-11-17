import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
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

let appCheckInstance: AppCheck | undefined;

// Runs once at module load, before any `firebase/ai` request.
export function setupAppCheck(): AppCheck | undefined {
  if (appCheckInstance) return appCheckInstance;
  if (typeof self !== "undefined" && import.meta.env.DEV && import.meta.env.VITE_USE_APPCHECK_DEBUG === "true") {
    (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (!siteKey) return undefined;
  appCheckInstance = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}

setupAppCheck();
