import { expect, test } from "vitest";
import { buildResearchPrompt, extractGrounding } from "../../src/firebase/research";
import { JURISDICTION_LABELS } from "../../src/domain/types";

test("extractGrounding handles missing metadata", () => expect(extractGrounding({ candidates: [{}] })).toEqual({ sources: [], searchSuggestionsHtml: null }));
test("extractGrounding handles garbage", () => expect(extractGrounding(undefined)).toEqual({ sources: [], searchSuggestionsHtml: null }));
test("extracts and dedupes sources plus suggestions", () => { const g = extractGrounding({ candidates: [{ groundingMetadata: { searchEntryPoint: { renderedContent: "<div>s</div>" }, groundingChunks: [{ web: { uri: "u1", title: "gov.uk" } }, { web: { uri: "u1", title: "gov.uk" } }, { web: { uri: "u2" } }] } }] }); expect(g.sources).toEqual([{ uri: "u1", title: "gov.uk" }]); expect(g.searchSuggestionsHtml).toBe("<div>s</div>"); });
test("prompt carries jurisdiction label and in-force instruction", () => { const p = buildResearchPrompt("x", "UK"); expect(p).toContain(JURISDICTION_LABELS.UK); expect(p).toContain("not yet in force"); });
