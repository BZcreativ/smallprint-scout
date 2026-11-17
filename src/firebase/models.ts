import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
} from "firebase/ai";
import { firebaseApp } from "./app";
import { triageSchema } from "../domain/schema";

// The five models the app uses, one per inference path (docs/spec.md §4.3).
//
//   local      ONLY_ON_DEVICE, structured output, never leaves the machine
//   hybrid     PREFER_ON_DEVICE, same structured output, cloud fallback
//   grounded   ONLY_IN_CLOUD + Google Search, for the consented research pass
//   draftLocal / draftHybrid  the same two routes with no schema, for the
//                              plain-text action drafts
//
// No model carries a `systemInstruction`: the triage prompt is prepended to
// the prompt text instead, so the on-device and cloud paths see the same
// instructions (amendment A7).

const CLOUD_MODEL = "gemini-3.8-flash";

// `Schema#toJSON` is stripped from the public types, so serialise through
// JSON.stringify, which calls it at runtime and yields the plain JSON schema
// the Prompt API expects for `responseConstraint`.
const responseConstraint = JSON.parse(JSON.stringify(triageSchema)) as object;

const ai = getAI(firebaseApp, {
  backend: new GoogleAIBackend(),
  useLimitedUseAppCheckTokens: true,
});

// The Prompt API's create options: English text in, English text out.
function textCreateOptions() {
  return {
    expectedInputs: [{ type: "text" as const, languages: ["en"] }],
    expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
  };
}

export function createModels() {
  const local = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: textCreateOptions(),
      promptOptions: { responseConstraint },
    },
  });

  const hybrid = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: {
      createOptions: textCreateOptions(),
      promptOptions: { responseConstraint },
    },
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: triageSchema,
        temperature: 0.1,
      },
    },
  });

  const grounded = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.2 },
    },
  });

  const draftLocal = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: textCreateOptions() },
  });

  const draftHybrid = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: textCreateOptions() },
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: { temperature: 0.2 },
    },
  });

  return { local, hybrid, grounded, draftLocal, draftHybrid };
}

export const models = createModels();
