import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { signInWithGoogle, signOutUser, useAuthUser } from "./firebase/auth";
import { clearScanHistory, listRecentScans, saveScanSummary, type SavedScan } from "./firebase/scans";
import { toScanSummary } from "./domain/scan-summary";

export default function App() {
  const user = useAuthUser();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<unknown>) => () => {
    setError(null);
    action().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <main className="page">
      <header className="bar">
        <h1>SmallPrint Scout</h1>
        {user === undefined ? null : user ? (
          <span className="who">
            {user.displayName ?? user.email}
            <button onClick={run(signOutUser)}>Sign out</button>
          </span>
        ) : (
          <button onClick={run(signInWithGoogle)}>Sign in with Google</button>
        )}
      </header>

      {error && <p role="alert" className="error">{error}</p>}

      {user === undefined && <p>Loading…</p>}
      {user === null && <p>Sign in to keep a private history of your scans. Scanning itself will work without an account.</p>}
      {user && <ScanHistory user={user} onError={setError} />}

      <footer>Not legal advice. Check the original document and official guidance.</footer>
    </main>
  );
}

function ScanHistory({ user, onError }: { user: User; onError: (m: string) => void }) {
  const [scans, setScans] = useState<SavedScan[] | null>(null);

  const refresh = useCallback(() => {
    listRecentScans(user.uid).then(setScans, (e: Error) => onError(e.message));
  }, [user.uid, onError]);

  useEffect(refresh, [refresh]);

  const saveSample = () =>
    saveScanSummary(
      user.uid,
      toScanSummary({ documentType: "SUBSCRIPTION_TERMS", overallRisk: "HIGH", findingCategories: ["RENEWAL", "REFUND", "RENEWAL"], route: "ON_DEVICE" }),
    ).then(refresh, (e: Error) => onError(e.message));

  const clear = () => clearScanHistory(user.uid).then(refresh, (e: Error) => onError(e.message));

  return (
    <section>
      <h2>Your scan history</h2>
      <p className="hint">Only labels are saved (risk level, categories, date), never the contract text.</p>
      {scans === null ? (
        <p>Loading…</p>
      ) : scans.length === 0 ? (
        <p>No scans yet.</p>
      ) : (
        <ul>
          {scans.map((s) => (
            <li key={s.id}>
              {s.createdAt?.toDate().toLocaleString() ?? "just now"}: {s.overallRisk} risk, {s.documentType}, {s.categories.join(", ") || "no findings"} ({s.route})
            </li>
          ))}
        </ul>
      )}
      {/* ponytail: dev-only button to prove Firestore end to end; the real scan flow (plan Task 7) calls saveScanSummary */}
      {import.meta.env.DEV && <button onClick={saveSample}>Save a sample scan (dev only)</button>}
      {scans && scans.length > 0 && <button onClick={clear}>Clear my history</button>}
    </section>
  );
}
