import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
} from "firebase/ai";
import { firebaseApp } from "./app";
import { triageSchema } from "../domain/schema";
import { DEFAULT_CLOUD_MODEL, getCloudModelName, initRemoteConfig } from "./remote-config";

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

// The two on-device models. They never leave the machine and do not depend on
// the cloud model name, so Remote Config never rebuilds them.
function createOnDeviceModels() {
  const local = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: textCreateOptions(),
      promptOptions: { responseConstraint },
    },
  });

  const draftLocal = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: textCreateOptions() },
  });

  return { local, draftLocal };
}

// The three models with a cloud leg. `cloudModel` is the model name the cloud
// calls use: Remote Config decides it, and the default is the fallback.
function createCloudModels(cloudModel: string) {
  const hybrid = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: {
      createOptions: textCreateOptions(),
      promptOptions: { responseConstraint },
    },
    inCloudParams: {
      model: cloudModel,
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
      model: cloudModel,
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.2 },
    },
  });

  const draftHybrid = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: textCreateOptions() },
    inCloudParams: {
      model: cloudModel,
      generationConfig: { temperature: 0.2 },
    },
  });

  return { hybrid, grounded, draftHybrid };
}

export function createModels(cloudModel: string = DEFAULT_CLOUD_MODEL) {
  return { ...createOnDeviceModels(), ...createCloudModels(cloudModel) };
}

// The models the app uses. The cloud model name comes from Remote Config,
// which needs a round trip, so the app starts on the default and the cloud
// models are rebuilt once the remote value arrives.
let activeCloudModel = getCloudModelName();

export const models = createModels(activeCloudModel);

// Rebuilds the cloud models with a new model name. The on-device models are
// left alone: they never leave the machine and the user may already have
// downloaded Gemini Nano.
export function applyCloudModel(cloudModel: string): void {
  if (!cloudModel || cloudModel === activeCloudModel) return;
  activeCloudModel = cloudModel;
  Object.assign(models, createCloudModels(cloudModel));
}

// The cloud model the app is using right now.
export function currentCloudModel(): string {
  return activeCloudModel;
}

// Remote Config is browser only, so it is only asked for in a browser. A
// failure leaves the default model in place.
if (typeof window !== "undefined") {
  void initRemoteConfig().then((cloudModel) => applyCloudModel(cloudModel));
}
