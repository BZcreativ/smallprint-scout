import { expect, test, vi } from "vitest";

// `device.ts` imports `models.ts`, which imports the Firebase SDK. These tests
// only cover the status probe, so the models are stubbed out and the file
// stays free of Firebase.
vi.mock("../../src/firebase/models", () => ({
  models: {
    local: { initializeDeviceModel: vi.fn() },
    hybrid: { initializeDeviceModel: vi.fn() },
  },
}));

import { getDeviceStatus } from "../../src/firebase/device";

test("unsupported when LanguageModel is undefined", async () => expect(await getDeviceStatus(undefined)).toBe("unsupported"));
test("unsupported when availability throws", async () => expect(await getDeviceStatus({ availability: () => Promise.reject(new Error()) })).toBe("unsupported"));
test("unavailable maps to unsupported", async () => expect(await getDeviceStatus({ availability: async () => "unavailable" })).toBe("unsupported"));
test("passes through available", async () => expect(await getDeviceStatus({ availability: async () => "available" })).toBe("available"));
