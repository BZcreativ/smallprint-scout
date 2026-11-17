import type { Finding, KeyDate, TriageResult } from "./types";

// Turns the model's JSON answer into a finished triage result.
//
// The schema the model answers with does not carry the verification flags, so
// every quote starts out unverified here. `verifyQuotes` sets them afterwards,
// by matching the quotes against the original contract text.

export class ScanParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanParseError";
  }
}

export function parseTriage(text: string): TriageResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ScanParseError("The model's answer was not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ScanParseError("The model's answer was not a triage object.");
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.findings)) {
    throw new ScanParseError("The model's answer had no findings array.");
  }

  return {
    documentType: asString(record.documentType) ?? "OTHER",
    overallRisk: asRisk(record.overallRisk),
    summary: asString(record.summary) ?? "",
    findings: record.findings.map(toFinding),
    // The schema asks for both arrays, but a model that skips one should not
    // cost the user the whole scan.
    keyDates: asArray(record.keyDates).map(toKeyDate),
    unknowns: asArray(record.unknowns).filter((value): value is string => typeof value === "string"),
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// An unreadable risk level is not good news, so it falls back to the middle
// rather than to LOW.
function asRisk(value: unknown): TriageResult["overallRisk"] {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" ? value : "MEDIUM";
}

function toFinding(raw: unknown): Finding {
  const record = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Finding>;
  return {
    category: record.category ?? "OTHER",
    severity: record.severity ?? "INFO",
    quote: asString(record.quote) ?? "",
    plainEnglish: asString(record.plainEnglish) ?? "",
    whyItMatters: asString(record.whyItMatters) ?? "",
    nextStep: asString(record.nextStep) ?? "",
    confidence: record.confidence ?? "LOW",
    // The raw schema does not produce this flag. The quote checker sets it.
    quoteVerified: false,
  };
}

function toKeyDate(raw: unknown): KeyDate {
  const record = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<KeyDate>;
  return {
    event: asString(record.event) ?? "",
    dateOrTrigger: asString(record.dateOrTrigger) ?? "",
    sourceQuote: asString(record.sourceQuote) ?? "",
    // As with findings, the source checker sets this one.
    sourceVerified: false,
  };
}
