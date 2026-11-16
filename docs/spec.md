# SmallPrint Scout — Final Implementation Blueprint (v2.0)

**Product Name:** SmallPrint Scout — "Wait, what am I signing?"

**Target Event:** #BuildHybridAI 2026

**Document Status:** Production-Ready Implementation Blueprint (Locked Scope)

**Date:** 16 November 2026

**Submission Deadline:** 30 November 2026, 2:00 PM PT (10:00 PM GMT)

---

## 1. Locked Pre-Implementation Decisions

To eliminate technical ambiguity from the second review and move immediately into code today (16 November), the four open architectural questions are now formally locked:

1. **Primary Deliverable Architecture:** **Hosted Chrome Web App (`Web (Chrome)` platform)** deployed on **Firebase Hosting**. The Chrome Extension is officially deferred to P1 so the team hits zero Manifest V3 or `chrome-extension://` origin conflicts with Firebase App Check reCAPTCHA Enterprise.
2. **Launch Jurisdiction for Cloud Grounding:** **United Kingdom (Consumer Rights Act 2015, Digital Markets, Competition and Consumers Act 2024, and UK GDPR)** as the primary deep-tested demo jurisdiction, with an explicit dropdown allowing judges to select **United States (FTC Negative Option / Click-to-Cancel Rule)** as a secondary option.
3. **Pinned Cloud Model:** **`gemini-3.8-flash`** for both the opt-in hybrid fallback (`PREFER_ON_DEVICE`) and the explicit cloud research/drafting flow (`ONLY_IN_CLOUD` + Google Search Grounding). It provides the optimal balance of structured JSON reliability, Google Search grounding support, and low latency for a 3-minute demo.
4. **Maximum Input Size:** **6,000 characters** (~900–1,000 words) per scan, with a minimum floor of **80 characters**. This fits comfortably inside Chrome's built-in Gemini Nano context window alongside the system prompt and JSON schema constraint, preventing local context-window overflows.

---

## 2. Executive Summary & Value Proposition

### Product in One Sentence

SmallPrint Scout helps everyday consumers uncover the hidden renewal traps, fee hikes, cancellation deadlines, and data-sharing rules buried in subscription and service agreements—running a strict, local-by-default first pass on-device via **Firebase AI Logic**, and escalating to grounded **Cloud Gemini** research only after explicit user consent and local PII redaction.

### Why This Architecture Wins #BuildHybridAI 2026

* **Honest, Consent-Driven Hybrid Routing:** Instead of silently falling back to the cloud when a user expects privacy, SmallPrint Scout exposes all three Firebase AI Logic modes purposefully:
1. **`InferenceMode.ONLY_ON_DEVICE`** (Default): Guarantees that sensitive personal contracts stay inside Chrome's local Gemini Nano runtime.
2. **`InferenceMode.PREFER_ON_DEVICE`** (Explicit Opt-In Toggle): Demonstrates seamless hybrid resilience for users on unsupported hardware or while the local model is still downloading, reading `response.inferenceSource` (`ON_DEVICE` vs. `IN_CLOUD`) as the ground truth.
3. **`InferenceMode.ONLY_IN_CLOUD`** (Explicit Escalation + Search Grounding): Invoked only after the user reviews and approves an editable, locally redacted text preview to perform tasks that local models *cannot* do—live statutory/regulator lookup via Google Search Grounding.


* **Evidence-Backed Trust (Zero Hallucinated Quotes):** Every warning card requires a verbatim `quote` field that our client-side validator checks against the normalized input text before displaying it as a direct quotation.

---

## 3. End-to-End State Machine & User Journey

