// Side-effect import: background.js is a classic service-worker script that
// registers itself on globalThis.chrome at load.
import { expect, test, vi } from "vitest";

const onMessageListeners: Array<(message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown> = [];

(globalThis as { chrome: unknown }).chrome = {
  sidePanel: { setPanelBehavior: vi.fn() },
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: { addListener: (fn: (typeof onMessageListeners)[number]) => onMessageListeners.push(fn) },
  },
  contextMenus: { onClicked: { addListener: vi.fn() } },
};

await import("../../extension/background.js");

test("the pending-text message is answered via sendResponse", () => {
  const sendResponse = vi.fn();
  for (const listener of onMessageListeners) {
    listener({ type: "SMALLPRINT_PENDING_TEXT" }, {}, sendResponse);
  }
  expect(sendResponse).toHaveBeenCalledWith({ text: null });
});
