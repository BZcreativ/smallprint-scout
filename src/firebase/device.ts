import { models } from "./models";

// The on-device model status, and the gesture-driven download.
//
// The judge may be on a browser without Gemini Nano at all (the flag is off,
// the wrong OS, the wrong browser). The app has to say so and offer the
// redacted cloud scan instead of throwing.

export type DeviceStatus = "unsupported" | "downloadable" | "downloading" | "available";

// `LanguageModel` is declared with `const` in `src/types/prompt-api.d.ts`, and
// TypeScript only puts `var` and `function` globals on the `globalThis` type.
// This small view of the global object reaches it anyway.
const globalScope = globalThis as typeof globalThis & {
  LanguageModel?: typeof LanguageModel;
};

const LANGUAGE_OPTIONS = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

export async function getDeviceStatus(
  lm: typeof LanguageModel = globalScope.LanguageModel,
): Promise<DeviceStatus> {
  if (!lm) return "unsupported";
  try {
    const status = await lm.availability(LANGUAGE_OPTIONS);
    if (status === "unavailable") return "unsupported";
    return status;
  } catch {
    // `availability()` throws when the Prompt API is present but blocked, for
    // example by a policy or an unsupported device.
    return "unsupported";
  }
}

export async function initDeviceModel(onProgress: (pct: number) => void): Promise<void> {
  const cb = (v: number) => onProgress(Math.round(v * 100));
  // Both downloads are started synchronously, before the first `await`, so
  // Chrome still sees the user's click activation when the Prompt API is
  // called. Awaiting here first would lose that activation.
  const local = models.local.initializeDeviceModel(cb);
  const hybrid = models.hybrid.initializeDeviceModel(cb);
  await Promise.all([local, hybrid]);
}
