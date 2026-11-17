import { Schema } from "firebase/ai";

// The structured-output schema from docs/spec.md §4.1. The same schema is
// used for the on-device responseConstraint and the cloud responseSchema, so
// both paths return the same JSON shape.

export const triageSchema = Schema.object({
  properties: {
    documentType: Schema.enumString({
      enum: ["SUBSCRIPTION_TERMS", "FREE_TRIAL", "PRIVACY_AI_CLAUSE", "SERVICE_AGREEMENT", "OTHER"],
    }),
    overallRisk: Schema.enumString({ enum: ["LOW", "MEDIUM", "HIGH"] }),
    summary: Schema.string({
      description: "Plain-English summary in 1-2 calm, factual sentences.",
    }),
    findings: Schema.array({
      items: Schema.object({
        properties: {
          category: Schema.enumString({
            enum: ["PRICE", "RENEWAL", "CANCELLATION", "REFUND", "RIGHTS", "PRIVACY", "OTHER"],
          }),
          severity: Schema.enumString({ enum: ["INFO", "WATCH", "HIGH"] }),
          quote: Schema.string({
            description: "Exact verbatim substring copied directly from the input text.",
          }),
          plainEnglish: Schema.string(),
          whyItMatters: Schema.string(),
          nextStep: Schema.string(),
          confidence: Schema.enumString({ enum: ["LOW", "MEDIUM", "HIGH"] }),
        },
      }),
    }),
    keyDates: Schema.array({
      items: Schema.object({
        properties: {
          event: Schema.string(),
          dateOrTrigger: Schema.string(),
          sourceQuote: Schema.string(),
        },
      }),
    }),
    unknowns: Schema.array({
      items: Schema.string({
        description: "Important consumer details missing from the text (e.g., renewal price not stated).",
      }),
    }),
  },
});
