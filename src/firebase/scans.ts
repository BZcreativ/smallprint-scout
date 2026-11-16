import { addDoc, collection, deleteDoc, getDocs, limit, orderBy, query, serverTimestamp, type Timestamp } from "firebase/firestore";
import { db } from "./app";
import type { ScanSummary } from "../domain/scan-summary";

export type SavedScan = ScanSummary & { id: string; createdAt: Timestamp | null };

const scansOf = (uid: string) => collection(db, "users", uid, "scans");

export async function saveScanSummary(uid: string, summary: ScanSummary): Promise<string> {
  const ref = await addDoc(scansOf(uid), { ...summary, createdAt: serverTimestamp() });
  return ref.id;
}

export async function listRecentScans(uid: string, max = 20): Promise<SavedScan[]> {
  const snap = await getDocs(query(scansOf(uid), orderBy("createdAt", "desc"), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedScan, "id">) }));
}

export async function clearScanHistory(uid: string): Promise<void> {
  const snap = await getDocs(scansOf(uid));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
