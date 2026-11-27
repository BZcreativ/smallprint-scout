import { parseTriage, ScanParseError } from "../domain/parse-result";
import { MAX_FINDINGS, normalizeForMatch, verifyQuotes } from "../domain/verify-quotes";
import { chunkText, prioritizeChunks, SINGLE_PASS_MAX } from "../domain/input";
import type { InferenceRoute, TriageResult } from "../domain/types";

// The first-pass triage scan.
//
// This module deliberately does not import `models.ts`. The model objects are
// passed in as a `GenerateFn`, so the unit tests stay free of Firebase and can
// run without the network (see `tests/firebase/scan.test.ts`).

export const SYSTEM_PROMPT_TRIAGE = `
You are a consumer-protection analyst. Review the supplied agreement text and identify practical financial, renewal, cancellation, refund, rights, and data-privacy implications.
Rules:
1. Every finding MUST include an exact verbatim 'quote' copied from the user's text.
2. Do not invent missing prices, dates, or legal conclusions. Put missing critical facts in 'unknowns'.
3. Return at most 3 high-priority findings sorted by practical impact.
4. Keep summary, plainEnglish, whyItMatters, and nextStep concise (under 15 words each).
5. Return ONLY the JSON object with no text before or after it.
6. Calibrate risk & severity for consumers and auditors:
   - HIGH (overallRisk or severity): clauses that strip rights, lock in money, or enable invasive/hard-to-refuse data practices (auto-renewal lock-ins, unilateral fee hikes, onerous cancellation or no-refund traps, arbitration/class-action waivers, AI training or perpetual content/biometric licences, broad third-party/ad data sharing, overriding user objections via legitimate interest, or cross-device tracking without clear opt-out).
   - MEDIUM / WATCH: borderline or asymmetric terms worth auditing (cross-border transfers outside UK/EU, broad discretion to change terms, vague retention periods, bundled consent).
   - LOW / INFO: transparent, consumer-friendly terms with no traps, no data sales, and no AI training.
7. Keep 'unknowns' relevant to the document type (e.g., retention periods or named third-party recipients for privacy notices; pricing/renewal/cancellation details for subscription terms).
`.trim();

export type GenerateFn = (prompt: string) => Promise<{ response: { text(): string; inferenceSource?: string } }>;

// Chrome's QuotaExceededError ("The input is too large.") carries the token
// counts that explain the rejection (`requested`, `contextWindow`). Showing
// them turns any recurrence into evidence instead of a bare message.
export function quotaDetail(e: unknown): string {
  const ex = e as { message?: string; requested?: unknown; contextWindow?: unknown };
  const message = typeof ex?.message === "string" && ex.message ? ex.message : "";
  const req = typeof ex?.requested === "number" ? ex.requested : undefined;
  const win = typeof ex?.contextWindow === "number" ? ex.contextWindow : undefined;
  if (req !== undefined && win !== undefined) {
    return ` (${message}: requested ${req} of ${win} tokens)`;
  }
  return message ? ` (${message})` : "";
}

// Gemini's free tier allows only 5 requests per minute per model. A 429 is a
// pacing problem, not a bug: the request was valid, the server just asks to
// retry in ~20-60s.
export function rateLimitHint(e: unknown): string | null {
  const message = (e as { message?: string })?.message ?? "";
  if (/limit:\s*0\b/i.test(message)) return null;
  return /429|exceeded your current quota/i.test(message)
    ? "Gemini's free tier allows 5 scans per minute — wait about 30 seconds and scan again."
    : null;
}

export interface ScanEnvelope {
  data: TriageResult;
  route: InferenceRoute;
  durationMs: number;
}

// The SDK reports the route it actually used (`ON_DEVICE` or `IN_CLOUD`), but
// a missing report is never assumed to be on-device: it is shown as UNKNOWN
// (amendment A6). Both the uppercase test literals and the SDK's lowercase
// enum values are accepted.
export function toRoute(v: unknown): InferenceRoute {
  if (v === "ON_DEVICE" || v === "on_device") return "ON_DEVICE";
  if (v === "IN_CLOUD" || v === "in_cloud") return "IN_CLOUD";
  return "UNKNOWN";
}

