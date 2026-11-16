import { expect, test } from "vitest";
import { toScanSummary } from "../../src/domain/scan-summary";

test("dedupes categories and caps findings at 3", () => {
  expect(
    toScanSummary({ documentType: "FREE_TRIAL", overallRisk: "HIGH", findingCategories: ["RENEWAL", "RENEWAL", "PRICE", "REFUND"], route: "ON_DEVICE" }),
  ).toEqual({ documentType: "FREE_TRIAL", overallRisk: "HIGH", categories: ["RENEWAL", "PRICE"], findingCount: 3, route: "ON_DEVICE" });
});

test("no findings gives an empty list", () => {
  const s = toScanSummary({ documentType: "OTHER", overallRisk: "LOW", findingCategories: [], route: "UNKNOWN" });
  expect(s.categories).toEqual([]);
  expect(s.findingCount).toBe(0);
});

test("summary carries no free-text fields", () => {
  const s = toScanSummary({ documentType: "OTHER", overallRisk: "LOW", findingCategories: ["PRIVACY"], route: "IN_CLOUD" });
  expect(Object.keys(s).sort()).toEqual(["categories", "documentType", "findingCount", "overallRisk", "route"]);
});
