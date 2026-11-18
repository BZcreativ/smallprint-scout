// Side-effect import: detect-core.js is a classic browser script that sets
// globalThis.ScoutDetect (content scripts cannot be ES modules).
import { expect, test } from "vitest";
import "../../extension/detect-core.js";

const core = (globalThis as { ScoutDetect: any }).ScoutDetect;

function legalProse(sentences: number): string {
  return "The Provider agrees to the terms of this policy. ".repeat(sentences);
}

test("linkScore ranks a visible legal label above a bare href match", () => {
  expect(core.linkScore("Terms of Service", "/legal/terms")).toBeGreaterThan(
    core.linkScore("", "/legal/terms"),
  );
});

test("linkScore scores a bare href match", () => {
  expect(core.linkScore("Read more", "/privacy-policy")).toBeGreaterThan(0);
});

test("linkScore rejects links with no legal keyword", () => {
  expect(core.linkScore("About us", "/about")).toBe(0);
});

test("linkScore does not match tos inside another word", () => {
  expect(core.linkScore("Our photos", "/gallery/photos")).toBe(0);
});

test("checkboxScore ranks a consent label at 5", () => {
  expect(core.checkboxScore("I agree to the terms", "")).toBe(5);
});

test("checkboxScore scores consent language in the surrounding text", () => {
  expect(core.checkboxScore("", "Please acknowledge the risks before continuing.")).toBe(4);
});

test("checkboxScore scores a By clicking ... you agree block higher", () => {
  expect(
    core.checkboxScore("", "By clicking Sign Up, you agree to the Terms of Service."),
  ).toBeGreaterThan(core.checkboxScore("", "Please acknowledge the risks."));
});

test("checkboxScore rejects a checkbox with no consent language", () => {
  expect(core.checkboxScore("Send me newsletters", "Subscribe to our newsletter.")).toBe(0);
});

test("denseScore scores long legal prose with real sentences", () => {
  expect(core.denseScore(legalProse(60))).toBe(3);
});

test("denseScore rejects text at or under 800 characters", () => {
  expect(core.denseScore(legalProse(17).slice(0, 800))).toBe(0);
  expect(core.denseScore(legalProse(17))).toBe(3);
});

test("denseScore rejects long text about something else", () => {
  expect(core.denseScore("Pizza with fresh tomatoes and basil. ".repeat(40))).toBe(0);
});

test("denseScore rejects long keyword text with no sentence structure", () => {
  expect(core.denseScore("Terms Privacy Legal Agreement Refund ".repeat(40))).toBe(0);
});

test("frameWorthScanning lets a frame through when legal words appear early", () => {
  expect(core.frameWorthScanning("Welcome! Please review our Terms and Privacy Policy.")).toBe(true);
});

test("frameWorthScanning stops frames with no legal or consent words", () => {
  expect(core.frameWorthScanning("Watch the match highlights from last night.")).toBe(false);
  expect(core.frameWorthScanning("")).toBe(false);
});
