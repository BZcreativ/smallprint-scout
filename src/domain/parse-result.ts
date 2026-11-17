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
  const cleaned = stripCodeFence(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = salvage(cleaned);
    if (parsed === undefined) {
      const preview = cleaned.replace(/\s+/g, " ").slice(0, 120);
      throw new ScanParseError(`The model's answer was not valid JSON. Got: ${preview || "<empty>"}`);
    }
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
    // Rule 1 of the prompt: every finding carries an exact quote. A finding
    // without one is not actionable, so it is dropped rather than shown.
    findings: record.findings.map(toFinding).filter((f) => f.quote.trim() !== ""),
    // The schema asks for both arrays, but a model that skips one should not
    // cost the user the whole scan.
    keyDates: asArray(record.keyDates).map(toKeyDate),
    unknowns: asArray(record.unknowns).filter((value): value is string => typeof value === "string"),
  };
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

// A model that hits its output-token cap (Gemini Nano's is small) cuts the
// JSON mid-string; one that ignores the schema wraps it in prose or a code
// fence. Salvage extracts the JSON payload, drops the incomplete tail and
// closes the open brackets — but only when at least one finding survived,
// so a nuked answer still surfaces as a retry, never as an empty scan.
function salvage(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  const cut = text.slice(start);
  const end = cut.lastIndexOf("}");
  // 1. The complete object possibly wrapped in prose. 2. The raw tail. 3. The
  // tail with the cut repaired. An earlier complete finding beats a repaired
  // partial one, so the attempts run in that order.
  const candidates = [cut.slice(0, end > -1 ? end + 1 : undefined), cut, closeTruncated(cut)];
  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed === null || typeof parsed !== "object") continue;
    const record = parsed as Record<string, unknown>;
    const findings = Array.isArray(record.findings) ? record.findings : [];
    const hasUsableFinding = findings.some((f) => {
      const quote = typeof f === "object" && f !== null ? (f as { quote?: unknown }).quote : undefined;
      return typeof quote === "string" && quote.trim() !== "";
    });
    if (hasUsableFinding) return record;
  }
  return undefined;
}

function tryParse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

// Closes JSON that was cut off mid-generation: walk the text tracking string
// state and bracket depth, drop whatever fragment the cut left dangling, then
// append the missing closers.
function closeTruncated(src: string): string {
  const closers: string[] = [];
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  let stringWasValue = false;
  let lastSignificant = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') {
        inString = false;
        lastSignificant = '"';
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      stringStart = i;
      stringWasValue = lastSignificant === ":";
      continue;
    }
    if (ch === "{") closers.push("}");
    else if (ch === "[") closers.push("]");
    else if (ch === "}" || ch === "]") closers.pop();
    if (!/\s/.test(ch)) lastSignificant = ch;
  }
  // A cut value string keeps its content (the quote is the product), a cut
  // key string is dropped together with its dangling colon.
  let out = src;
  if (inString) {
    const base = escaped ? src.slice(0, -1) : src;
    out = stringWasValue ? `${base}"` : base.slice(0, stringStart);
  }
  out = out.trimEnd().replace(/"(?:[^"\\]|\\.)*"\s*:\s*$/, "").replace(/[,:\s]+$/, "").trimEnd();
  return out + closers.reverse().join("");
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
