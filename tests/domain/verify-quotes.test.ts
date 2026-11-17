import { expect, test } from "vitest";
import { verifyQuotes } from "../../src/domain/verify-quotes";
import type { Finding, TriageResult } from "../../src/domain/types";

const src = `All prepaid annual fees are non-refundable, and no prorated credits will be issued.`;
const base: Omit<TriageResult, "findings"> = {
  documentType: "SUBSCRIPTION_TERMS",
  overallRisk: "HIGH",
  summary: "",
  keyDates: [],
  unknowns: [],
};
const f = (quote: string) => ({ category: "REFUND", severity: "HIGH", quote, plainEnglish: "", whyItMatters: "", nextStep: "", confidence: "HIGH", quoteVerified: false }) as Finding;

test("verifies exact quote", () => expect(verifyQuotes({ ...base, findings: [f("prepaid annual fees are non-refundable")] }, src).findings[0].quoteVerified).toBe(true));
test("verifies quotes that differ only in quote/dash style", () => expect(verifyQuotes({ ...base, findings: [f("All prepaid annual fees are non–refundable")] }, src).findings[0].quoteVerified).toBe(true));
test("flags paraphrase but keeps its text", () => { const r = verifyQuotes({ ...base, findings: [f("fees cannot be refunded")] }, src).findings[0]; expect(r.quoteVerified).toBe(false); expect(r.quote).toBe("fees cannot be refunded"); });
test("rejects quotes shorter than 8 chars", () => expect(verifyQuotes({ ...base, findings: [f("fees")] }, src).findings[0].quoteVerified).toBe(false));
test("caps findings at 3", () => expect(verifyQuotes({ ...base, findings: [1, 2, 3, 4].map(() => f("x")) }, src).findings).toHaveLength(3));
test("verifies key date source quotes", () => expect(verifyQuotes({ ...base, findings: [], keyDates: [{ event: "e", dateOrTrigger: "d", sourceQuote: "no prorated credits", sourceVerified: false }] }, src).keyDates[0].sourceVerified).toBe(true));
