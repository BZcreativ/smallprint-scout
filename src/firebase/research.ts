import { JURISDICTION_LABELS, type JurisdictionId } from "../domain/types";
import type { GenerateFn } from "./scan";

// The grounded research pass: the one call that leaves the device on purpose.
//
// The caller has already redacted the text and the user has approved the exact
// payload, so this module never touches raw text. It also never trusts the
// grounding metadata: the model may answer without searching at all (amendment
// A2), so a missing or malformed `groundingMetadata` is "no sources", not an
// error (amendment A3).

export interface Grounding {
  sources: { title: string; uri: string }[];
  searchSuggestionsHtml: string | null;
}

const NO_GROUNDING: Grounding = { sources: [], searchSuggestionsHtml: null };

// The model's answer is untrusted JSON-shaped data, so every step is a guarded
// read: an absent object, a missing array, or a non-string field all fall back
// to "no sources" instead of throwing inside the results screen.
function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function extractGrounding(response: unknown): Grounding {
  try {
    const candidate = (field(response, "candidates") as unknown[] | undefined)?.[0];
    const metadata = field(candidate, "groundingMetadata");
    const entryPoint = field(metadata, "searchEntryPoint");
    const suggestions = field(entryPoint, "renderedContent");
    const chunks = field(metadata, "groundingChunks");

    const sources: Grounding["sources"] = [];
    const seen = new Set<string>();
    for (const chunk of Array.isArray(chunks) ? chunks : []) {
      const web = field(chunk, "web");
      const uri = nonEmptyString(field(web, "uri"));
      const title = nonEmptyString(field(web, "title"));
      // A chunk without both halves is not a citable source, and the same
      // page is often cited twice for two sentences.
      if (!uri || !title || seen.has(uri)) continue;
      seen.add(uri);
      sources.push({ uri, title });
    }

    return {
      sources,
      searchSuggestionsHtml: typeof suggestions === "string" ? suggestions : null,
    };
  } catch {
    return { ...NO_GROUNDING };
  }
}

export function buildResearchPrompt(redactedText: string, j: JurisdictionId): string {
  const label = JURISDICTION_LABELS[j];

  return `
Jurisdiction selected by user: ${label}

Review the following redacted consumer agreement excerpt using Google Search grounding.
Structure your response with these exact Markdown sections:
1. **What the Clause Requires**: Factual summary of the obligations in the excerpt.
2. **Relevant Consumer Protection Guidance (${label})**: How official legislation or regulator guidance (such as CMA/Gov.uk in the UK or FTC in the US) treats automatic renewals, hidden fees, unfair cancellation hurdles, or broad data/AI licences.
3. **What We Cannot Determine (Missing Facts)**: Facts not present in the excerpt that could affect how rules apply.
4. **Questions to Ask Before Agreeing**: 2-3 specific questions the consumer should verify.

Prefer official sources (legislation.gov.uk, gov.uk, CMA, ftc.gov, state AG sites). If a rule is not yet in force, say so and give its start date.

Use cautious, non-definitive language ("may raise fairness concerns under...", "regulator guidance states..."). Do not provide formal legal advice.

--- REDACTED EXCERPT ---
${redactedText}
`.trim();
}

export interface CloudResearch {
  markdown: string;
  grounding: Grounding;
  jurisdiction: JurisdictionId;
}

export async function runCloudLegalResearch(
  redactedText: string,
  j: JurisdictionId,
  generate: GenerateFn,
): Promise<CloudResearch> {
  const res = await generate(buildResearchPrompt(redactedText, j));

  return {
    markdown: res.response.text(),
    // The metadata lives on the raw response, beside the text, not inside it.
    grounding: extractGrounding(res.response),
    jurisdiction: j,
  };
}
