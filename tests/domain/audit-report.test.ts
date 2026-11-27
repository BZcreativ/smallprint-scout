import { expect, test } from "vitest";
import { formatAuditReport } from "../../src/domain/audit-report";
import type { ScanEnvelope } from "../../src/firebase/scan";
import type { TriageResult } from "../../src/domain/types";

const triage: TriageResult = {
  documentType: "SUBSCRIPTION_TERMS",
  overallRisk: "HIGH",
  summary: "Auto-renewal with no refund path.",
  findings: [
    {
      category: "REFUND",
      severity: "HIGH",
      quote: "no prorated credits will be issued",
      plainEnglish: "You lose the unused months.",
      whyItMatters: "Real money lost on cancellation.",
      nextStep: "Ask for a pro-rata refund in writing.",
      confidence: "HIGH",
      quoteVerified: true,
    },
    {
      category: "RENEWAL",
      severity: "WATCH",
      quote: "this clause is not in the document",
      plainEnglish: "Renews automatically.",
      whyItMatters: "",
      nextStep: "",
      confidence: "MEDIUM",
      quoteVerified: false,
    },
  ],
  keyDates: [{ event: "Renewal", dateOrTrigger: "1 Jan each year", sourceQuote: "renews automatically", sourceVerified: true }],
  unknowns: ["The cancellation notice period."],
};
const scan: ScanEnvelope = { data: triage, route: "ON_DEVICE", durationMs: 1234 };

test("header carries risk, document type, route, character count and duration", () => {
  const report = formatAuditReport(scan, 4120);
  expect(report).toContain("# Audit report");
  expect(report).toContain("**Risk level:** HIGH");
  expect(report).toContain("**Document type:** SUBSCRIPTION_TERMS");
  expect(report).toContain("**Route:** ON_DEVICE");
  expect(report).toContain("4,120 characters");
  expect(report).toContain("1,234 ms");
});

test("numbers findings with verified and unverified quote tags", () => {
  const report = formatAuditReport(scan, 100);
  expect(report).toContain("## Findings");
  expect(report).toContain("1. **REFUND — HIGH**");
  expect(report).toContain("2. **RENEWAL — WATCH**");
  expect(report).toContain("> no prorated credits will be issued (verified)");
  expect(report).toContain("> this clause is not in the document (unverified — check the original)");
  expect(report).toContain("Why it matters: Real money lost on cancellation.");
  expect(report).toContain("What to do: Ask for a pro-rata refund in writing.");
});

test("includes key dates, unknowns and the disclaimer footer", () => {
  const report = formatAuditReport(scan, 100);
  expect(report).toContain("## Key dates");
  expect(report).toContain("- **Renewal** — 1 Jan each year: renews automatically (verified)");
  expect(report).toContain("## Unknowns");
  expect(report).toContain("- The cancellation notice period.");
  expect(report.trimEnd().endsWith("Not legal advice. Check the original document and official guidance.")).toBe(true);
});

test("skips empty key dates and unknowns sections", () => {
  const empty: ScanEnvelope = { data: { ...triage, keyDates: [], unknowns: [] }, route: "IN_CLOUD", durationMs: 0 };
  const report = formatAuditReport(empty, 10);
  expect(report).not.toContain("## Key dates");
  expect(report).not.toContain("## Unknowns");
});

test("a scan with no findings still renders a valid report", () => {
  const none: ScanEnvelope = { data: { ...triage, findings: [] }, route: "UNKNOWN", durationMs: 5 };
  const report = formatAuditReport(none, 10);
  expect(report).toContain("No findings.");
});
