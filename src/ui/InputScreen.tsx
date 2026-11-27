import { useState } from "react";
import { MAX_LENGTH, SINGLE_PASS_MAX, chunkText, validateInput } from "../domain/input";
import type { DeviceStatus } from "../firebase/device";

// The first screen: paste an agreement, or load one of the seeded samples.
//
// The private scan is the default and stays disabled until the on-device model
// is ready. The cloud button is always there, because the judge's browser may
// have no Gemini Nano at all.

const SAMPLES = [
  { id: "gym-membership", label: "Gym membership" },
  { id: "subscription-renewal", label: "Subscription renewal" },
  { id: "privacy-ai-terms", label: "Privacy & AI terms" },
] as const;

export interface InputScreenProps {
  deviceStatus: DeviceStatus;
  text: string;
  onTextChange: (text: string) => void;
  onPrivateScan: (text: string) => void;
  onCloudScan: (text: string) => void;
  busy?: boolean;
  progressLabel?: string | null;
}

export function InputScreen({
  deviceStatus,
  text,
  onTextChange,
  onPrivateScan,
  onCloudScan,
  busy = false,
  progressLabel = null,
}: InputScreenProps) {
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const trimmedLength = text.trim().length;
  const validation = validateInput(text);
  const hasText = trimmedLength > 0;
  const invalid = hasText && !validation.ok;
  const overLimit = trimmedLength > MAX_LENGTH;
  const sectionCount =
    hasText && !overLimit && trimmedLength > SINGLE_PASS_MAX ? chunkText(text.trim(), SINGLE_PASS_MAX).length : 0;

  async function loadSample(id: string) {
    setSampleError(null);
    setFormError(null);
    setLoadingSample(id);
    try {
      const response = await fetch(`/samples/${id}.txt`);
      if (!response.ok) throw new Error(`could not load the sample (HTTP ${response.status})`);
      onTextChange(await response.text());
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSample(null);
    }
  }

  // The domain check runs before anything is sent to a model, so a too short
  // or too long paste never costs a scan.
  function submit(action: (value: string) => void) {
    const result = validateInput(text);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setFormError(null);
    action(result.text);
  }

  return (
    <section className="input-screen">
      <h2>Scan an agreement</h2>
      <p className="hint">
        Paste the terms you were asked to agree to. The private scan never sends your text anywhere.
      </p>

      <div className="samples">
        <h3>Try a sample</h3>
        {SAMPLES.map((sample) => (
          <button
            key={sample.id}
            onClick={() => void loadSample(sample.id)}
            disabled={busy || loadingSample !== null}
          >
            {loadingSample === sample.id ? "Loading…" : sample.label}
          </button>
        ))}
      </div>

      <label className="field" htmlFor="agreement-text">
        Agreement text
        <textarea
          id="agreement-text"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          rows={12}
          placeholder="Paste the agreement text here…"
        />
      </label>

      <p className="hint" aria-live="polite">
        {text.length.toLocaleString("en-GB")} characters
      </p>

      {sampleError && (
        <p role="alert" className="error">
          Could not load the sample: {sampleError}
        </p>
      )}
      {formError && (
        <p role="alert" className="error">
          {formError}
        </p>
      )}
      {invalid && !formError && <p className="error">{validation.message}</p>}
      {overLimit && (
        <p className="hint">
          Tip: that is above the scan limit — paste the sections that matter, not the whole document.
        </p>
      )}
      {sectionCount > 1 && (
        <p className="hint">
          Long agreement ({sectionCount} sections on-device, or 1 pass in cloud).
        </p>
      )}

      <div className="actions">
        <button
          className="primary"
          onClick={() => submit(onPrivateScan)}
          disabled={deviceStatus !== "available" || busy}
        >
          Private Scan
        </button>
        <button
          className={deviceStatus === "unsupported" ? "primary" : undefined}
          onClick={() => submit(onCloudScan)}
          disabled={busy}
        >
          Scan with cloud (redacted)
        </button>
        {hasText && (
          <button
            type="button"
            onClick={() => {
              onTextChange("");
              setFormError(null);
              setSampleError(null);
            }}
            disabled={busy}
          >
            Clear
          </button>
        )}
      </div>

      {deviceStatus !== "available" && (
        <p className="hint">The private scan needs the on-device model. The cloud scan works without it.</p>
      )}
      {busy && (
        <p className="hint" aria-live="polite">
          {progressLabel ?? "Scanning…"}
        </p>
      )}
    </section>
  );
}

export default InputScreen;
