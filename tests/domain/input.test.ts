import { expect, test } from "vitest";
import { chunkText, MAX_LENGTH, validateInput } from "../../src/domain/input";

test("rejects input under 80 chars", () => expect(validateInput("short")).toEqual({ ok: false, message: "Paste at least 80 characters (you have 5)." }));
test("rejects input over the hard cap with its length", () =>
  expect(validateInput("a".repeat(MAX_LENGTH + 1))).toEqual({
    ok: false,
    message: `That's ${(MAX_LENGTH + 1).toLocaleString("en-GB")} characters. The limit is ${MAX_LENGTH.toLocaleString("en-GB")} — paste the sections that matter.`,
  }));
test("accepts and trims valid input", () => expect(validateInput("  " + "a".repeat(80) + " ")).toEqual({ ok: true, text: "a".repeat(80) }));
test("accepts a document longer than one prompt (it is chunked later)", () =>
  expect(validateInput("a".repeat(6001)).ok).toBe(true));

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
