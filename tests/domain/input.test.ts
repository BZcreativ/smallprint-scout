import { expect, test } from "vitest";
import { validateInput } from "../../src/domain/input";

test("rejects input under 80 chars", () => expect(validateInput("short")).toEqual({ ok: false, message: "Paste at least 80 characters (you have 5)." }));
test("rejects input over 6000 chars with its length", () => expect(validateInput("a".repeat(6001))).toEqual({ ok: false, message: "That's 6,001 characters. The limit is 6,000 — paste one section at a time." }));
test("accepts and trims valid input", () => expect(validateInput("  " + "a".repeat(80) + " ")).toEqual({ ok: true, text: "a".repeat(80) }));
