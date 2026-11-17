import { useState } from "react";
import { buildDraftPrompt, type DraftKind } from "../domain/drafts";
import { redact } from "../domain/redact";
import type { Finding } from "../domain/types";
import type { DeviceStatus } from "../firebase/device";
import { models } from "../firebase/models";

// The copyable action drafts.
//
// Both routes exist here, and the user picks one by clicking: with Nano ready
// the draft is written on this device and nothing leaves it, and without Nano
// the app asks first and shows the exact redacted prompt that the cloud call
// would send. The draft is always editable, because the consumer is the one
// signing it.

const KINDS: { kind: DraftKind; label: string }[] = [
  { kind: "CANCEL", label: "Cancel" },
  { kind: "CLARIFY", label: "Clarify" },
  { kind: "NEGOTIATE", label: "Negotiate" },
];

export interface DraftEditorProps {
  findings: Finding[];
  context?: string;
  deviceStatus: DeviceStatus;
  onBack?: () => void;
}

export function DraftEditor({ findings, context, deviceStatus, onBack }: DraftEditorProps) {
  const [pending, setPending] = useState<{ kind: DraftKind; prompt: string } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onDevice = deviceStatus === "available";

  async function draft(kind: DraftKind) {
    setBusy(true);
    setStatus(null);

    try {
      if (!onDevice) {
        // Wait for consent: the redacted prompt is the whole outbound payload,
        // so the user can read it before it is sent.
        const prompt = buildDraftPrompt(kind, findings, context);
        setPending({ kind, prompt: redact(prompt).redactedText });
        setDraftText("");
        return;
      }

      const res = await models.draftLocal.generateContent(buildDraftPrompt(kind, findings, context));
      setDraftText(res.response.text());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The draft failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendToCloud() {
    if (!pending) return;
    setBusy(true);
    setStatus(null);

    try {
      const res = await models.draftHybrid.generateContent(pending.prompt);
      setDraftText(res.response.text());
      setPending(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The cloud draft failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draftText);
      setStatus("Copied.");
    } catch {
      // Clipboard access can be refused; the draft is still in the textarea.
      setStatus("Copy failed. Select the draft and copy it manually.");
    }
  }

  return (
    <section className="draft-editor">
      <div className="bar">
        <h2>Draft a message</h2>
        <div>
          {KINDS.map(({ kind, label }) => (
            <button key={kind} onClick={() => draft(kind)} disabled={busy}>
              {label}
            </button>
          ))}
          {onBack && <button onClick={onBack}>Back</button>}
        </div>
      </div>

      <p className="hint">
        {onDevice
          ? "Drafted on this device. Nothing leaves it."
          : "The on-device model isn't ready, so this draft is written in the cloud from redacted text."}
      </p>

      {pending && (
        <section className="consent">
          <h3>Send the redacted request to the cloud?</h3>
          <p>This is exactly what leaves your device:</p>
          <textarea readOnly rows={10} value={pending.prompt} />
          <button onClick={sendToCloud} disabled={busy}>
            Send redacted request to cloud
          </button>
          <button onClick={() => setPending(null)} disabled={busy}>
            Cancel
          </button>
        </section>
      )}

      {status && <p className="hint">{status}</p>}

      <textarea
        aria-label="Your draft"
        onChange={(event) => setDraftText(event.target.value)}
        rows={12}
        value={draftText}
      />

      <button onClick={copy} disabled={draftText === ""}>
        Copy
      </button>
    </section>
  );
}

export default DraftEditor;
