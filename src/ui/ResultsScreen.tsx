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

const RISK_META = {
  LOW: { level: 1, label: "Low risk", title: "Low risk — no major red flags spotted" },
  MEDIUM: { level: 2, label: "Medium risk", title: "Medium risk — borderline clauses to check" },
  HIGH: { level: 3, label: "High risk", title: "High risk — review carefully before accepting" },
} as const;

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
  const riskMeta = RISK_META[data.overallRisk];

  return (
    <section className="results">
      <div className={`risk-banner risk-${data.overallRisk.toLowerCase()}`}>
        <div className="risk-banner-top">
          <span className="risk-title">{riskMeta.title}</span>
          <span className={`badge route-${scan.route.toLowerCase()}`}>{ROUTE_BADGES[scan.route]}</span>
        </div>
        <div
          className="risk-meter"
          role="meter"
          aria-label="Overall criticality"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={riskMeta.level}
          aria-valuetext={riskMeta.label}
        >
          <span className={riskMeta.level >= 1 ? "seg on" : "seg"} />
          <span className={riskMeta.level >= 2 ? "seg on" : "seg"} />
          <span className={riskMeta.level >= 3 ? "seg on" : "seg"} />
        </div>
        <p className="hint risk-meta">
          {findings.length} {findings.length === 1 ? "finding" : "findings"} · {source.length.toLocaleString("en-GB")} characters scanned · {scan.durationMs.toLocaleString("en-GB")} ms
        </p>
      </div>

      <p className="summary">{data.summary}</p>

      {findings.length > 0 && (
        <>
          <h2>What to look at</h2>
          {findings.map((finding, index) => (
            <article className={`card sev-${finding.severity.toLowerCase()}`} key={`${finding.category}-${index}`}>
              <h3>
                {finding.category}{" "}
                <span className={`chip sev-${finding.severity.toLowerCase()}`}>{finding.severity}</span>
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