```text
[1. INPUT & MODEL STATUS]
   ├── Load 1 of 3 Seeded Samples OR Paste Text (80–6,000 chars)
   ├── Check Local Model Status & Init via User Gesture
   │
   ├──► (Default) Click "Private Scan — This Device Only"
   │       └── Runs `ONLY_ON_DEVICE`
   │
   └──► (Opt-In Toggle ON) Click "Hybrid Scan (Allow Cloud Fallback)"
           └── Runs `PREFER_ON_DEVICE` -> Reads `result.response.inferenceSource`
                    │
                    ▼
[2. FIRST-PASS STRUCTURED RESULTS]
   ├── Displays Actual Route Badge (`ON_DEVICE` or `IN_CLOUD`) + Measured Client Duration (ms)
   ├── Risk-Attention Level (LOW / MEDIUM / HIGH) + Plain-English Summary
   ├── Up to 3 Priority Findings (Verified Exact Quote + Why It Matters + Next Step)
   ├── Extracted Key Dates / Notice Deadlines + Explicit "Unknowns"
   │
   ├──► Action A: "Draft a Message" (Local or Cloud-assisted copyable template)
   └──► Action B: "Research Clause in Cloud (with Web Grounding)"
                    │
                    ▼
[3. REDACTION PREVIEW & CONSENT GATE]
   ├── Client-side Regex Redactor masks Emails, Phones, Postcodes, Account IDs, Names
   ├── Editable Textarea showing exact outbound payload
   ├── Explicit Jurisdiction Selector (UK / US-FTC)
   └── User clicks "Confirm & Send Redacted Text to Cloud"
                    │
                    ▼
[4. GROUNDED CLOUD DEEP REVIEW (`ONLY_IN_CLOUD`)]
   ├── Calls `gemini-3.8-flash` with `googleSearch` tool enabled
   ├── Separates "What the Clauses Say" vs. "Relevant Consumer Guidance"
   ├── Renders Grounding Source Links (`groundingMetadata.groundingChunks`)
   └── Offers One-Click Copyable Pushback / Cancellation / Clarification Draft

```

---

## 4. Production Code Specifications (`src/` Modules)

Below are the exact, implementation-ready TypeScript modules aligned with the refined requirements and Firebase JS SDK v12.5.0+.

### 4.1 `src/domain/schemas.ts` (Dual-Path Hybrid Structured Output)

As noted in the review, hybrid structured output requires configuring both `onDeviceParams.responseConstraint` and `inCloudParams.generationConfig.responseSchema`.

```typescript
import { Schema } from "firebase/ai";

export interface FindingItem {
  category: "PRICE" | "RENEWAL" | "CANCELLATION" | "REFUND" | "RIGHTS" | "PRIVACY" | "OTHER";
  severity: "INFO" | "WATCH" | "HIGH";
  quote: string;
  plainEnglish: string;
  whyItMatters: string;
  nextStep: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  quoteVerified?: boolean; // Set by client-side validator
}

export interface KeyDateItem {
  event: string;
  dateOrTrigger: string;
  sourceQuote: string;
}

export interface TriageResult {
  documentType: string;
  overallRisk: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  findings: FindingItem[];
  keyDates: KeyDateItem[];
  unknowns: string[];
}

export const triageFirebaseSchema = Schema.object({
  properties: {
    documentType: Schema.enumString({
      enum: ["SUBSCRIPTION_TERMS", "FREE_TRIAL", "PRIVACY_AI_CLAUSE", "SERVICE_AGREEMENT", "OTHER"]
    }),
    overallRisk: Schema.enumString({ enum: ["LOW", "MEDIUM", "HIGH"] }),
    summary: Schema.string({
      description: "Plain-English summary in 1-2 calm, factual sentences."
    }),
    findings: Schema.array({
      items: Schema.object({
        properties: {
          category: Schema.enumString({
            enum: ["PRICE", "RENEWAL", "CANCELLATION", "REFUND", "RIGHTS", "PRIVACY", "OTHER"]
          }),
          severity: Schema.enumString({ enum: ["INFO", "WATCH", "HIGH"] }),
          quote: Schema.string({
            description: "Exact verbatim substring copied directly from the input text."
          }),
          plainEnglish: Schema.string(),
          whyItMatters: Schema.string(),
          nextStep: Schema.string(),
          confidence: Schema.enumString({ enum: ["LOW", "MEDIUM", "HIGH"] })
        }
      })
    }),
    keyDates: Schema.array({
      items: Schema.object({
        properties: {
          event: Schema.string(),
          dateOrTrigger: Schema.string(),
          sourceQuote: Schema.string()
        }
      })
    }),
    unknowns: Schema.array({
      items: Schema.string({
        description: "Important consumer details missing from the text (e.g., renewal price not stated)."
      })
    })
  }
});

```

---

### 4.2 `src/firebase/app-check.ts` (Safe Production + Local Dev Setup)

Never commit debug tokens. Production uses `ReCaptchaEnterpriseProvider`, while local development opts in via an environment flag so the developer can copy the auto-generated token from the DevTools console into the Firebase Console.

