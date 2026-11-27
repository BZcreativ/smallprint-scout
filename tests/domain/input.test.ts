import { expect, test } from "vitest";
import { chunkText, MAX_LENGTH, prioritizeChunks, scoreChunkRiskSignals, validateInput } from "../../src/domain/input";

test("rejects input under 80 chars", () => expect(validateInput("short")).toEqual({ ok: false, message: "Paste at least 80 characters (you have 5)." }));
test("rejects input over the hard cap with its length", () =>
  expect(validateInput("a".repeat(MAX_LENGTH + 1))).toEqual({
    ok: false,
    message: `That's ${(MAX_LENGTH + 1).toLocaleString("en-GB")} characters. The limit is ${MAX_LENGTH.toLocaleString("en-GB")} — paste the sections that matter.`,
  }));
test("accepts and trims valid input", () => expect(validateInput("  " + "a".repeat(80) + " ")).toEqual({ ok: true, text: "a".repeat(80) }));
test("accepts a document longer than one prompt (it is chunked later)", () =>
  expect(validateInput("a".repeat(6001)).ok).toBe(true));

test("rejects raw PDF and binary control-character streams", () => {
  const pdf = validateInput("%PDF-1.3 % 3 0 obj << /Filter /FlateDecode >> stream x\\Ms#9rW1 " + "x".repeat(80));
  expect(pdf.ok).toBe(false);
  if (!pdf.ok) expect(pdf.message).toContain("raw PDF");

  const binary = validateInput(`Valid prefix\u0000\u0001\u0002\u0003\u0004\u0005 ${"x".repeat(80)}`);
  expect(binary.ok).toBe(false);
});

test("chunkText keeps short text whole", () => {
  const text = "a".repeat(100);
  expect(chunkText(text, 6000)).toEqual([text]);
});

test("chunkText hard-slices text with no break points", () => {
  const text = "a".repeat(15000);
  expect(chunkText(text, 6000)).toEqual(["a".repeat(6000), "a".repeat(6000), "a".repeat(3000)]);
});

test("chunkText backs up to the last paragraph break in the window", () => {
  // 5 paragraphs of 1,518 chars: the first 6,000-char window ends inside the
  // fourth paragraph, so the cut backs up to the "\n\n" before it.
  const para = (ch: string) => `${ch.repeat(1500)} End of a clause.`;
  const text = [para("a"), para("b"), para("c"), para("d"), para("e")].join("\n\n");
  expect(chunkText(text, 6000)).toEqual([
    [para("a"), para("b"), para("c")].join("\n\n"),
    [para("d"), para("e")].join("\n\n"),
  ]);
});

// --- scoreChunkRiskSignals -------------------------------------------------

test("scoreChunkRiskSignals returns 0 for text with no consumer/privacy risk signals", () => {
  expect(scoreChunkRiskSignals("")).toBe(0);
  expect(scoreChunkRiskSignals("Section 1. We thank you for reading this background clause.")).toBe(0);
});

test("scoreChunkRiskSignals counts a single risk signal", () => {
  expect(scoreChunkRiskSignals("You may cancel at any time.")).toBe(1);
});

test("scoreChunkRiskSignals is case-insensitive", () => {
  expect(scoreChunkRiskSignals("CANCEL anytime")).toBe(1);
  expect(scoreChunkRiskSignals("Non-Refundable")).toBe(scoreChunkRiskSignals("non-refundable"));
});

test("scoreChunkRiskSignals counts distinct signals, not repeated occurrences", () => {
  expect(scoreChunkRiskSignals("cancel cancel CANCEL")).toBe(1);
});

test("scoreChunkRiskSignals counts each distinct signal once", () => {
  // fee + price + refund + non-refundable + arbitrat + class action + biometric + train + third part + advertis
  const chunk =
    "A fee applies at the price listed; no refunds, non-refundable. " +
    "Disputes go to arbitration and class action is waived. " +
    "We collect biometric data and use it to train models shared with third parties for advertising.";
  expect(scoreChunkRiskSignals(chunk)).toBe(10);
});

// --- prioritizeChunks ------------------------------------------------------

test("prioritizeChunks orders a risky chunk before filler", () => {
  const filler = "Section 1. We thank you for choosing our services. This clause is general background.";
  const risky =
    "You authorise automatic renewal; cancellation requires 90 days notice; no refunds; arbitration is required.";
  const ordered = prioritizeChunks([filler, risky]);
  expect(ordered).toEqual([risky, filler]);
});

test("prioritizeChunks preserves original order on ties", () => {
  // every chunk scores 0
  expect(prioritizeChunks(["first", "second", "third"])).toEqual(["first", "second", "third"]);
  // equal non-zero scores keep original order
  expect(prioritizeChunks(["cancel", "refund"])).toEqual(["cancel", "refund"]);
});

test("prioritizeChunks sorts stably from highest score to lowest", () => {
  const filler = "plain background text";
  const oneSignal = "you may cancel";
  const twoSignals = "a fee applies and you may cancel";
  const ordered = prioritizeChunks([filler, oneSignal, twoSignals, filler]);
  expect(ordered).toEqual([twoSignals, oneSignal, filler, filler]);
});

test("prioritizeChunks returns a shallow copy and does not mutate the input", () => {
  const single = ["only one chunk"];
  const singleOut = prioritizeChunks(single);
  expect(singleOut).toEqual(single);
  expect(singleOut).not.toBe(single);

  const empty: string[] = [];
  expect(prioritizeChunks(empty)).toEqual([]);
  expect(prioritizeChunks(empty)).not.toBe(empty);

  const input = ["cancel", "plain", "a fee applies"];
  const snapshot = [...input];
  prioritizeChunks(input);
  expect(input).toEqual(snapshot);
});
