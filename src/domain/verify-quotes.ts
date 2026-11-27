import type { Finding, KeyDate, TriageResult } from "./types";

// Checks that the quotes the model claims are really in the contract.
//
// A quote counts as verified when it is long enough to be meaningful and it
// appears in the source text after normalising curly quotes, dashes and
// whitespace. The quote text itself is never changed: an unverified quote
// keeps its wording and is labelled "unverified" in the UI.

const MIN_QUOTE_LENGTH = 8;
export const MAX_FINDINGS = 3;

function normalizePunctuation(ch: string): string {
  return ch
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-");
}

// The one normalization pass shared by normalizeForMatch and findQuoteRange:
// lowercases, straightens quotes and dashes, and collapses runs of whitespace
// to a single space, recording for every output character the offset of the
// source character it came from.
function normalizeWithMap(s: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let i = 0;
  while (i < s.length) {
    const codePoint = s.codePointAt(i)!;
    const offset = i;
    i += codePoint > 0xffff ? 2 : 1;
    for (const out of normalizePunctuation(String.fromCodePoint(codePoint)).toLowerCase()) {
      if (/\s/.test(out) && text.endsWith(" ")) continue;
      const c = /\s/.test(out) ? " " : out;
      text += c;
      map.push(offset);
    }
  }
  return { text, map };
}

export function normalizeForMatch(s: string): string {
  return normalizeWithMap(s).text.trim();
}

// Character offsets of `quote` inside `source`, in the original (not
// normalized) text, or null when the quote is missing, too short, or only a
// paraphrase. What the two share is the normalized form, so a match found in
// normalized text is mapped back through the per-character offset map.
export function findQuoteRange(source: string, quote: string): { start: number; end: number } | null {
  const target = normalizeForMatch(quote);
  if (target.length < MIN_QUOTE_LENGTH) return null;
  const { text, map } = normalizeWithMap(source);
  const at = text.indexOf(target);
  if (at === -1) return null;
  return { start: map[at], end: map[at + target.length - 1] + 1 };
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
