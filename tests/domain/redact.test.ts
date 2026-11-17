import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { redact } from "../../src/domain/redact";

const cases: [string, string][] = [
  ["unless auto-renewal is disabled in Account Settings at least 30 days", "unchanged"],
  ["is strictly non-refundable under all circumstances", "unchanged"],
  ["Contact our customer service team or member services", "unchanged"],
  ["Call 020 7946 0958 or 0161 496 0000 or +44 20 7946 0958", "Call [REDACTED_PHONE] or [REDACTED_PHONE] or [REDACTED_PHONE]"],
  ["US: (555) 123-4567 or 555-123-4567", "US: [REDACTED_PHONE] or [REDACTED_PHONE]"],
  ["Mobile 07700 900123", "Mobile [REDACTED_PHONE]"],
  ["Card 4111 1111 1111 1111 expires 09/28", "Card [REDACTED_CARD] expires 09/28"],
  ["Dear Alex Smith, your Account No: AB12345", "Dear [REDACTED_NAME], your Account No: [REDACTED_ID]"],
  ["Signed by: Jo Bloggs. Membership #: 99881234", "Signed by: [REDACTED_NAME]. Membership #: [REDACTED_ID]"],
  ["Postcode SW1A 1AA", "Postcode [REDACTED_POSTCODE]"],
  ["Email jo.bloggs@example.co.uk now", "Email [REDACTED_EMAIL] now"],
];

test.each(cases)("redacts %s", (input, expected) => {
  const want = expected === "unchanged" ? input : expected;
  const result = redact(input);

  expect(result.redactedText).toBe(want);
  expect(result.replacementsCount).toBe(want.match(/\[REDACTED_/g)?.length ?? 0);
});

test("leaves all three seeded samples unchanged", () => {
  for (const name of ["gym-membership", "subscription-renewal", "privacy-ai-terms"]) {
    const original = readFileSync(`public/samples/${name}.txt`, "utf8");
    const result = redact(original);

    expect(result.replacementsCount).toBe(0);
    expect(result.redactedText).toBe(original);
  }
});
