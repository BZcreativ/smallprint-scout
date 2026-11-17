import type { Finding } from "./types";

// The prompt behind the three action drafts.
//
// The one rule that matters: a message may only state a clause that the scan
// actually quoted, word for word. A finding whose quote did not survive the
// quote check is hedge-able ("the terms appear to say ..."), never presented
// as the contract's own words. Real names and account numbers never enter the
// prompt either: the draft uses placeholders so the user fills them in after
// the fact.

export type DraftKind = "CANCEL" | "CLARIFY" | "NEGOTIATE";

const ASK: Record<DraftKind, string> = {
  CANCEL: "Ask to cancel the agreement and to confirm the cancellation in writing.",
  CLARIFY: "Ask the provider to clarify these terms in writing before the next payment.",
  NEGOTIATE: "Ask the provider to change these terms to a fairer version.",
};

export function buildDraftPrompt(kind: DraftKind, findings: Finding[], context?: string): string {
  const clauses = findings.map((f) =>
    f.quoteVerified
      ? `- verbatim: "${f.quote}"`
      : `- the terms appear to say: "${f.quote}"`,
  );

  return [
    `You are helping a consumer write to a company. ${ASK[kind]}`,
    "Write one polite message under 180 words. Use plain English, keep it factual, and never invent a term that is not listed below.",
    "Use [YOUR NAME] and [ACCOUNT NUMBER] as placeholders. Never write a real name, address, phone number, email, or account number.",
    "",
    "What the agreement contains:",
    ...(clauses.length > 0
      ? clauses
      : ["- No specific clause was selected. Ask for written confirmation of the terms without claiming to quote them."]),
    ...(context ? ["", `The consumer adds: ${context}`] : []),
    "",
    "End by asking for written confirmation of the outcome.",
  ].join("\n");
}
