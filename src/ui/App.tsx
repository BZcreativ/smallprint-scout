import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { signInWithGoogle, signOutUser, useAuthUser } from "../firebase/auth";
import { clearScanHistory, listRecentScans, saveScanSummary, type SavedScan } from "../firebase/scans";
import { DOCUMENT_TYPES, toScanSummary, type ScanSummary } from "../domain/scan-summary";
import { ScanParseError } from "../domain/parse-result";
import { quotaDetail, rateLimitHint, runFirstPassScan, type ScanEnvelope } from "../firebase/scan";
import { models, slimResponseConstraint } from "../firebase/models";
import { getDeviceStatus, initDeviceModel, type DeviceStatus } from "../firebase/device";
import { runCloudLegalResearch, type CloudResearch } from "../firebase/research";
import { JURISDICTION_LABELS, type JurisdictionId } from "../domain/types";
import { acceptsMessage } from "../domain/extension-message";
import { DraftEditor } from "./DraftEditor";
import { EvalRunner } from "./EvalRunner";
import { InputScreen } from "./InputScreen";
import { ModelStatus } from "./ModelStatus";
import { RedactionGate } from "./RedactionGate";
import { ResearchScreen } from "./ResearchScreen";
import { ResultsScreen } from "./ResultsScreen";

// The app is a small screen state machine. Every screen knows how it was
// reached, so the back buttons and the retry button always have something
// honest to go back to.

// Which model a scan uses. `local` never leaves the machine, `hybrid` falls
// back to the cloud with the redacted text.
type ScanRoute = "local" | "hybrid";

export type Screen =
  | { name: "input" }
  | { name: "gate"; purpose: "hybrid" | "research"; text: string; scan?: ScanEnvelope }
  | { name: "results"; source: string; scan: ScanEnvelope }
  | { name: "research"; source: string; redactedText: string; jurisdiction: JurisdictionId; research: CloudResearch; scan?: ScanEnvelope }
  | { name: "draft"; source: string; scan: ScanEnvelope; context?: string };

