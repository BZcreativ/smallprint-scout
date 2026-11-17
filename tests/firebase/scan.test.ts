import { expect, test, vi } from "vitest";
import { quotaDetail, runFirstPassScan, toRoute } from "../../src/firebase/scan";
import { ScanParseError } from "../../src/domain/parse-result";

// Sample 2 from docs/spec.md §5.
const SAMPLE = `CloudWork Pro — Subscription & Billing Terms (Section 4)
Your annual promotional plan (£96 billed upfront, equivalent to £8/month) will automatically renew at the then-current standard list rate (currently £240/year) unless auto-renewal is disabled in Account Settings at least 30 days before the end of your billing cycle. We reserve the right to modify subscription fees at any time upon 15 days' notice sent by email; continued use constitutes acceptance. All prepaid annual fees are non-refundable, and no prorated credits or refunds will be issued for partial months or unused seats if you downgrade or cancel mid-cycle.`;

const VALID_JSON = JSON.stringify({
  documentType: "SUBSCRIPTION_TERMS",
  overallRisk: "HIGH",
  summary: "The plan renews at a higher price and prepaid fees are not refunded.",
  findings: [
    {
      category: "REFUND",
      severity: "HIGH",
      quote: "All prepaid annual fees are non-refundable",
      plainEnglish: "You cannot get your money back.",
      whyItMatters: "A mid-cycle cancellation still costs you the full price.",
      nextStep: "Cancel before the renewal date, not after.",
      confidence: "HIGH",
    },
  ],
  keyDates: [],
  unknowns: ["Whether a 30-day cooling-off right applies to this plan"],
});

test("toRoute maps undefined to UNKNOWN", () => expect(toRoute(undefined)).toBe("UNKNOWN"));

test("quotaDetail appends Chrome's token counts when present", () => {
  const quotaError: unknown = Object.assign(
    new Error("The input is too large."),
    { requested: 1179, contextWindow: 1024 },
  );
  expect(quotaDetail(quotaError)).toBe(" (The input is too large.: requested 1179 of 1024 tokens)");
});

test("quotaDetail falls back to the bare message", () => {
  expect(quotaDetail(new Error("boom"))).toBe(" (boom)");
  expect(quotaDetail("not an error")).toBe("");
  expect(quotaDetail(new Error(""))).toBe("");
});

test("retries once then throws ScanParseError", async () => {
  const gen = vi.fn().mockResolvedValue({ response: { text: () => "not json" } });
  await expect(runFirstPassScan(SAMPLE, gen)).rejects.toThrow(ScanParseError);
  expect(gen).toHaveBeenCalledTimes(2);
});

test("succeeds on retry and reports route", async () => {
  const gen = vi.fn()
    .mockResolvedValueOnce({ response: { text: () => "{" } })
    .mockResolvedValueOnce({ response: { text: () => VALID_JSON, inferenceSource: "ON_DEVICE" } });
  const r = await runFirstPassScan(SAMPLE, gen);
  expect(r.route).toBe("ON_DEVICE");
  expect(gen).toHaveBeenCalledTimes(2);
  expect(r.data.findings[0].quoteVerified).toBe(true);
});
