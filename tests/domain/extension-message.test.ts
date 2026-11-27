import { expect, test } from "vitest";
import { acceptsMessage, acceptsPdfMessage } from "../../src/domain/extension-message";

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

test("accepts a SMALLPRINT_PDF ArrayBuffer or Uint8Array from an extension", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const fromBuf = acceptsPdfMessage({
    origin: EXTENSION_ORIGIN,
    data: { type: "SMALLPRINT_PDF", bytes: bytes.buffer, filename: "privacy.pdf" },
  });
  expect(fromBuf?.bytes).toEqual(bytes);
  expect(fromBuf?.filename).toBe("privacy.pdf");

  const fromView = acceptsPdfMessage({
    origin: EXTENSION_ORIGIN,
    data: { type: "SMALLPRINT_PDF", bytes },
  });
  expect(fromView?.bytes).toEqual(bytes);
});

test("rejects SMALLPRINT_PDF from web origins or with empty/oversized bytes", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  expect(
    acceptsPdfMessage({ origin: "https://example.com", data: { type: "SMALLPRINT_PDF", bytes: bytes.buffer } }),
  ).toBeNull();
  expect(
    acceptsPdfMessage({ origin: EXTENSION_ORIGIN, data: { type: "SMALLPRINT_PDF", bytes: new Uint8Array(0) } }),
  ).toBeNull();
});