export default function App() {
  const user = useAuthUser();
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "input" });
  const [inputText, setInputText] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<{ text: string; route: ScanRoute } | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("unsupported");
  const [deviceChecked, setDeviceChecked] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);

  const run = (action: () => Promise<unknown>) => () => {
    setError(null);
    action().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  // The judge may be on a browser without Gemini Nano, so the status is asked
  // for once and never assumed.
  useEffect(() => {
    let cancelled = false;
    getDeviceStatus().then(
      (status) => {
        if (cancelled) return;
        setDeviceStatus(status);
        setDeviceChecked(true);
      },
      () => {
        if (!cancelled) setDeviceChecked(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // The Chrome extension pushes the text of a page (or of a selection) into
  // the app. Only a message from another extension is taken, and it only
  // loads the text: the user still presses the scan button.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const text = acceptsMessage({ origin: event.origin, data: event.data });
      if (text === null) return;

      setInputText(text);
      setScanError(null);
      setCanRetry(false);
      setScreen({ name: "input" });
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function handleEnableDevice() {
    setError(null);
    setDeviceStatus("downloading");
    setDownloadProgress(0);
    // The download has to start inside the click handler: the Prompt API needs
    // the user's activation, and nothing may be awaited before it.
    void initDeviceModel((pct) => setDownloadProgress(pct)).then(
      () => setDeviceStatus("available"),
      (e: unknown) => {
        setDeviceStatus("downloadable");
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  }

  // Only labels are stored, never the contract text (see firestore.rules).
  const saveSummary = useCallback(
    async (scan: ScanEnvelope) => {
      if (!user) return;
      const env = scan;
      try {
        await saveScanSummary(
          user.uid,
          toScanSummary({
            documentType: toDocumentType(env.data.documentType),
            overallRisk: env.data.overallRisk,
            findingCategories: env.data.findings.map((f) => f.category),
            route: env.route,
          }),
        );
        setHistoryVersion((version) => version + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [user],
  );

  // The on-device fallback chain (Task 1 Gate). Tier 2: slim schema (drops
// confidence & keyDates) with a concise prompt. Tier 3: Chrome's LanguageModel
// called directly, bypassing @firebase/ai's multimodal array wrapper. Tier 4:
// the draft model with a compacted prompt.
async function localFallbackGenerate(text: string) {
  const shortExcerpt = text.slice(0, 1500);
  const slimPrompt = `Review this consumer agreement excerpt. Return at most 2 findings with exact verbatim quotes, keeping each string under 12 words.\n\n${shortExcerpt}`;
  try {
    return await models.localSlim.generateContent(slimPrompt);
  } catch {
    const lm = (
      globalThis as unknown as {
        LanguageModel?: {
          create?: (opts?: unknown) => Promise<{
            prompt: (input: string, opts?: unknown) => Promise<string>;
            destroy?: () => void;
            inputQuota?: number;
            inputUsage?: number;
          }>;
        };
      }
    ).LanguageModel;
    if (lm?.create) {
      const session = await lm.create({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      });
      try {
        const rawText = await session.prompt(slimPrompt, {
          responseConstraint: slimResponseConstraint,
          omitResponseConstraintInput: true,
        });
        return {
          response: {
            text: () => rawText,
            inferenceSource: "on_device",
          },
        };
      } catch (directErr) {
        const q = session.inputQuota;
        const u = session.inputUsage;
        const msg = directErr instanceof Error ? directErr.message : String(directErr);
        throw new Error(`${msg} [quota=${q ?? "n/a"}, usage=${u ?? "n/a"}]`);
      } finally {
        session.destroy?.();
      }
    }
    const compactPrompt = `Return ONLY valid JSON: {"documentType":"SUBSCRIPTION_TERMS","overallRisk":"HIGH","summary":"1 short sentence","findings":[{"category":"RENEWAL","severity":"HIGH","quote":"exact verbatim quote from text","plainEnglish":"short","whyItMatters":"short","nextStep":"short","confidence":"HIGH"}],"keyDates":[],"unknowns":[]}\n\nText:\n${text.slice(0, 600)}`;
    return await models.draftLocal.generateContent(compactPrompt);
  }
}

async function runScan(text: string, route: ScanRoute) {
    setBusy(true);
    setScanError(null);
    setCanRetry(false);
    setLastAttempt({ text, route });
    try {
      const generate =
        route === "local"
          ? async (prompt: string) => {
              try {
                return await models.local.generateContent(prompt);
              } catch (firstErr) {
                if (firstErr instanceof ScanParseError) throw firstErr;
                return localFallbackGenerate(text);
              }
            }
          : async (prompt: string) => {
              try {
                return await models.hybrid.generateContent(prompt);
              } catch {
                // @firebase/ai PREFER_ON_DEVICE does not catch errors thrown by
                // Chrome's on-device session, so fall back explicitly to cloudTriage.
                try {
                  return await models.cloudTriage.generateContent(prompt);
                } catch (cloudErr) {
                  const msg = cloudErr instanceof Error ? cloudErr.message : "";
                  if (/503|deadline expired|unavailable/i.test(msg)) {
                    return await models.cloudTriage.generateContent(prompt);
                  }
                  throw cloudErr;
                }
              }
            };
      // A truncated on-device answer is retried on the slim schema (local) or
      // on cloudTriage (hybrid), not by re-asking the exact same way.
      const retry =
        route === "local"
          ? () => localFallbackGenerate(text)
          : (prompt: string) => models.cloudTriage.generateContent(prompt);
      const scan = await runFirstPassScan(text, generate, retry);
      setScreen({ name: "results", source: text, scan });
      await saveSummary(scan);
    } catch (e) {
      const limited = rateLimitHint(e);
      if (limited) {
        setScanError(limited);
        setCanRetry(true);
        return;
      }
      const detail = quotaDetail(e);
      if (e instanceof ScanParseError) {
        setScanError(`The model's answer came back incomplete. Try again.${detail}`);
        setCanRetry(true);
      } else if (route === "local") {
        setScanError(`On-device scan failed. You can try the redacted cloud scan instead.${detail}`);
      } else {
        setScanError(`The cloud scan failed. You can try again.${detail}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function runResearch(source: string, redactedText: string, jurisdiction: JurisdictionId, scan?: ScanEnvelope) {
    setBusy(true);
    setScanError(null);
    setCanRetry(false);
    try {
      const research = await runCloudLegalResearch(redactedText, jurisdiction, (prompt) =>
        models.grounded.generateContent(prompt),
      );
      setScreen({ name: "research", source, redactedText, jurisdiction, research, scan });
    } catch (e) {
      setScanError(rateLimitHint(e) ?? "Grounded cloud research failed. You can try again.");
    } finally {
      setBusy(false);
    }
  }

  const isEvalMode =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("eval") === "1";

  function renderScreen() {
    if (isEvalMode) {
      return <EvalRunner />;
    }

    switch (screen.name) {
      case "input":
        return (
          <InputScreen
            deviceStatus={deviceStatus}
            text={inputText}
            onTextChange={setInputText}
            onPrivateScan={(text) => void runScan(text, "local")}
            onCloudScan={(text) => {
              setScanError(null);
              setCanRetry(false);
              setScreen({ name: "gate", purpose: "hybrid", text });
            }}
            busy={busy}
          />
        );

      case "gate": {
        const gate = screen;
        return (
          <RedactionGate
            initialText={gate.text}
            purpose={gate.purpose}
            onConfirm={(text, jurisdiction) => {
              if (gate.purpose === "research") {
                void runResearch(gate.text, text, jurisdiction ?? "UK", gate.scan);
                return;
              }
              void runScan(text, "hybrid");
            }}
            onCancel={() => {
              if (gate.scan) {
                setScreen({ name: "results", source: gate.text, scan: gate.scan });
              } else {
                setScreen({ name: "input" });
              }
            }}
          />
        );
      }

      case "results": {
        const result = screen;
        return (
          <ResultsScreen
            source={result.source}
            scan={result.scan}
            onDraft={() => setScreen({ name: "draft", source: result.source, scan: result.scan })}
            onResearch={() =>
              setScreen({ name: "gate", purpose: "research", text: result.source, scan: result.scan })
            }
            onReset={() => {
              setInputText("");
              setScanError(null);
              setCanRetry(false);
              setScreen({ name: "input" });
            }}
          />
        );
      }

      case "research": {
        const current = screen;
        return (
          <ResearchScreen
            markdown={current.research.markdown}
            grounding={current.research.grounding}
            onDraft={
              current.scan
                ? () =>
                    setScreen({
                      name: "draft",
                      source: current.source,
                      scan: current.scan!,
                      context: `${JURISDICTION_LABELS[current.jurisdiction]}: ${current.research.markdown}`,
                    })
                : undefined
            }
            onBack={() =>
              current.scan
                ? setScreen({ name: "results", source: current.source, scan: current.scan })
                : setScreen({ name: "input" })
            }
          />
        );
      }

      case "draft": {
        const current = screen;
        return (
          <DraftEditor
            findings={current.scan.data.findings}
            context={current.context}
            deviceStatus={deviceStatus}
            onBack={() => setScreen({ name: "results", source: current.source, scan: current.scan })}
          />
        );
      }
    }
  }

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
      {user === null && (
        <p>Sign in to keep a private history of your scans. Scanning itself will work without an account.</p>
      )}

      {deviceChecked ? (
        <ModelStatus status={deviceStatus} onEnable={handleEnableDevice} progress={downloadProgress} />
      ) : (
        <p className="hint">Checking on-device AI…</p>
      )}

      {scanError && (
        <div className="scan-error">
          <p role="alert" className="error">{scanError}</p>
          {canRetry && lastAttempt && (
            <button onClick={() => void runScan(lastAttempt.text, lastAttempt.route)}>Try again</button>
          )}
          {lastAttempt?.route === "local" && inputText.trim().length >= 80 && (
            <button
              onClick={() => {
                setScanError(null);
                setCanRetry(false);
                setScreen({ name: "gate", purpose: "hybrid", text: inputText });
              }}
            >
              Scan with cloud (redacted)
            </button>
          )}
        </div>
      )}

      {renderScreen()}

      {user && <ScanHistory user={user} onError={setError} refreshKey={historyVersion} />}

      <footer>Not legal advice. Check the original document and official guidance.</footer>
    </main>
  );
}

// The model answers with one of the five document types, but the rules only
// accept those five, so an unexpected value is stored as OTHER instead of
// being rejected.
function toDocumentType(value: string): ScanSummary["documentType"] {
  return (DOCUMENT_TYPES as readonly string[]).includes(value)
    ? (value as ScanSummary["documentType"])
    : "OTHER";
}

function ScanHistory({
  user,
  onError,
  refreshKey,
}: {
  user: User;
  onError: (m: string) => void;
  refreshKey: number;
}) {
  const [scans, setScans] = useState<SavedScan[] | null>(null);

  const refresh = useCallback(() => {
    listRecentScans(user.uid).then(setScans, (e: Error) => onError(e.message));
  }, [user.uid, onError]);

  useEffect(refresh, [refresh, refreshKey]);

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
