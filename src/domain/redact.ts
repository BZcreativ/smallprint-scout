// Masks personal data the user typed before any of it leaves the device.
//
// The rules are deliberately narrow. They only remove things that cannot be part
// of a contract term: emails, card numbers, labelled account numbers, phone
// numbers, postcodes and names introduced by a label. Bare numbers, prices and
// plan names stay put, because a redacted agreement that no longer says what it
// costs is useless.
//
// Order matters: cards before phones, labelled IDs before phones. No rule uses the
// `i` flag, because the case-insensitive ID rule masked ordinary words such as
// "Account Settings".

const RULES: [RegExp, string][] = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]"],
  [/\b(?:\d[ -]?){12,15}\d\b/g, "[REDACTED_CARD]"],
  [/(\b(?:[Aa]ccount|[Mm]ember(?:ship)?|[Cc]ustomer|[Pp]olicy|[Rr]ef(?:erence)?)\s*(?:[Nn]o\.?|[Nn]umber|ID|#)?\s*[:=#-]?\s*)(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,}\b/g, "$1[REDACTED_ID]"],
  [/(?:\+44\s?|\b0)\d(?:[\s-]?\d){8,9}\b/g, "[REDACTED_PHONE]"],
  [/(?:\+1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g, "[REDACTED_PHONE]"],
  [/\b(?:[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|\d{5}-\d{4})\b/g, "[REDACTED_POSTCODE]"],
  [/(\b(?:Dear|Member Name|Customer Name|Account Holder|Signed by|Prepared for)\s*[:=-]?\s*)[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g, "$1[REDACTED_NAME]"],
];

export function redact(input: string): { redactedText: string; replacementsCount: number } {
  let redactedText = input;
  let replacementsCount = 0;

  for (const [pattern, placeholder] of RULES) {
    const matches = redactedText.match(pattern);
    if (!matches) continue;

    replacementsCount += matches.length;
    redactedText = redactedText.replace(pattern, placeholder);
  }

  return { redactedText, replacementsCount };
}
