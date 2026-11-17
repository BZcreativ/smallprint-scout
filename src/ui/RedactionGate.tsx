import { useState } from "react";
import { redact } from "../domain/redact";
import { JURISDICTION_LABELS, type JurisdictionId } from "../domain/types";

// The gate every cloud call passes through.
//
// The text arrives masked by `redact`, but it stays editable: the user may want
// to take more out, or to put a price back before it leaves the machine. The
// count is the one `redact` reported for the text that was pasted.

export interface RedactionGateProps {
  initialText: string;
  purpose: "hybrid" | "research";
  onConfirm: (text: string, jurisdiction?: JurisdictionId) => void;
  onCancel: () => void;
}

function maskedLabel(count: number): string {
  if (count === 0) return "0 items masked";
  if (count === 1) return "1 item masked";
  return `${count} items masked`;
}

export function RedactionGate({ initialText, purpose, onConfirm, onCancel }: RedactionGateProps) {
  const [masked] = useState(() => redact(initialText));
  const [text, setText] = useState(masked.redactedText);
  const [jurisdiction, setJurisdiction] = useState<JurisdictionId>("UK");

  const heading =
    purpose === "research"
      ? "Send to Google Gemini for legal research"
      : "Send to Google Gemini for a cloud scan";

  function confirm() {
    if (purpose === "research") onConfirm(text, jurisdiction);
    else onConfirm(text);
  }

  return (
    <section className="gate">
      <h2>{heading}</h2>
      <p className="hint">
        Personal details are masked below. Check the text, edit it if you want, then confirm what is sent.
      </p>
      <p className="masked-count">{maskedLabel(masked.replacementsCount)}</p>

      <label className="field" htmlFor="redacted-text">
        Text to send
        <textarea
          id="redacted-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={12}
        />
      </label>

      {purpose === "research" && (
        <label className="field" htmlFor="jurisdiction">
          Jurisdiction
          <select
            id="jurisdiction"
            value={jurisdiction}
            onChange={(event) => setJurisdiction(event.target.value as JurisdictionId)}
          >
            <option value="UK">{JURISDICTION_LABELS.UK}</option>
            <option value="US">{JURISDICTION_LABELS.US}</option>
          </select>
        </label>
      )}

      <div className="actions">
        <button className="primary" onClick={confirm} disabled={text.trim().length === 0}>
          Confirm &amp; send this text to Google Gemini
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

export default RedactionGate;
