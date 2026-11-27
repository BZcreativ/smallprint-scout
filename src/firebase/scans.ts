import type { Firestore, Timestamp } from "firebase/firestore";
import { firebaseApp } from "./app";
import type { ScanSummary } from "../domain/scan-summary";

export type SavedScan = ScanSummary & { id: string; createdAt: Timestamp | null };

let firestorePromise: Promise<{ fs: typeof import("firebase/firestore"); db: Firestore }> | null = null;

// Load Cloud Firestore on demand so initial page & side-panel loads do not
// pay to download or initialize the Firestore SDK before a user signs in or saves.
function loadFirestore() {
  if (!firestorePromise) {
    firestorePromise = import("firebase/firestore").then((fs) => {
      // Empty = the "(default)" database. Set VITE_FIRESTORE_DATABASE_ID for a named (e.g. Enterprise) database.
      const databaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID;
      const db = databaseId ? fs.getFirestore(firebaseApp, databaseId) : fs.getFirestore(firebaseApp);
      return { fs, db };
    });
  }
  return firestorePromise;
}

export async function saveScanSummary(uid: string, summary: ScanSummary): Promise<string> {
  const { fs, db } = await loadFirestore();
  const ref = await fs.addDoc(fs.collection(db, "users", uid, "scans"), {
    ...summary,
    createdAt: fs.serverTimestamp(),
  });
  return ref.id;
}

export async function listRecentScans(uid: string, max = 20): Promise<SavedScan[]> {
  const { fs, db } = await loadFirestore();
  const snap = await fs.getDocs(
    fs.query(fs.collection(db, "users", uid, "scans"), fs.orderBy("createdAt", "desc"), fs.limit(max)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedScan, "id">) }));
}

export async function clearScanHistory(uid: string): Promise<void> {
  const { fs, db } = await loadFirestore();
  const snap = await fs.getDocs(fs.collection(db, "users", uid, "scans"));
  await Promise.all(snap.docs.map((d) => fs.deleteDoc(d.ref)));
}