export async function runFirstPassScan(
  text: string,
  generate: GenerateFn,
  retryGenerate: GenerateFn = generate,
): Promise<ScanEnvelope> {
  const started = performance.now();
  const prompt = `${SYSTEM_PROMPT_TRIAGE}\n\n--- AGREEMENT TEXT ---\n${text}`;

  let response = await generate(prompt);
  let data: TriageResult;
  try {
    data = parseTriage(response.response.text());
  } catch (error) {
    if (!(error instanceof ScanParseError)) throw error;
    console.warn("[SmallPrint] First pass parse failed:", error.message, "\nRaw output:", response.response.text());
    // One silent retry (amendment A9). The retry model is a separate function:
    // the on-device route passes the slim schema here, because a truncated
    // answer means the output cap was hit and re-asking the same way loses.
    response = await retryGenerate(prompt);
    try {
      data = parseTriage(response.response.text());
    } catch (retryErr) {
      if (retryErr instanceof ScanParseError) {
        console.warn("[SmallPrint] Retry parse failed:", retryErr.message, "\nRaw output:", response.response.text());
      }
      throw retryErr;
    }
  }

  return {
    data: verifyQuotes(data, text),
    route: toRoute(response.response.inferenceSource),
    durationMs: Math.round(performance.now() - started),
  };
}

// Merges the per-chunk triage answers of a long scan into one result.
// Chunks are verbatim slices of the original document, so each chunk's
// findings were already quote-verified by runFirstPassScan against text that
// is inside the original — no re-verification is needed here. The same clause
// can be reported by neighbouring chunks (a clause cut across a boundary),
// so findings and key dates are deduplicated by their normalized quote.
export function mergeTriage(parts: TriageResult[]): TriageResult {
  const riskRank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const severityRank = { INFO: 0, WATCH: 1, HIGH: 2 };
  // The summary that travels with the result is the one from the riskiest
  // chunk: its findings are the ones the merged top-3 will mostly show.
  const worst = parts.reduce((a, b) => (riskRank[b.overallRisk] > riskRank[a.overallRisk] ? b : a));

  function dedupByKey<T>(items: T[], key: (item: T) => string): T[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const k = key(item);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const findings = dedupByKey(parts.flatMap((p) => p.findings), (f) => normalizeForMatch(f.quote))
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
    .slice(0, MAX_FINDINGS);

  const keyDates = dedupByKey(parts.flatMap((p) => p.keyDates), (k) => normalizeForMatch(k.sourceQuote));
  const unknowns = [...new Set(parts.flatMap((p) => p.unknowns))];

  return {
    documentType: parts.map((p) => p.documentType).find((t) => t !== "OTHER") ?? "OTHER",
    overallRisk: worst.overallRisk,
    summary: worst.summary,
    findings,
    keyDates,
    unknowns,
  };
}

// Scans a document that is longer than one on-device prompt: cut it into
// paragraph-aligned chunks, run a normal first pass on each (its own retry
// chain and quote verification), and merge the answers. Chunks run
// sequentially, never in parallel — on-device has no rate limit but the cloud
// fallback does (5 requests/minute), and one chunk failing must not spend the
// others' retries at the same time.
export async function runLongScan(
  text: string,
  generate: GenerateFn,
  retryGenerate: GenerateFn = generate,
  onProgress?: (current: number, total: number) => void,
): Promise<ScanEnvelope> {
  // Scan high-risk sections first on long on-device policies: chunks stay
  // verbatim slices, only evaluated in stable risk-signal order.
  const chunks = prioritizeChunks(chunkText(text, SINGLE_PASS_MAX));
  const started = performance.now();

  const envelopes: ScanEnvelope[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);
    envelopes.push(await runFirstPassScan(chunks[i], generate, retryGenerate));
  }

  // Never assume on-device: one chunk that fell back to the cloud (or one
  // whose route could not be read) makes the merged route honest about it.
  const route: InferenceRoute = envelopes.some((e) => e.route === "IN_CLOUD")
    ? "IN_CLOUD"
    : envelopes.every((e) => e.route === "ON_DEVICE")
      ? "ON_DEVICE"
      : "UNKNOWN";

  return {
    data: mergeTriage(envelopes.map((e) => e.data)),
    route,
    durationMs: Math.round(performance.now() - started),
  };
}
