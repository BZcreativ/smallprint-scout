import { parseTriage, ScanParseError } from "../domain/parse-result";
import { verifyQuotes } from "../domain/verify-quotes";
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
