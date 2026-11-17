import { expect, test, vi } from "vitest";

// `remote-config.ts` imports `app.ts`, which needs a real API key to build
// the auth client. The app is stubbed out here: the Remote Config SDK is
// browser only anyway, so the tests are about the fallback.
vi.mock("../../src/firebase/app", () => ({
  firebaseApp: { name: "smallprint-scout", options: {} },
}));

import { DEFAULT_CLOUD_MODEL, getCloudModelName, initRemoteConfig } from "../../src/firebase/remote-config";

// The app has to keep working on the default model when Remote Config cannot
// answer: offline, blocked, or in the tests.

test("falls back to the default model when Remote Config is unavailable", () => {
  expect(getCloudModelName()).toBe(DEFAULT_CLOUD_MODEL);
});

test("initRemoteConfig reports the default model instead of throwing", async () => {
  await expect(initRemoteConfig()).resolves.toBe(DEFAULT_CLOUD_MODEL);
});

test("the default model is the one in the plan", () => {
  expect(DEFAULT_CLOUD_MODEL).toBe("gemini-3.8-flash");
});
