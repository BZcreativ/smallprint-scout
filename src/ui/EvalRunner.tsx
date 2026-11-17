import { useState } from "react";
import { EVAL_CASES, scoreCase } from "../domain/eval-cases";
import { models } from "../firebase/models";
import { runFirstPassScan } from "../firebase/scan";

// The on-device 12-case runner, reached at `?eval=1` and linked nowhere.
//
// It runs the cases one at a time on purpose: the point of the suite is to
// measure the prompt the way a user would meet it, on the same device model,
// and a case that throws is reported as a failure rather than stopping the run
// (the scan has already retried once by then).

interface Row {
  id: string;
  pass: boolean;
  reasons: string[];
  findings: number;
  verified: number;
}

export interface EvalRunnerProps {
  onBack?: () => void;
}

export function EvalRunner({ onBack }: EvalRunnerProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const done: Row[] = [];

    for (const testCase of EVAL_CASES) {
      setCurrent(testCase.id);
      try {
        const envelope = await runFirstPassScan(testCase.text, (prompt) => models.local.generateContent(prompt));
        const score = scoreCase(testCase, envelope.data);
        done.push({
          id: testCase.id,
          pass: score.pass,
          reasons: score.reasons,
          findings: envelope.data.findings.length,
          verified: envelope.data.findings.filter((f) => f.quoteVerified).length,
        });
      } catch (error) {
        done.push({
          id: testCase.id,
          pass: false,
          reasons: [error instanceof Error ? error.message : "Unknown error"],
          findings: 0,
          verified: 0,
        });
      }

      // Show each result as it lands: a full run can take minutes on-device.
      setRows([...done]);
    }

    setCurrent(null);
    setBusy(false);
  }

  const passed = rows.filter((row) => row.pass).length;
  const findings = rows.reduce((sum, row) => sum + row.findings, 0);
  const verified = rows.reduce((sum, row) => sum + row.verified, 0);
  const verifiedPct = findings === 0 ? 0 : Math.round((verified / findings) * 100);

  return (
    <section className="eval-runner">
      <div className="bar">
        <h2>12-case evaluation</h2>
        <div>
          <button onClick={run} disabled={busy}>
            {busy ? "Running…" : "Run the 12 cases on this device"}
          </button>
          {onBack && <button onClick={onBack}>Back</button>}
        </div>
      </div>

      <p className="hint">
        Target: at least 10 of 12 pass, with at least 80% of quotes verified. Tune `SYSTEM_PROMPT_TRIAGE` only.
      </p>

      {current && <p className="hint">Running {current}…</p>}

      {rows.length > 0 && (
        <>
          <p>
            <strong>
              {passed}/{EVAL_CASES.length} pass
            </strong>{" "}
            — {verifiedPct}% of quotes verified ({verified}/{findings}).
          </p>

          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Result</th>
                <th>Verified</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td className={row.pass ? undefined : "error"}>{row.pass ? "pass" : "fail"}</td>
                  <td>
                    {row.verified}/{row.findings}
                  </td>
                  <td>{row.reasons.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export default EvalRunner;