```typescript
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const firebaseApp = initializeApp(firebaseConfig);

export function setupAppCheck() {
  // Only enable the Debug Provider on localhost when explicitly flagged in local .env.local
  if (import.meta.env.DEV && import.meta.env.VITE_USE_APPCHECK_DEBUG === "true") {
    (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  return initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}

```

---

### 4.3 `src/firebase/ai-models.ts` (Strict Local, Opt-In Hybrid, and Grounded Cloud)

Separates the three inference paths cleanly and reads `result.response.inferenceSource` for honest telemetry.

```typescript
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode
} from "firebase/ai";
import { firebaseApp } from "./app-check";
import { triageFirebaseSchema, TriageResult } from "../domain/schemas";
import { validateQuotesAgainstSource } from "../domain/validate-result";

const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

const SYSTEM_PROMPT_TRIAGE = `
You are a consumer-protection analyst. Review the supplied agreement text and identify practical financial, renewal, cancellation, refund, rights, and data-privacy implications.
Rules:
1. Every finding MUST include an exact verbatim 'quote' copied from the user's text.
2. Do not invent missing prices, dates, or legal conclusions. Put missing critical facts in 'unknowns'.
3. Return at most 3 high-priority findings sorted by practical impact.
`.trim();

// 1. STRICT LOCAL MODEL (`ONLY_ON_DEVICE`)
export const strictLocalModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    promptOptions: {
      responseConstraint: triageFirebaseSchema
    }
  }
});

// 2. OPT-IN HYBRID MODEL (`PREFER_ON_DEVICE`)
export const optInHybridModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: {
    promptOptions: {
      responseConstraint: triageFirebaseSchema
    }
  },
  inCloudParams: {
    model: "gemini-3.8-flash",
    systemInstruction: SYSTEM_PROMPT_TRIAGE,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: triageFirebaseSchema,
      temperature: 0.1
    }
  }
});

// 3. EXPLICIT CLOUD RESEARCH MODEL (`ONLY_IN_CLOUD` + Google Search Grounding)
export const groundedCloudModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: "gemini-3.8-flash",
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.2
    }
  }
});

export interface ScanExecutionEnvelope {
  data: TriageResult;
  actualInferenceSource: "ON_DEVICE" | "IN_CLOUD";
  durationMs: number;
}

export async function runFirstPassScan(
  sourceText: string,
  allowCloudFallback: boolean
): Promise<ScanExecutionEnvelope> {
  const startTime = performance.now();
  const activeModel = allowCloudFallback ? optInHybridModel : strictLocalModel;

  const prompt = `${SYSTEM_PROMPT_TRIAGE}\n\n--- AGREEMENT TEXT ---\n${sourceText}`;
  const result = await activeModel.generateContent(prompt);
  const durationMs = Math.round(performance.now() - startTime);

  // Read SDK's actual reported inferenceSource (v12.5.0+)
  const reportedSource = (result.response as any).inferenceSource;
  const actualInferenceSource: "ON_DEVICE" | "IN_CLOUD" =
    reportedSource === "IN_CLOUD"
      ? "IN_CLOUD"
      : "ON_DEVICE";

  const rawJson = JSON.parse(result.response.text()) as TriageResult;
  const validatedData = validateQuotesAgainstSource(rawJson, sourceText);

  return {
    data: validatedData,
    actualInferenceSource,
    durationMs
  };
}

```

---

### 4.4 `src/domain/validate-result.ts` (Quote Verification & Anti-Hallucination Guardrail)

Ensures the UI never renders a fabricated quotation as if it appeared in the user's contract.

```typescript
import { TriageResult } from "./schemas";

function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, " ").trim().toLowerCase();
}

export function validateQuotesAgainstSource(
  result: TriageResult,
  originalSource: string
): TriageResult {
  const normalizedSource = normalizeWhitespace(originalSource);

  const verifiedFindings = (result.findings || []).slice(0, 3).map((finding) => {
    const normalizedQuote = normalizeWhitespace(finding.quote || "");
    const isExactMatch =
      normalizedQuote.length >= 8 && normalizedSource.includes(normalizedQuote);

    return {
      ...finding,
      quoteVerified: isExactMatch,
      // If the model paraphrased instead of quoting verbatim, flag it transparently
      quote: isExactMatch
        ? finding.quote
        : "[Paraphrased reference — verify against original text]"
    };
  });

  return {
    ...result,
    findings: verifiedFindings
  };
}

```

---

### 4.5 `src/privacy/pii-redactor.ts` (Local Best-Effort Redactor + Preserved Commercial Terms)

