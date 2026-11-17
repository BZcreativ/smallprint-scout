import { expect, test } from "vitest";
import { parseTriage, ScanParseError } from "../../src/domain/parse-result";

test("throws ScanParseError on truncated JSON", () => expect(() => parseTriage('{"findings":[')).toThrow(ScanParseError));
test("defaults missing arrays", () => expect(parseTriage('{"documentType":"OTHER","overallRisk":"LOW","summary":"s","findings":[]}').keyDates).toEqual([]));

test("salvages output cut mid-string by the output-token cap", () => {
  const truncated =
    '{"documentType":"SUBSCRIPTION_TERMS","overallRisk":"HIGH","summary":"The plan renews at a higher price.","findings":[' +
    '{"category":"RENEWAL","severity":"HIGH","quote":"will automatically renew","plainEnglish":"It renews by itself.","whyItMatters":"You keep paying.","nextStep":"Turn off auto-renewal.","confidence":"HIGH"},' +
    '{"category":"REFUND","severity":"HIGH","quote":"non-refun';
  const r = parseTriage(truncated);
  expect(r.findings).toHaveLength(2);
  expect(r.findings[0].plainEnglish).toBe("It renews by itself.");
  expect(r.findings[1].quote).toBe("non-refun");
});

test("closes a cut before any brace could close", () => {
  const r = parseTriage('{"findings":[{"category":"PRICE","severity":"HIGH","quote":"$9.99 a month and');
  expect(r.findings).toHaveLength(1);
  expect(r.findings[0].quote).toBe("$9.99 a month and");
});

test("salvages JSON wrapped in prose and a code fence", () => {
  const wrapped =
    'Here is the triage:\n```json\n{"documentType":"OTHER","overallRisk":"LOW","summary":"s",' +
    '"findings":[{"category":"PRICE","severity":"INFO","quote":"$9.99"}]}\n```\nHope that helps.';
  expect(parseTriage(wrapped).findings[0].category).toBe("PRICE");
});

test("throws when salvage has no surviving finding", () =>
  expect(() => parseTriage('{"documentType":"OTHER","summary":"The plan rene')).toThrow(ScanParseError));

test("detects Chromium LanguageModel echo stub without ScanParseError", () => {
  expect(() =>
    parseTriage("On-device model is not available in Chromium, this API is just echoing back the input: hello"),
  ).toThrow(/Google Chrome 139\+/);
});
