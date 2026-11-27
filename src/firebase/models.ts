import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  ThinkingLevel,
} from "firebase/ai";
import { firebaseApp } from "./app";
import { triageSchema } from "../domain/schema";
import { DEFAULT_CLOUD_MODEL, getCloudModelName, initRemoteConfig } from "./remote-config";
export { CLOUD_TIMEOUT_MS, PRIMARY_CLOUD_TIMEOUT_MS, isTransientCloudError, timed, withCloudFallback } from "./cloud-fallback";

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

// `Schema#toJSON` is stripped from the public types and includes OpenAPI-only
// `nullable` and verbose `description` properties that inflate Chrome's Prompt
// API token usage and can trigger `QuotaExceededError: The input is too large.`
function toJsonSchemaConstraint(schema: unknown): object {
  const raw = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  function stripMeta(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(stripMeta);
    if (typeof node === "object" && node !== null) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "nullable" || k === "description") continue;
        out[k] = stripMeta(v);
      }
      return out;
    }
    return node;
  }
  return stripMeta(raw) as object;
}

const responseConstraint = toJsonSchemaConstraint(triageSchema);

// Slim on-device schema (Task 1 Gate fallback: drops `confidence` and `keyDates`
// when Chrome's 1,024-token on-device context window rejects the full schema).
export const slimResponseConstraint = {
  type: "object",
  properties: {
    documentType: {
      type: "string",
      enum: ["SUBSCRIPTION_TERMS", "FREE_TRIAL", "PRIVACY_AI_CLAUSE", "SERVICE_AGREEMENT", "OTHER"],
    },
    overallRisk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["PRICE", "RENEWAL", "CANCELLATION", "REFUND", "RIGHTS", "PRIVACY", "OTHER"],
          },
          severity: { type: "string", enum: ["INFO", "WATCH", "HIGH"] },
          quote: { type: "string" },
          plainEnglish: { type: "string" },
          whyItMatters: { type: "string" },
          nextStep: { type: "string" },
        },
        required: ["category", "severity", "quote", "plainEnglish", "whyItMatters", "nextStep"],
      },
    },
    unknowns: { type: "array", items: { type: "string" } },
  },
  required: ["documentType", "overallRisk", "summary", "findings", "unknowns"],
};

const onDevicePromptOptions = {
  responseConstraint,
  omitResponseConstraintInput: true,
} as { responseConstraint: object };

const slimOnDevicePromptOptions = {
  responseConstraint: slimResponseConstraint,
  omitResponseConstraintInput: true,
} as { responseConstraint: object };

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
      promptOptions: onDevicePromptOptions,
    },
  });

  const localSlim = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: textCreateOptions(),
      promptOptions: slimOnDevicePromptOptions,
    },
  });

  const draftLocal = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: textCreateOptions() },
  });

  return { local, localSlim, draftLocal };
}

// The three models with a cloud leg. `cloudModel` is the model name the cloud
// calls use: Remote Config decides it, and the default is the fallback.
function createCloudModels(cloudModel: string) {
  const hybrid = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: {
      createOptions: textCreateOptions(),
      promptOptions: onDevicePromptOptions,
    },
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: triageSchema,
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
  });

  const grounded = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: cloudModel,
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.2,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
  });

  const groundedFallback = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: "gemini-3.5-flash-lite",
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.2,
      },
    },
  });

  const draftHybrid = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: textCreateOptions() },
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        temperature: 0.2,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
  });

  const draftCloud = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        temperature: 0.2,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
  });

  const draftCloudFallback = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: "gemini-3.5-flash-lite",
      generationConfig: {
        temperature: 0.2,
      },
    },
  });

  const cloudTriage = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: triageSchema,
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
  });

  // Fast free-tier fallback when the primary cloud model returns 503, 429, or
  // times out. Omit thinkingConfig so the lite model uses its native default
  // without risking a 400 on model-specific thinking parameters.
  const cloudTriageFallback = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: "gemini-3.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: triageSchema,
        temperature: 0.1,
      },
    },
  });

  return {
    hybrid,
    grounded,
    groundedFallback,
    draftHybrid,
    draftCloud,
    draftCloudFallback,
    cloudTriage,
    cloudTriageFallback,
  };
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
