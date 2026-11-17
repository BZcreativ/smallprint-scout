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
`.trim();

export type GenerateFn = (prompt: string) => Promise<{ response: { text(): string; inferenceSource?: string } }>;

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

export async function runFirstPassScan(text: string, generate: GenerateFn): Promise<ScanEnvelope> {
  const started = performance.now();
  const prompt = `${SYSTEM_PROMPT_TRIAGE}\n\n--- AGREEMENT TEXT ---\n${text}`;

  let response = await generate(prompt);
  let data: TriageResult;
  try {
    data = parseTriage(response.response.text());
  } catch (error) {
    if (!(error instanceof ScanParseError)) throw error;
    // One silent retry: the on-device model sometimes answers with truncated
    // JSON. If the retry fails too, the error reaches the UI as a readable
    // "try again" state (amendment A9).
    response = await generate(prompt);
    data = parseTriage(response.response.text());
  }

  return {
    data: verifyQuotes(data, text),
    route: toRoute(response.response.inferenceSource),
    durationMs: Math.round(performance.now() - started),
  };
}
