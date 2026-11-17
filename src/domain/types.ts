// The shape of one triage answer, shared by the AI schema, the JSON parser and
// the quote checker.
//
// quoteVerified and sourceVerified are set on the client after the model's
// text is matched against the original contract, so they are always present in
// a finished result (they start as false).

export interface Finding {
  category: "PRICE" | "RENEWAL" | "CANCELLATION" | "REFUND" | "RIGHTS" | "PRIVACY" | "OTHER";
  severity: "INFO" | "WATCH" | "HIGH";
  quote: string;
  plainEnglish: string;
  whyItMatters: string;
  nextStep: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  quoteVerified: boolean;
}

export interface KeyDate {
  event: string;
  dateOrTrigger: string;
  sourceQuote: string;
  sourceVerified: boolean;
}

export interface TriageResult {
  documentType: string;
  overallRisk: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  findings: Finding[];
  keyDates: KeyDate[];
  unknowns: string[];
}

export type InferenceRoute = "ON_DEVICE" | "IN_CLOUD" | "UNKNOWN";

export type JurisdictionId = "UK" | "US";

export const JURISDICTION_LABELS: Record<JurisdictionId, string> = {
  UK: "UK — Consumer Rights Act 2015 & DMCC Act 2024 (subscription rules from 1 Jan 2027)",
  US: "US — FTC Act §5, ROSCA & state auto-renewal laws",
};
