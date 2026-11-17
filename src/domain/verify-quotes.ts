import type { Finding, KeyDate, TriageResult } from "./types";

// Checks that the quotes the model claims are really in the contract.
//
// A quote counts as verified when it is long enough to be meaningful and it
// appears in the source text after normalising curly quotes, dashes and
// whitespace. The quote text itself is never changed: an unverified quote
// keeps its wording and is labelled "unverified" in the UI.

const MIN_QUOTE_LENGTH = 8;
const MAX_FINDINGS = 3;

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function isInSource(quote: string, normalizedSource: string): boolean {
  const normalized = normalizeForMatch(quote);
  return normalized.length >= MIN_QUOTE_LENGTH && normalizedSource.includes(normalized);
}

export function verifyQuotes(raw: TriageResult, source: string): TriageResult {
  const normalizedSource = normalizeForMatch(source);

  const findings: Finding[] = raw.findings.slice(0, MAX_FINDINGS).map((finding) => ({
    ...finding,
    quoteVerified: isInSource(finding.quote, normalizedSource),
  }));

  const keyDates: KeyDate[] = raw.keyDates.map((keyDate) => ({
    ...keyDate,
    sourceVerified: isInSource(keyDate.sourceQuote, normalizedSource),
  }));

  return { ...raw, findings, keyDates };
}
