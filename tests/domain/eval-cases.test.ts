import { expect, test } from "vitest";
import { EVAL_CASES, scoreCase, type EvalCase } from "../../src/domain/eval-cases";
import type { Finding, TriageResult } from "../../src/domain/types";

const finding = (severity: Finding["severity"], category: Finding["category"]): Finding => ({ category, severity, quote: "", plainEnglish: "", whyItMatters: "", nextStep: "", confidence: "HIGH", quoteVerified: true });

function result(overallRisk: TriageResult["overallRisk"], findings: Finding[], unknowns: string[] = []): TriageResult {
  return { documentType: "SUBSCRIPTION_TERMS", overallRisk, summary: "", findings, keyDates: [], unknowns };
}

test("benign case with one HIGH finding fails", () => {
  const benign = EVAL_CASES.find((c) => c.mustNotFlag)!;
  const scored = scoreCase(benign, result("LOW", [finding("HIGH", "OTHER")]));
  expect(scored.pass).toBe(false);
  expect(scored.reasons).toContain("flagged HIGH on benign text");
});

test("case missing a required category fails naming it", () => {
  const c = EVAL_CASES.find((x) => !x.mustNotFlag && x.mustInclude.length > 0)!;
  const [missing, ...kept] = c.mustInclude;
  const scored = scoreCase(c, result(c.expectRisk[0], kept.map((category) => finding("WATCH", category))));
  expect(scored.pass).toBe(false);
  expect(scored.reasons).toContain(`missing required category: ${missing}`);
});

test("valid result passes and records the verified-quote rate", () => {
  const c: EvalCase = { id: "valid", text: "a".repeat(80), expectRisk: ["MEDIUM"], mustInclude: ["PRICE"], mustNotFlag: true };
  const scored = scoreCase(c, result("MEDIUM", [finding("WATCH", "PRICE")]));
  expect(scored.pass).toBe(true);
  expect(scored.reasons).toEqual([]);
  expect(scored.verifiedQuoteRate).toBe(1);
});

test("EVAL_CASES.length === 12", () => expect(EVAL_CASES).toHaveLength(12));
