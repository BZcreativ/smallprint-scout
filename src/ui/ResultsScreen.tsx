import type { ScanEnvelope } from "../firebase/scan";

// The result of one scan.
//
// Every quote the model produced is checked against the text that was
// actually scanned. A quote that was not found keeps its wording, but is
// marked as unverified so nobody quotes it back at the company.

const ROUTE_BADGES = {
  ON_DEVICE: "On this device",
  IN_CLOUD: "Google Cloud (redacted text)",
  UNKNOWN: "Route unknown",
} as const;

const UNVERIFIED_CHIP = "Unverified quote — check the original";

export interface ResultsScreenProps {
  source: string;
  scan: ScanEnvelope;
  onDraft: () => void;
  onResearch: () => void;
  onReset: () => void;
}

export function ResultsScreen({ source, scan, onDraft, onResearch, onReset }: ResultsScreenProps) {
  const { data } = scan;
  const findings = data.findings.slice(0, 3);

  return (
    <section className="results">
      <div className="results-head">
        <span className={`badge route-${scan.route.toLowerCase()}`}>{ROUTE_BADGES[scan.route]}</span>
        <span className={`risk risk-${data.overallRisk.toLowerCase()}`}>{data.overallRisk} risk</span>
        <span className="hint">{scan.durationMs.toLocaleString("en-GB")} ms</span>
      </div>

      <p className="summary">{data.summary}</p>
      <p className="hint">
        Scanned {source.length.toLocaleString("en-GB")} characters.
      </p>

      {findings.length > 0 && (
        <>
          <h2>What to look at</h2>
          {findings.map((finding, index) => (
            <article className="card" key={`${finding.category}-${index}`}>
              <h3>
                {finding.category} <span className="chip">{finding.severity}</span>
              </h3>
              <p>{finding.plainEnglish}</p>
              {finding.whyItMatters && <p className="why">{finding.whyItMatters}</p>}
              {finding.nextStep && (
                <p className="next-step">
                  <strong>What to do:</strong> {finding.nextStep}
                </p>
              )}
              {finding.quoteVerified ? (
                <blockquote>{finding.quote}</blockquote>
              ) : (
                <>
                  <p className="quote">{finding.quote}</p>
                  <span className="chip unverified">{UNVERIFIED_CHIP}</span>
                </>
              )}
            </article>
          ))}
        </>
      )}

      {data.keyDates.length > 0 && (
        <>
          <h2>Key dates</h2>
          <ul className="dates">
            {data.keyDates.map((keyDate, index) => (
              <li key={`${keyDate.event}-${index}`}>
                <strong>{keyDate.event}</strong> — {keyDate.dateOrTrigger}
                {keyDate.sourceVerified ? (
                  <blockquote>{keyDate.sourceQuote}</blockquote>
                ) : (
                  <>
                    <p className="quote">{keyDate.sourceQuote}</p>
                    <span className="chip unverified">{UNVERIFIED_CHIP}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {data.unknowns.length > 0 && (
        <>
          <h2>What we do not know</h2>
          <ul className="unknowns">
            {data.unknowns.map((unknown, index) => (
              <li key={index}>{unknown}</li>
            ))}
          </ul>
        </>
      )}

      <div className="actions">
        <button onClick={onDraft}>Draft a message</button>
        <button onClick={onResearch}>Research in cloud</button>
        <button onClick={onReset}>Scan another agreement</button>
      </div>
    </section>
  );
}

export default ResultsScreen;
