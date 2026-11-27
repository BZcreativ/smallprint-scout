import { expect, test } from "vitest";
import { findQuoteRange, normalizeForMatch, verifyQuotes } from "../../src/domain/verify-quotes";
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

const quote = "prepaid annual fees are non-refundable";
test("findQuoteRange finds the exact offsets of an exact match", () =>
  expect(findQuoteRange(src, quote)).toEqual({ start: src.indexOf(quote), end: src.indexOf(quote) + quote.length }));

test("findQuoteRange survives curly quotes, dashes and collapsed whitespace", () => {
  const fancy = `All prepaid annual ‘fees’\nare non–refundable, and no prorated credits will be issued.`;
  const range = findQuoteRange(fancy, "prepaid annual 'fees' are non-refundable");
  expect(range).not.toBeNull();
  expect(normalizeForMatch(fancy.slice(range!.start, range!.end))).toBe("prepaid annual 'fees' are non-refundable");
});

test("findQuoteRange returns null for a paraphrase or too-short quote", () => {
  expect(findQuoteRange(src, "fees cannot be refunded")).toBeNull();
  expect(findQuoteRange(src, "fees")).toBeNull();
});

test("findQuoteRange keeps trailing surrogate pairs intact", () => {
  const emojiSrc = "Fees are non-refundable 🔒 unless required by law.";
  const range = findQuoteRange(emojiSrc, "Fees are non-refundable 🔒");
  expect(range).not.toBeNull();
  expect(emojiSrc.slice(range!.start, range!.end)).toBe("Fees are non-refundable 🔒");
});
