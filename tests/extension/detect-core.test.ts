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

test("linkScore ignores legal words buried in a long news-card anchor", () => {
  const card =
    "Breaking: regulators update the platform's data terms and privacy policy rules for developers, and here is what changes for you";
  expect(card.length).toBeGreaterThan(60);
  expect(core.linkScore(card, "/news/story-of-the-day")).toBe(0);
});

test("linkScore keeps scoring a short legal label", () => {
  expect(core.linkScore("Our privacy policy", "/about")).toBeGreaterThan(0);
});

test("linkScore scores the href on hostname and final path segment, never the query", () => {
  expect(
    core.linkScore("Read more", "https://example.com/news/story?topic=privacy-policy&utm_campaign=terms"),
  ).toBe(0);
  expect(
    core.linkScore("Read more", "https://example.com/legal/terms?topic=news&utm_source=feed"),
  ).toBeGreaterThan(0);
  expect(core.linkScore("Read more", "https://privacy.example.com/2026/11/18/story")).toBeGreaterThan(0);
});

test("linkScore scores French legal links", () => {
  expect(core.linkScore("Politique de confidentialité", "/politique")).toBeGreaterThan(0);
  expect(core.linkScore("Gestion des cookies", "/cookies")).toBeGreaterThan(0);
  expect(core.linkScore("Mentions légales", "/mentions-legales")).toBeGreaterThan(0);
  expect(core.linkScore("CGU", "/cgu")).toBeGreaterThan(0);
});

test("linkScore scores German and Spanish legal links", () => {
  expect(core.linkScore("Datenschutz", "/datenschutz")).toBeGreaterThan(0);
  expect(core.linkScore("Impressum", "/impressum")).toBeGreaterThan(0);
  expect(core.linkScore("Aviso legal", "/aviso-legal")).toBeGreaterThan(0);
  expect(core.linkScore("Política de privacidad", "/privacidad")).toBeGreaterThan(0);
});

test("buttonScore scores consent buttons in FR/DE/ES/IT", () => {
  expect(core.buttonScore("Accepter tout")).toBeGreaterThan(0);
  expect(core.buttonScore("Refuser tout")).toBeGreaterThan(0);
  expect(core.buttonScore("Vos paramètres de confidentialité")).toBeGreaterThan(0);
  expect(core.buttonScore("Alle akzeptieren")).toBeGreaterThan(0);
  expect(core.buttonScore("Ablehnen")).toBeGreaterThan(0);
  expect(core.buttonScore("Aceptar")).toBeGreaterThan(0);
  expect(core.buttonScore("Rechazar")).toBeGreaterThan(0);
  expect(core.buttonScore("Accettare")).toBeGreaterThan(0);
  expect(core.buttonScore("Rifiutare")).toBeGreaterThan(0);
});

test("buttonScore rejects nav and shop buttons", () => {
  expect(core.buttonScore("Menu")).toBe(0);
  expect(core.buttonScore("Search")).toBe(0);
  expect(core.buttonScore("Add to cart")).toBe(0);
});

test("buttonScore rejects long text that is not a button label", () => {
  const paragraph =
    "Nous et nos partenaires utilisons des cookies afin que vous puissiez accepter et personnaliser votre expérience.";
  expect(paragraph.length).toBeGreaterThan(60);
  expect(core.buttonScore(paragraph)).toBe(0);
});

test("frameWorthScanning lets a French consent modal through", () => {
  expect(
    core.frameWorthScanning("Votre vie privée est importante pour nous. Vos paramètres de confidentialité."),
  ).toBe(true);
  expect(core.frameWorthScanning("Wir und unsere Partner verwenden Cookies. Datenschutz-Einstellungen.")).toBe(true);
});

test("denseScore scores a Yahoo-style French consent modal", () => {
  const fr =
    "Nous utilisons des cookies pour personnaliser les contenus et mesurer l'audience. Votre vie privée est importante pour nous. Consultez notre politique de confidentialité et la politique concernant les cookies. ";
  expect(core.denseScore(fr.repeat(5))).toBe(3);
});

test("checkboxScore scores French consent context", () => {
  expect(core.checkboxScore("", "En continuant, vous acceptez nos conditions générales.")).toBe(4);
});
