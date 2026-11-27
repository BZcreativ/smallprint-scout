import { expect, test, vi } from "vitest";
import { mergeTriage, quotaDetail, rateLimitHint, runFirstPassScan, runLongScan, toRoute } from "../../src/firebase/scan";
import { ScanParseError } from "../../src/domain/parse-result";
import type { Finding, TriageResult } from "../../src/domain/types";

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

test("rateLimitHint detects the free-tier 429 quota error", () => {
  const err = new Error(
    "Error fetching from https://firebasevertexai.googleapis.com/...:generateContent: [429 ] You exceeded your current quota, please check your plan and billing details.",
  );
  expect(rateLimitHint(err)).toMatch(/5 scans per minute/);
  expect(rateLimitHint(new Error("boom"))).toBeNull();
  expect(rateLimitHint("not an error")).toBeNull();
});

test("parse failure retries on the provided retry model", async () => {
  const gen = vi.fn().mockResolvedValue({ response: { text: () => "{" } });
  const retryGen = vi.fn().mockResolvedValue({ response: { text: () => VALID_JSON, inferenceSource: "ON_DEVICE" } });
  const r = await runFirstPassScan(SAMPLE, gen, retryGen);
  expect(r.route).toBe("ON_DEVICE");
  expect(gen).toHaveBeenCalledTimes(1);
  expect(retryGen).toHaveBeenCalledTimes(1);
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

// --- long-document scanning (runLongScan / mergeTriage) ---

function triage(overrides: Partial<TriageResult>): TriageResult {
  return {
    documentType: "OTHER",
    overallRisk: "LOW",
    summary: "s",
    findings: [],
    keyDates: [],
    unknowns: [],
    ...overrides,
  };
}

function findingOf(quote: string, severity: Finding["severity"] = "HIGH"): Finding {
  return {
    category: "RENEWAL",
    severity,
    quote,
    plainEnglish: "p",
    whyItMatters: "w",
    nextStep: "n",
    confidence: "HIGH",
    quoteVerified: true,
  };
}

const triageJson = (quote: string) =>
  JSON.stringify({
    documentType: "SUBSCRIPTION_TERMS",
    overallRisk: "HIGH",
    summary: "Chunk summary.",
    findings: [
      {
        category: "REFUND",
        severity: "HIGH",
        quote,
        plainEnglish: "p",
        whyItMatters: "w",
        nextStep: "n",
        confidence: "HIGH",
      },
    ],
    keyDates: [],
    unknowns: [],
  });

test("mergeTriage dedups quotes, keeps the worst risk, and caps findings", () => {
  const dup = "All prepaid annual fees are non-refundable";
  const parts = [
    triage({ findings: [findingOf(dup), findingOf("Auto-renewal continues unless disabled 30 days before", "WATCH")], unknowns: ["u1"] }),
    triage({
      documentType: "SUBSCRIPTION_TERMS",
      overallRisk: "HIGH",
      summary: "The risky chunk.",
      findings: [findingOf(dup), findingOf("We may change fees at any time", "INFO"), findingOf("Third clause"), findingOf("Fourth clause", "WATCH")],
      unknowns: ["u1", "u2"],
    }),
  ];

  const merged = mergeTriage(parts);
  expect(merged.overallRisk).toBe("HIGH");
  expect(merged.summary).toBe("The risky chunk.");
  expect(merged.documentType).toBe("SUBSCRIPTION_TERMS");
  expect(merged.unknowns).toEqual(["u1", "u2"]);
  // The duplicate quote collapsed, severity ranked first, capped at 3.
  expect(merged.findings.map((f) => f.quote)).toEqual([
    dup,
    "Third clause",
    "Auto-renewal continues unless disabled 30 days before",
  ]);
});

test("runLongScan scans each chunk and merges verified findings", async () => {
  const q1 = "All prepaid annual fees are non-refundable";
  const q2 = "We may change the fees at any time upon notice";
  // Two self-contained halves: the first 6,000-char window cuts at the "\n\n"
  // between them, so chunk 1 holds q1 and chunk 2 holds q2.
  const part = (quote: string, ch: string) => `${quote}. ${ch.repeat(4000)}`;
  const text = `${part(q1, "x")}\n\n${part(q2, "y")}`;

  const gen = vi.fn(async (prompt: string) => ({
    response: { text: () => triageJson(prompt.includes(q1) ? q1 : q2), inferenceSource: "on_device" },
  }));

  const r = await runLongScan(text, gen);
  expect(gen).toHaveBeenCalledTimes(2);
  expect(r.route).toBe("ON_DEVICE");
  expect(r.data.findings.map((f) => f.quote)).toEqual([q1, q2]);
  expect(r.data.findings.every((f) => f.quoteVerified)).toBe(true);
});

test("runLongScan reports IN_CLOUD if any chunk left the device", async () => {
  const q1 = "All prepaid annual fees are non-refundable";
  const q2 = "We may change the fees at any time upon notice";
  const part = (quote: string, ch: string) => `${quote}. ${ch.repeat(4000)}`;
  const text = `${part(q1, "x")}\n\n${part(q2, "y")}`;

  const gen = vi.fn(async (prompt: string) => ({
    response: {
      text: () => triageJson(prompt.includes(q1) ? q1 : q2),
      inferenceSource: prompt.includes(q1) ? "on_device" : "in_cloud",
    },
  }));

  const r = await runLongScan(text, gen);
  expect(r.route).toBe("IN_CLOUD");
});

test("runLongScan reports section progress sequentially", async () => {
  const q1 = "All prepaid annual fees are non-refundable";
  const q2 = "We may change the fees at any time upon notice";
  const part = (quote: string, ch: string) => `${quote}. ${ch.repeat(4000)}`;
  const text = `${part(q1, "x")}\n\n${part(q2, "y")}`;

  const gen = vi.fn(async (prompt: string) => ({
    response: { text: () => triageJson(prompt.includes(q1) ? q1 : q2), inferenceSource: "on_device" },
  }));
  const progress: [number, number][] = [];

  await runLongScan(text, gen, gen, (current, total) => progress.push([current, total]));
  expect(progress).toEqual([
    [1, 2],
    [2, 2],
  ]);
});
