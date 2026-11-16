// What we store in Firestore after a scan: labels and counts only.
// Never the contract text, quotes, or anything typed by the user (privacy promise).
// Must stay in sync with isValidScan() in firestore.rules.

export const DOCUMENT_TYPES = ["SUBSCRIPTION_TERMS", "FREE_TRIAL", "PRIVACY_AI_CLAUSE", "SERVICE_AGREEMENT", "OTHER"] as const;
export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const CATEGORIES = ["PRICE", "RENEWAL", "CANCELLATION", "REFUND", "RIGHTS", "PRIVACY", "OTHER"] as const;
export const ROUTES = ["ON_DEVICE", "IN_CLOUD", "UNKNOWN"] as const;
export const MAX_FINDINGS = 3;

export type ScanSummary = {
  documentType: (typeof DOCUMENT_TYPES)[number];
  overallRisk: (typeof RISK_LEVELS)[number];
  categories: (typeof CATEGORIES)[number][];
  findingCount: number;
  route: (typeof ROUTES)[number];
};

/** Builds a summary the security rules will accept: unique categories, finding count capped at 3. */
export function toScanSummary(input: {
  documentType: ScanSummary["documentType"];
  overallRisk: ScanSummary["overallRisk"];
  findingCategories: ScanSummary["categories"];
  route: ScanSummary["route"];
}): ScanSummary {
  const shown = input.findingCategories.slice(0, MAX_FINDINGS);
  return {
    documentType: input.documentType,
    overallRisk: input.overallRisk,
    categories: [...new Set(shown)],
    findingCount: shown.length,
    route: input.route,
  };
}