Preserves dollar/pound amounts, notice periods, and renewal dates (which are essential for contract analysis) while masking personal identifiers before displaying the editable preview.

```typescript
export interface RedactionSummary {
  redactedText: string;
  replacementsCount: number;
}

export function createRedactedPreview(input: string): RedactionSummary {
  let count = 0;
  const countReplacement = (tag: string) => {
    count += 1;
    return tag;
  };

  let text = input
    // 1. Email addresses
    .replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      () => countReplacement("[REDACTED_EMAIL]")
    )
    // 2. UK & International Phone Numbers (avoids matching short currency/day numbers)
    .replace(
      /(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?\d{3,4}[\s-]?\d{3,4}|\b07\d{3}[\s-]?\d{6}\b)/g,
      () => countReplacement("[REDACTED_PHONE]")
    )
    // 3. UK Postcodes & US ZIP+4
    .replace(
      /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|\d{5}-\d{4})\b/gi,
      () => countReplacement("[REDACTED_POSTCODE]")
    )
    // 4. Explicit Account / Membership / Customer IDs
    .replace(
      /\b(Account|Member|Customer|Policy|Ref(?:erence)?)\s*(?:No|Number|ID|#)?\s*[:=-]?\s*([A-Z0-9-]{5,})\b/gi,
      (_match, label) => `${label}: ${countReplacement("[REDACTED_ID]")}`
    )
    // 5. Explicit Salutations / Signatory Lines ("Dear Alex Smith", "Signed by: Alex Smith")
    .replace(
      /\b(Dear|Tenant|Member Name|Customer Name|Signed by|Prepared for)\s*[:=-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g,
      (_match, prefix) => `${prefix}: ${countReplacement("[REDACTED_NAME]")}`
    );

  return {
    redactedText: text,
    replacementsCount: count
  };
}

```

---

## 5. Seeded Demo Agreements (`public/samples/`)

Include these three realistic, ready-to-click sample agreements in the web app so judges can test every path in seconds:

### Sample 1: `gym-membership.txt` (Introductory Offer + Rolling Notice Trap)

> **PeakForm Fitness — 14-Day Promotional Trial & Annual Membership Terms**
> By activating your £1.00 14-day trial, you authorise PeakForm Fitness Ltd to automatically convert your trial into a 12-month Committed Membership at £64.99/month unless cancelled in writing at least 7 full business days before the 14th day. Following the initial 12-month minimum term, this agreement automatically renews for successive 12-month periods unless you submit a physical cancellation form via recorded delivery between 45 and 30 days prior to your renewal date. An annual "Facility Enhancement Levy" of £49.00 is billed on Day 30 and is strictly non-refundable under all circumstances. Early cancellation during the minimum term requires immediate payment of 100% of the remaining months.

### Sample 2: `subscription-renewal.txt` (SaaS Auto-Renewal + Price Hike Clause)

> **CloudWork Pro — Subscription & Billing Terms (Section 4)**
> Your annual promotional plan (£96 billed upfront, equivalent to £8/month) will automatically renew at the then-current standard list rate (currently £240/year) unless auto-renewal is disabled in Account Settings at least 30 days before the end of your billing cycle. We reserve the right to modify subscription fees at any time upon 15 days' notice sent by email; continued use constitutes acceptance. All prepaid annual fees are non-refundable, and no prorated credits or refunds will be issued for partial months or unused seats if you downgrade or cancel mid-cycle.

### Sample 3: `privacy-ai-terms.txt` (Broad AI Training License + Arbitration Waiver)

> **SnapCanvas Studio — Content Licence & Dispute Resolution (Section 9 & 14)**
> By uploading photos, voice recordings, or documents to the Service, you grant SnapCanvas and its commercial affiliates a worldwide, perpetual, irrevocable, royalty-free, sublicensable licence to host, reproduce, modify, and use your content—including biometric facial geometry and voiceprints—to train, fine-tune, and commercialise foundational artificial intelligence models, even after you delete your account. You further agree that any dispute arising out of this Agreement shall be resolved exclusively through binding individual arbitration, and you expressly waive any right to participate in a class-action lawsuit or trial by jury.

---

## 6. Cloud Grounding & Source Extraction Specification (`src/firebase/ai-cloud.ts`)

When the user approves the redacted preview and selects a jurisdiction (`UK` or `US-FTC`), call `groundedCloudModel` and parse the `groundingMetadata` returned by Firebase AI Logic:

