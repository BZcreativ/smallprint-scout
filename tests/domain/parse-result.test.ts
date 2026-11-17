import { expect, test } from "vitest";
import { parseTriage, ScanParseError } from "../../src/domain/parse-result";

test("throws ScanParseError on truncated JSON", () => expect(() => parseTriage('{"findings":[')).toThrow(ScanParseError));
test("defaults missing arrays", () => expect(parseTriage('{"documentType":"OTHER","overallRisk":"LOW","summary":"s","findings":[]}').keyDates).toEqual([]));
