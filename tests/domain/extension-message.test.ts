import { expect, test } from "vitest";
import { acceptsMessage } from "../../src/domain/extension-message";

// The Chrome extension pushes page text into the app with postMessage. Only a
// message from another extension may set the input, so the origin and the
// payload shape are both checked before anything is read.

const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnop";

test("accepts a smallprint text message from an extension", () => {
  expect(
    acceptsMessage({
      origin: EXTENSION_ORIGIN,
      data: { type: "SMALLPRINT_TEXT", text: "You agree to pay £240 a year." },
    }),
  ).toBe("You agree to pay £240 a year.");
});

test("rejects a message from a web page", () => {
  expect(
    acceptsMessage({
      origin: "https://example.com",
      data: { type: "SMALLPRINT_TEXT", text: "You agree to pay £240 a year." },
    }),
  ).toBeNull();
});

test("rejects a message with the wrong type", () => {
  expect(
    acceptsMessage({ origin: EXTENSION_ORIGIN, data: { type: "SOMETHING_ELSE", text: "hello" } }),
  ).toBeNull();
});

test("rejects a message whose text is not a string", () => {
  expect(
    acceptsMessage({ origin: EXTENSION_ORIGIN, data: { type: "SMALLPRINT_TEXT", text: 42 } }),
  ).toBeNull();
});

test("rejects a message with no data", () => {
  expect(acceptsMessage({ origin: EXTENSION_ORIGIN, data: null })).toBeNull();
});