```typescript
import { groundedCloudModel } from "./ai-models";

export interface GroundedSource {
  title: string;
  uri: string;
}

export interface DeepReviewResponse {
  markdownAnalysis: string;
  sources: GroundedSource[];
  jurisdiction: string;
}

export async function runCloudLegalResearch(
  redactedText: string,
  jurisdiction: "UK (Consumer Rights Act 2015 & DMCC Act 2024)" | "US (FTC Click-to-Cancel & Negative Option Rules)"
): Promise<DeepReviewResponse> {
  const prompt = `
Jurisdiction selected by user: ${jurisdiction}

Review the following redacted consumer agreement excerpt using Google Search grounding.
Structure your response with these exact Markdown sections:
1. **What the Clause Requires**: Factual summary of the obligations in the excerpt.
2. **Relevant Consumer Protection Guidance (${jurisdiction})**: How official legislation or regulator guidance (such as CMA/Gov.uk in the UK or FTC in the US) treats automatic renewals, hidden fees, unfair cancellation hurdles, or broad data/AI licences.
3. **What We Cannot Determine (Missing Facts)**: Facts not present in the excerpt that could affect how rules apply.
4. **Questions to Ask Before Agreeing**: 2-3 specific questions the consumer should verify.

Use cautious, non-definitive language ("may raise fairness concerns under...", "regulator guidance states..."). Do not provide formal legal advice.

--- REDACTED EXCERPT ---
${redactedText}
`.trim();

  const result = await groundedCloudModel.generateContent(prompt);
  const response = result.response;

  // Extract verified search grounding links from candidate metadata
  const chunks =
    (response as any).candidates?.[0]?.groundingMetadata?.groundingChunks || [];

  const sources: GroundedSource[] = chunks
    .map((chunk: any) => chunk.web)
    .filter((web: any) => web && web.uri && web.title)
    .map((web: any) => ({ title: web.title, uri: web.uri }));

  return {
    markdownAnalysis: response.text(),
    sources,
    jurisdiction
  };
}

```

---

## 7. Updated Day-by-Day Sprint Plan (16–30 November 2026)

| Window | Milestone | Concrete Deliverables |
| --- | --- | --- |
| **Mon 16 – Tue 17 Nov** | **Foundation & Firebase Spike** | Initialize Vite + React + TS repo (`smallprint-scout`). Configure Firebase project, enable Firebase AI Logic, set up App Check (reCAPTCHA Enterprise + local `.env.local` debug mode), and verify `ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, and `ONLY_IN_CLOUD` calls in Chrome 139+. |
| **Wed 18 – Fri 20 Nov** | **Local Triage & Quote Validator** | Build Screen 1 (Input + 3 Sample Cards + Model Status) and Screen 2 (Risk Summary + Finding Cards + Actual `inferenceSource` Badge). Wire up `validateQuotesAgainstSource()` and unit test it with Vitest. |
| **Sat 21 – Mon 23 Nov** | **Redaction Gate & Grounded Cloud** | Build `createRedactedPreview()` with unit tests. Build Screen 3 (Editable Redaction Modal + UK/US Jurisdiction Selector) and Screen 4 (Grounded Cloud Review rendering `groundingChunks` links). |
| **Tue 24 – Wed 25 Nov** | **Action Drafts & 12-Case Eval Suite** | Build Screen 5 (Copyable Cancellation / Clarification / Negotiation Draft Editor). Run the 12-case local evaluation suite (including benign clauses and insufficient-text edge cases) to tune prompts against false positives. |
| **Thu 26 – Fri 27 Nov** | **Hosting, Hardening & Offline Test** | Deploy production build to **Firebase Hosting**. Verify App Check enforcement in Firebase Console. Test Airplane Mode after local model download to confirm strict `ONLY_ON_DEVICE` works offline. |
| **Sat 28 – Sun 29 Nov** | **Repo Polish & 3-Min YouTube Demo** | Audit repo for zero leaked tokens, add `LICENSE` (MIT/Apache 2.0), write comprehensive `README.md`, and record the 3-minute YouTube demo following the Section 12 script. |
| **Mon 30 Nov** | **Final Submission Buffer** | Submit Devpost package by **12:00 PM PT / 8:00 PM GMT** (2 hours ahead of the 2:00 PM PT / 10:00 PM GMT hard cutoff). |

