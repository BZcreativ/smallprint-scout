import { expect, test } from "vitest";
import { buildDraftPrompt } from "../../src/domain/drafts";
import type { Finding } from "../../src/domain/types";

const finding = (quote: string, quoteVerified: boolean) => ({ category: "CANCELLATION", severity: "HIGH", quote, plainEnglish: "", whyItMatters: "", nextStep: "", confidence: "HIGH", quoteVerified }) as Finding;

const verifiedFinding = finding("Cancel in writing at least 7 full business days before the 14th day.", true);
const unverifiedFinding = finding("Cancellation requires a recorded delivery form.", false);

test("cancel prompt includes verified quote verbatim", () => expect(buildDraftPrompt("CANCEL", [verifiedFinding])).toContain(verifiedFinding.quote));
test("unverified finding is hedged", () => expect(buildDraftPrompt("CLARIFY", [unverifiedFinding])).toContain("the terms appear to say"));
test("prompt requests placeholders not real names", () => expect(buildDraftPrompt("NEGOTIATE", [])).toContain("[YOUR NAME]"));
