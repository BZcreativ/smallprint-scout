import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
  type GenerativeModel,
  type ModelParams,
} from "firebase/ai";
import { firebaseApp } from "./firebase/app";

const CLOUD_MODEL = "gemini-3.8-flash";

const ai = getAI(firebaseApp, {
  backend: new GoogleAIBackend(),
  useLimitedUseAppCheckTokens: true,
});

const SYSTEM_PROMPT = [
  "You are a consumer-protection analyst. Review the supplied agreement text and identify the practical financial, renewal, cancellation, refund, rights and data-privacy implications for the person who is being asked to agree to it.",
  "Rules:",
  "1. Every finding MUST include an exact verbatim 'quote' copied directly from the input text.",
  "2. Do not invent missing prices, dates or legal conclusions. Put missing critical facts in 'unknowns'.",
  "3. Return at most 3 findings, worst first.",
  "4. Reply with JSON only. No prose before or after the JSON.",
].join("\n");

// Inlined copy of the spec §4.1 schema: Task 1 runs before `src/domain/schema.ts`
// exists, and the Task 1 gate may simplify this schema, so the spike keeps its own.
const triageSchema = Schema.object({
  properties: {
    documentType: Schema.enumString({
      enum: ["SUBSCRIPTION_TERMS", "FREE_TRIAL", "PRIVACY_AI_CLAUSE", "SERVICE_AGREEMENT", "OTHER"],
    }),
    overallRisk: Schema.enumString({ enum: ["LOW", "MEDIUM", "HIGH"] }),
    summary: Schema.string({ description: "Plain-English summary in 1-2 calm, factual sentences." }),
    findings: Schema.array({
      items: Schema.object({
        properties: {
          category: Schema.enumString({
            enum: ["PRICE", "RENEWAL", "CANCELLATION", "REFUND", "RIGHTS", "PRIVACY", "OTHER"],
          }),
          severity: Schema.enumString({ enum: ["INFO", "WATCH", "HIGH"] }),
          quote: Schema.string({ description: "Exact verbatim substring copied directly from the input text." }),
          plainEnglish: Schema.string(),
          whyItMatters: Schema.string(),
          nextStep: Schema.string(),
          confidence: Schema.enumString({ enum: ["LOW", "MEDIUM", "HIGH"] }),
        },
      }),
    }),
    keyDates: Schema.array({
      items: Schema.object({
        properties: {
          event: Schema.string(),
          dateOrTrigger: Schema.string(),
          sourceQuote: Schema.string(),
        },
      }),
    }),
    unknowns: Schema.array({
      items: Schema.string({ description: "Important consumer details missing from the text (e.g., renewal price not stated)." }),
    }),
  },
});

// `Schema#toJSON` is stripped from the public types, so serialise through JSON.stringify,
// which calls it at runtime and yields the plain JSON schema the Prompt API expects.
const responseConstraint = JSON.parse(JSON.stringify(triageSchema)) as object;

const SAMPLE_IDS = ["gym-membership", "subscription-renewal", "privacy-ai-terms"] as const;
type SampleId = (typeof SAMPLE_IDS)[number];

const output = document.getElementById("output") as HTMLPreElement;
const sampleSelect = document.getElementById("sample") as HTMLSelectElement;

function log(message: string): void {
  const stamp = new Date().toLocaleTimeString("en-GB");
  output.textContent = `${output.textContent ?? ""}[${stamp}] ${message}\n`;
  console.log(message);
}

function currentSampleId(): SampleId {
  return SAMPLE_IDS.find((id) => id === sampleSelect.value) ?? SAMPLE_IDS[0];
}

async function loadSample(): Promise<{ id: SampleId; text: string }> {
  const id = currentSampleId();
  const response = await fetch(`/samples/${id}.txt`);
  if (!response.ok) throw new Error(`could not load /samples/${id}.txt (HTTP ${response.status})`);
  return { id, text: await response.text() };
}

// Quote/dash normalisation, same rules as the Task 3 verifier, so the gate measures
// JSON validity and quote fidelity rather than typography.
function normalizeQuote(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function reportParse(text: string, source: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    log("parse: FAILED, the output is not JSON. Gate rule: simplify the schema and rerun.");
    return;
  }
  const result = parsed as { findings?: { quote?: unknown }[]; unknowns?: unknown[] };
  const findings = result.findings ?? [];
  const normalizedSource = normalizeQuote(source);
  const verified = findings.filter((finding) => {
    const quote = typeof finding.quote === "string" ? normalizeQuote(finding.quote) : "";
    return quote.length >= 8 && normalizedSource.includes(quote);
  }).length;
  log(`parse: OK, ${findings.length} finding(s), ${verified} quote(s) found verbatim in the sample.`);
  log(`unknowns: ${(result.unknowns ?? []).length}`);
}

function createModel(mode: InferenceMode): GenerativeModel {
  const inCloudParams: ModelParams = {
    model: CLOUD_MODEL,
    generationConfig: { responseMimeType: "application/json", responseSchema: triageSchema },
  };
  if (mode === InferenceMode.ONLY_IN_CLOUD) {
    return getGenerativeModel(ai, {
      mode,
      inCloudParams: { ...inCloudParams, tools: [{ googleSearch: {} }] },
    });
  }
  return getGenerativeModel(ai, {
    mode,
    onDeviceParams: { promptOptions: { responseConstraint } },
    inCloudParams,
  });
}

async function run(mode: InferenceMode, label: string): Promise<void> {
  log(`--- ${label} (${mode}) ---`);
  const started = Date.now();
  try {
    const { id, text: source } = await loadSample();
    log(`sample: ${id} (${source.trim().length} characters)`);
    const model = createModel(mode);
    if (mode !== InferenceMode.ONLY_IN_CLOUD) {
      log("initializing the on-device model, watching for a download");
      await model.initializeDeviceModel((progress: number) => {
        log(`download ${Math.round(progress * 100)}%`);
      });
      log("on-device model ready");
    }
    const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nAgreement text:\n${source}`);
    log(`inferenceSource: ${result.response.inferenceSource ?? "UNKNOWN"}`);
    const text = result.response.text();
    log(`text: ${text}`);
    const grounding = result.response.candidates?.[0]?.groundingMetadata;
    log(`groundingMetadata: ${grounding ? JSON.stringify(grounding, null, 2) : "none returned"}`);
    reportParse(text, source);
  } catch (error) {
    log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    log(`finished in ${Date.now() - started} ms`);
  }
}

function wire(id: string, mode: InferenceMode, label: string): void {
  document.getElementById(id)?.addEventListener("click", () => {
    void run(mode, label);
  });
}

async function reportAvailability(): Promise<void> {
  if (typeof LanguageModel === "undefined") {
    log("LanguageModel: not found. Use Chrome desktop 139+ with the Prompt API flag enabled.");
    return;
  }
  try {
    log(`LanguageModel.availability(): ${await LanguageModel.availability()}`);
  } catch (error) {
    log(`LanguageModel.availability() failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

wire("only-on-device", InferenceMode.ONLY_ON_DEVICE, "ONLY_ON_DEVICE");
wire("prefer-on-device", InferenceMode.PREFER_ON_DEVICE, "PREFER_ON_DEVICE");
wire("only-in-cloud", InferenceMode.ONLY_IN_CLOUD, "ONLY_IN_CLOUD + Google Search");
void reportAvailability();
