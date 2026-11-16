# SmallPrint Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hosted Chrome web app that scans pasted consumer agreements on-device with Gemini Nano through Firebase AI Logic, and escalates to grounded cloud research only after the user approves a redacted preview.

**Architecture:** Vite + React + TypeScript single-page app on Firebase Hosting. Pure domain logic (validation, quote checking, redaction, result parsing, eval scoring) lives in `src/domain/` and is unit-tested with Vitest. Firebase code in `src/firebase/` takes model objects as parameters so it can be tested with fakes. UI in `src/ui/` is verified by hand in Chrome.

**Tech Stack:** Vite, React 18, TypeScript, `firebase` (JS SDK ≥ 12.5.0: `firebase/ai`, `firebase/app-check`), Vitest, Firebase Hosting.

**Spec:** `docs/spec.md`, as amended by the 16 Nov review (amendments listed below). Where they conflict, the amendment wins.

**Spec amendments from review:**
- A1. Redactor rewritten: the spec's regexes damaged the spec's own samples ("Account Settings" → `[REDACTED_ID]`) and missed UK landlines, US numbers and card numbers.
- A2. US option no longer names the FTC Click-to-Cancel rule (vacated July 2025). UK option states that DMCC subscription rules start 1 Jan 2027.
- A3. Grounded results must render `searchEntryPoint.renderedContent` (Google Search suggestions) as well as sources.
- A4. The app calls `initializeDeviceModel()` from a button click and shows download progress.
- A5. Hybrid scan sends **redacted** text, so the cloud never receives unredacted input.
- A6. A missing `inferenceSource` is shown as `UNKNOWN`, never assumed `ON_DEVICE`.
- A7. The system prompt is prepended to the prompt only. No `systemInstruction`.
- A8. Quote check normalizes curly quotes and dashes. Unverified quotes keep their text and get an "unverified" label. `keyDates.sourceQuote` is checked too.
- A9. Malformed JSON is retried once, then shown as an error state.

## Global Constraints

- App root: the repo root (https://github.com/BZcreativ/smallprint-scout). All paths below are relative to it.
- Firebase JS SDK `firebase` ≥ 12.5.0. Backend: `new GoogleAIBackend()` (Gemini Developer API).
- On-device needs Chrome desktop ≥ 139 with `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled.
- Cloud model: `"gemini-3.8-flash"` for both hybrid fallback and grounded research.
- Input: minimum 80, maximum 6,000 characters. On-device token limit is 9,216.
- At most 3 findings are displayed.
- App Check: `ReCaptchaEnterpriseProvider` in production. Debug token only when `import.meta.env.DEV && VITE_USE_APPCHECK_DEBUG === "true"`. Never commit tokens, `.env.local`, or the reCAPTCHA secret.
- Jurisdiction labels (exact copy):
  - `"UK — Consumer Rights Act 2015 & DMCC Act 2024 (subscription rules from 1 Jan 2027)"`
  - `"US — FTC Act §5, ROSCA & state auto-renewal laws"`
- Copy rule: never call output legal advice. The footer reads `"Not legal advice. Check the original document and official guidance."`
- License: Apache-2.0, `LICENSE` at repo root.
- Deadline: Devpost submission by 30 Nov 2026 12:00 PT (2 h buffer before the 14:00 PT cutoff). Video ≤ 3:00, public on YouTube, English.

## Review Focus

- **The judge's Chrome has no Nano** (flag off, wrong OS, other browser). The app must say so on load and offer "Scan with cloud (redacted)" instead of throwing an error. Test: Task 6 `getDeviceStatus` returns `"unsupported"` when `LanguageModel` is undefined.
- **Nano returns truncated or non-JSON output.** Expect one silent retry, then a readable error with "Try again". Test: Task 5 `retries once then throws ScanParseError`.
- **The model "quotes" with curly quotes or en-dashes.** The finding must still show as verified. Test: Task 3 `verifies quotes that differ only in quote/dash style`.
- **The user pastes a whole ToS (> 6,000 chars).** It must be blocked with a message giving the count, never silently truncated. Test: Task 2 `rejects input over 6000 chars with its length`.
- **The grounded call returns no `groundingMetadata`** (the model chose not to search). Show the analysis plus "No web sources were returned", with no crash. Test: Task 8 `extractGrounding handles missing metadata`.

---

## File Structure

```
smallprint-scout/
  .env.example              Firebase + reCAPTCHA keys (names only)
  firebase.json, .firebaserc
  LICENSE                   Apache-2.0
  README.md
  public/samples/           gym-membership.txt, subscription-renewal.txt, privacy-ai-terms.txt
  src/
    types/prompt-api.d.ts   minimal `LanguageModel` global declaration
    domain/                 pure logic, all unit-tested
      types.ts              TriageResult, Finding, KeyDate, InferenceRoute, JurisdictionId
      input.ts              validateInput
      schema.ts             triageSchema (Firebase Schema helpers)
      parse-result.ts       parseTriage, ScanParseError
      verify-quotes.ts      verifyQuotes
      redact.ts             redact
      drafts.ts             buildDraft
      eval-cases.ts         EVAL_CASES, scoreCase
    firebase/
      app.ts                firebaseApp + App Check init (spec §4.2)
      models.ts             createModels(): local / hybrid / grounded / localText
      device.ts             getDeviceStatus, initDeviceModel
      scan.ts               runFirstPassScan, toRoute, ScanEnvelope, GenerateFn
      research.ts           runCloudLegalResearch, extractGrounding
    ui/
      App.tsx               screen state machine
      ModelStatus.tsx, InputScreen.tsx, ResultsScreen.tsx,
      RedactionGate.tsx, ResearchScreen.tsx, DraftEditor.tsx, EvalRunner.tsx
  tests/                    mirrors src/domain and src/firebase (*.test.ts)
```

---
## Tasks

### Task 1: Scaffold, Firebase project and a three-mode spike (16–17 Nov)

The biggest risk is whether Nano returns usable structured JSON for these samples. Prove that before building any UI.

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `.env.example`, `LICENSE`, `src/types/prompt-api.d.ts`, `src/firebase/app.ts`, `src/spike.ts`, `spike.html`

**Interfaces:**
- Produces: `firebaseApp: FirebaseApp`, `setupAppCheck(): AppCheck` (both from `src/firebase/app.ts`, body as spec §4.2). `setupAppCheck()` is called once at module load in `app.ts`, before any `firebase/ai` call.

- [ ] **Step 1:** Run `npm create vite@latest app-tmp -- --template react-ts`, move its contents into the repo root (keep the existing `README.md`, `LICENSE` and `.gitignore` and merge the Vite `.gitignore` lines in), delete `app-tmp`, then `npm i firebase` and `npm i -D vitest`. Add the script `"test": "vitest run"`. The repo already exists.
- [ ] **Step 2:** In `.gitignore` add `.env.local` and `.env*.local`. In `.env.example` list the names `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_RECAPTCHA_SITE_KEY`, `VITE_USE_APPCHECK_DEBUG`, with no values. `LICENSE` (Apache-2.0) already exists.
- [ ] **Step 3:** In the Firebase console:
  - Create the project.
  - Run AI Services → AI Logic → Get started, choosing the Gemini Developer API.
  - Register the web app.
  - Create a reCAPTCHA Enterprise key for `<project>.web.app` and `<project>.firebaseapp.com`. Do **not** add localhost.
  - Register it in App Check.
  - Confirm that AI Logic shows **Enforced** under App Check → APIs.
- [ ] **Step 4:** Write `src/types/prompt-api.d.ts`:
  ```ts
  declare const LanguageModel: { availability(): Promise<"unavailable"|"downloadable"|"downloading"|"available"> } | undefined;
  ```
- [ ] **Step 5:** Write `spike.html` with three buttons. Each button calls `initializeDeviceModel()` on its click, then runs `generateContent` with Sample 1 text and the spec §4.1 schema. The three modes are `ONLY_ON_DEVICE`, `PREFER_ON_DEVICE` and `ONLY_IN_CLOUD` + `tools: [{ googleSearch: {} }]`. Log `result.response.inferenceSource`, `text()`, and `candidates?.[0]?.groundingMetadata`.
- [ ] **Step 6:** Set `VITE_USE_APPCHECK_DEBUG=true` in `.env.local`, then run `npm run dev`. Register the console debug token in App Check → Manage debug tokens. Click all three buttons in Chrome ≥ 139 with the flag on.
  Expected:
  - on-device logs `ON_DEVICE` and parseable JSON with ≥ 1 finding
  - hybrid logs `ON_DEVICE` (or `IN_CLOUD` while the model downloads)
  - grounded logs `groundingChunks` and `searchEntryPoint.renderedContent`

  **Gate:** if Nano JSON fails to parse on 2 of 3 samples, simplify the schema now (drop `confidence`, then `keyDates`) and rerun. Record the outcome in `docs/spike-notes.md`.
- [ ] **Step 7: Commit.** Run `git add -A && git commit -m "chore: scaffold app and verify three inference modes"`. Run `git status` first and confirm `.env.local` is not staged.

### Task 2: Domain types, schema and input validation

**Files:**
- Create: `src/domain/types.ts`, `src/domain/schema.ts`, `src/domain/input.ts`
- Test: `tests/domain/input.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `Finding`, `KeyDate`, `TriageResult`: copy the field lists from spec §4.1 with these changes:
    - `Finding.quoteVerified: boolean`, which is required
    - `KeyDate.sourceVerified: boolean`
  - `type InferenceRoute = "ON_DEVICE" | "IN_CLOUD" | "UNKNOWN"`
  - `type JurisdictionId = "UK" | "US"`
  - `const JURISDICTION_LABELS: Record<JurisdictionId, string>`, using the exact copy from Global Constraints
- Produces: `triageSchema` in `schema.ts`. This is the spec §4.1 `Schema.object(...)` unchanged, unless the Task 1 gate simplified it.
- Produces: `validateInput(text: string): { ok: true; text: string } | { ok: false; message: string }` in `input.ts`. It trims, then checks the length.

- [ ] **Step 1: Write failing tests**
  ```ts
  test("rejects input under 80 chars", () => expect(validateInput("short")).toEqual({ ok: false, message: "Paste at least 80 characters (you have 5)." }));
  test("rejects input over 6000 chars with its length", () => expect(validateInput("a".repeat(6001))).toEqual({ ok: false, message: "That's 6,001 characters. The limit is 6,000 — paste one section at a time." }));
  test("accepts and trims valid input", () => expect(validateInput("  " + "a".repeat(80) + " ")).toEqual({ ok: true, text: "a".repeat(80) }));
  ```
- [ ] **Step 2:** Run `npx vitest run tests/domain/input.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement `validateInput`. Use `n.toLocaleString("en-GB")` for counts, and copy the message text exactly as in the tests.
- [ ] **Step 4:** Run the same command. Expected: 3 passed.
- [ ] **Step 5:** Run `git add src/domain tests/domain && git commit -m "feat: domain types, schema, input validation"`.

### Task 3: Quote verification (amendment A8)

**Files:**
- Create: `src/domain/verify-quotes.ts`
- Test: `tests/domain/verify-quotes.test.ts`

**Interfaces:**
- Consumes: `TriageResult`, `Finding`, `KeyDate` from Task 2
- Produces: `verifyQuotes(raw: TriageResult, source: string): TriageResult`. It caps `findings` at 3, sets `quoteVerified` on each finding and `sourceVerified` on each key date, and never changes the quote text.
- Produces: `normalizeForMatch(s: string): string`. It lowercases, maps `‘’‚‛` → `'` and `“”„‟` → `"`, maps `‐‑‒–—―` → `-`, collapses whitespace, and trims.

- [ ] **Step 1: Write failing tests**
  ```ts
  const src = `All prepaid annual fees are non-refundable, and no prorated credits will be issued.`;
  const base = { documentType: "SUBSCRIPTION_TERMS", overallRisk: "HIGH", summary: "", keyDates: [], unknowns: [] } as const;
  const f = (quote: string) => ({ category: "REFUND", severity: "HIGH", quote, plainEnglish: "", whyItMatters: "", nextStep: "", confidence: "HIGH", quoteVerified: false }) as Finding;
  test("verifies exact quote", () => expect(verifyQuotes({ ...base, findings: [f("prepaid annual fees are non-refundable")] }, src).findings[0].quoteVerified).toBe(true));
  test("verifies quotes that differ only in quote/dash style", () => expect(verifyQuotes({ ...base, findings: [f("All prepaid annual fees are non–refundable")] }, src).findings[0].quoteVerified).toBe(true));
  test("flags paraphrase but keeps its text", () => { const r = verifyQuotes({ ...base, findings: [f("fees cannot be refunded")] }, src).findings[0]; expect(r.quoteVerified).toBe(false); expect(r.quote).toBe("fees cannot be refunded"); });
  test("rejects quotes shorter than 8 chars", () => expect(verifyQuotes({ ...base, findings: [f("fees")] }, src).findings[0].quoteVerified).toBe(false));
  test("caps findings at 3", () => expect(verifyQuotes({ ...base, findings: [1,2,3,4].map(() => f("x")) }, src).findings).toHaveLength(3));
  test("verifies key date source quotes", () => expect(verifyQuotes({ ...base, findings: [], keyDates: [{ event: "e", dateOrTrigger: "d", sourceQuote: "no prorated credits", sourceVerified: false }] }, src).keyDates[0].sourceVerified).toBe(true));
  ```
- [ ] **Step 2:** Run `npx vitest run tests/domain/verify-quotes.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement both functions in `verify-quotes.ts`. A quote is verified when its normalized length is ≥ 8 and the normalized source contains it.
- [ ] **Step 4:** Run the same command. Expected: 6 passed.
- [ ] **Step 5:** Run `git commit -am "feat: quote verification with quote/dash normalization"`. Add the new files first.

### Task 4: PII redactor (amendment A1)

**Files:**
- Create: `src/domain/redact.ts`
- Test: `tests/domain/redact.test.ts`

**Interfaces:**
- Produces: `redact(input: string): { redactedText: string; replacementsCount: number }`
- The algorithm is fixed. Apply these rules in this order. Order matters: cards before phones, IDs before phones. Every pattern below was run against every test case below.
  ```ts
  const RULES: [RegExp, string][] = [
    [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]"],
    [/\b(?:\d[ -]?){12,15}\d\b/g, "[REDACTED_CARD]"],
    [/(\b(?:[Aa]ccount|[Mm]ember(?:ship)?|[Cc]ustomer|[Pp]olicy|[Rr]ef(?:erence)?)\s*(?:[Nn]o\.?|[Nn]umber|ID|#)?\s*[:=#-]?\s*)(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,}\b/g, "$1[REDACTED_ID]"],
    [/(?:\+44\s?|\b0)\d(?:[\s-]?\d){8,9}\b/g, "[REDACTED_PHONE]"],
    [/(?:\+1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g, "[REDACTED_PHONE]"],
    [/\b(?:[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|\d{5}-\d{4})\b/g, "[REDACTED_POSTCODE]"],
    [/(\b(?:Dear|Member Name|Customer Name|Account Holder|Signed by|Prepared for)\s*[:=-]?\s*)[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g, "$1[REDACTED_NAME]"],
  ];
  ```
  No `i` flag anywhere. The case-insensitive ID rule was the bug. Count one replacement per match.

- [ ] **Step 1: Write failing tests.** Use `test.each` over `[input, expectedText]`:

  | input | expected |
  |---|---|
  | `unless auto-renewal is disabled in Account Settings at least 30 days` | unchanged |
  | `is strictly non-refundable under all circumstances` | unchanged |
  | `Contact our customer service team or member services` | unchanged |
  | `Call 020 7946 0958 or 0161 496 0000 or +44 20 7946 0958` | `Call [REDACTED_PHONE] or [REDACTED_PHONE] or [REDACTED_PHONE]` |
  | `US: (555) 123-4567 or 555-123-4567` | `US: [REDACTED_PHONE] or [REDACTED_PHONE]` |
  | `Mobile 07700 900123` | `Mobile [REDACTED_PHONE]` |
  | `Card 4111 1111 1111 1111 expires 09/28` | `Card [REDACTED_CARD] expires 09/28` |
  | `Dear Alex Smith, your Account No: AB12345` | `Dear [REDACTED_NAME], your Account No: [REDACTED_ID]` |
  | `Signed by: Jo Bloggs. Membership #: 99881234` | `Signed by: [REDACTED_NAME]. Membership #: [REDACTED_ID]` |
  | `Postcode SW1A 1AA` | `Postcode [REDACTED_POSTCODE]` |
  | `Email jo.bloggs@example.co.uk now` | `Email [REDACTED_EMAIL] now` |

  Also add `test("leaves all three seeded samples unchanged")`. It reads `public/samples/*.txt` with `fs` and asserts `replacementsCount === 0` for each one. Create the three sample files now with the text from spec §5.
- [ ] **Step 2:** Run `npx vitest run tests/domain/redact.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `redact` with `RULES` as above.
- [ ] **Step 4:** Run the same command. Expected: 12 passed.
- [ ] **Step 5:** Run `git add -A && git commit -m "feat: PII redactor that preserves contract terms"`.

### Task 5: Result parsing and first-pass scan (amendments A6, A7, A9)

**Files:**
- Create: `src/domain/parse-result.ts`, `src/firebase/models.ts`, `src/firebase/scan.ts`
- Test: `tests/domain/parse-result.test.ts`, `tests/firebase/scan.test.ts`

**Interfaces:**
- Consumes: `triageSchema`, `TriageResult`, `InferenceRoute` (Task 2), `verifyQuotes` (Task 3), `firebaseApp` (Task 1)
- Produces:
  - `parseTriage(text: string): TriageResult`. It throws `ScanParseError` on invalid JSON or when `findings` is not an array. It defaults missing `keyDates`/`unknowns` to `[]` and sets every `quoteVerified`/`sourceVerified` to `false`, because the schema does not produce them.
  - `class ScanParseError extends Error`, exported from `parse-result.ts`.
  - `createModels()` in `models.ts`, returning `{ local, hybrid, grounded, draftLocal, draftHybrid }`:
    - `local`: `ONLY_ON_DEVICE` with `onDeviceParams.promptOptions.responseConstraint: triageSchema`, plus `createOptions.expectedInputs/expectedOutputs: [{ type: "text", languages: ["en"] }]`.
    - `hybrid`: `PREFER_ON_DEVICE` with the same onDevice params, plus `inCloudParams: { model: "gemini-3.8-flash", generationConfig: { responseMimeType: "application/json", responseSchema: triageSchema, temperature: 0.1 } }`. No `systemInstruction` (A7).
    - `grounded`: as in spec §4.3.
    - `draftLocal`/`draftHybrid`: the same modes with no schema, for plain-text drafts.
    - Export a module-level `models = createModels()`.
  - `toRoute(v: unknown): InferenceRoute`. It returns `"ON_DEVICE"` or `"IN_CLOUD"` when `v` is exactly that string, and `"UNKNOWN"` otherwise.
  - `type GenerateFn = (prompt: string) => Promise<{ response: { text(): string; inferenceSource?: string } }>`
  - `runFirstPassScan(text: string, generate: GenerateFn): Promise<ScanEnvelope>`, where `type ScanEnvelope = { data: TriageResult; route: InferenceRoute; durationMs: number }` is exported from `scan.ts`. Prompt = `SYSTEM_PROMPT_TRIAGE` (spec §4.3) + `"\n\n--- AGREEMENT TEXT ---\n"` + text. It parses, retries once on `ScanParseError`, rethrows on the second failure, and then runs `verifyQuotes(data, text)`. Callers pass `models.local.generateContent.bind(models.local)`, or the hybrid equivalent.

- [ ] **Step 1: Write failing tests**
  ```ts
  // parse-result.test.ts
  test("throws ScanParseError on truncated JSON", () => expect(() => parseTriage('{"findings":[')).toThrow(ScanParseError));
  test("defaults missing arrays", () => expect(parseTriage('{"documentType":"OTHER","overallRisk":"LOW","summary":"s","findings":[]}').keyDates).toEqual([]));
  // scan.test.ts — fake GenerateFn, no Firebase
  test("toRoute maps undefined to UNKNOWN", () => expect(toRoute(undefined)).toBe("UNKNOWN"));
  test("retries once then throws ScanParseError", async () => { const gen = vi.fn().mockResolvedValue({ response: { text: () => "not json" } }); await expect(runFirstPassScan(SAMPLE, gen)).rejects.toThrow(ScanParseError); expect(gen).toHaveBeenCalledTimes(2); });
  test("succeeds on retry and reports route", async () => { const gen = vi.fn().mockResolvedValueOnce({ response: { text: () => "{" } }).mockResolvedValueOnce({ response: { text: () => VALID_JSON, inferenceSource: "ON_DEVICE" } }); const r = await runFirstPassScan(SAMPLE, gen); expect(r.route).toBe("ON_DEVICE"); expect(gen).toHaveBeenCalledTimes(2); });
  ```
  `SAMPLE` is Sample 2's text. `VALID_JSON` has one finding whose quote is `"All prepaid annual fees are non-refundable"`. Assert that `r.data.findings[0].quoteVerified === true`.
- [ ] **Step 2:** Run `npx vitest run tests/domain/parse-result.test.ts tests/firebase/scan.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `parse-result.ts`, `models.ts` and `scan.ts`. `scan.ts` must not import `models.ts`, so the tests stay Firebase-free.
- [ ] **Step 4:** Run the same command. Expected: 5 passed.
- [ ] **Step 5:** Run `git add -A && git commit -m "feat: first-pass scan with retry and honest route reporting"`.

### Task 6: Device model status and initialization (amendment A4)

**Files:**
- Create: `src/firebase/device.ts`, `src/ui/ModelStatus.tsx`
- Test: `tests/firebase/device.test.ts`

**Interfaces:**
- Produces:
  - `type DeviceStatus = "unsupported" | "downloadable" | "downloading" | "available"`
  - `getDeviceStatus(lm = globalThis.LanguageModel): Promise<DeviceStatus>`. It returns `"unsupported"` when `lm` is undefined, when `availability()` returns `"unavailable"`, or when it throws.
  - `initDeviceModel(onProgress: (pct: number) => void): void`. It calls `models.local.initializeDeviceModel(cb)` and `models.hybrid.initializeDeviceModel(cb)`. `cb` receives a value from 0 to 1, and `onProgress` gets `Math.round(v * 100)`.
  - `<ModelStatus status onEnable progress />`. It shows one line per status:
    - unsupported: `"On-device AI isn't available in this browser. You can still scan with redacted cloud analysis."` plus a "How to enable" link to the README section
    - downloadable: an "Enable private on-device AI" button
    - downloading: a progress bar
    - available: `"Private on-device AI ready"`

- [ ] **Step 1: Write failing tests**
  ```ts
  test("unsupported when LanguageModel is undefined", async () => expect(await getDeviceStatus(undefined)).toBe("unsupported"));
  test("unsupported when availability throws", async () => expect(await getDeviceStatus({ availability: () => Promise.reject(new Error()) })).toBe("unsupported"));
  test("unavailable maps to unsupported", async () => expect(await getDeviceStatus({ availability: async () => "unavailable" })).toBe("unsupported"));
  test("passes through available", async () => expect(await getDeviceStatus({ availability: async () => "available" })).toBe("available"));
  ```
- [ ] **Step 2:** Run `npx vitest run tests/firebase/device.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `device.ts` and `ModelStatus.tsx`. The "Enable" button's `onClick` calls `initDeviceModel` directly, because the user-activation requirement means it must not run after an `await`.
- [ ] **Step 4:** Run the same command. Expected: 4 passed. Then check by hand: in a fresh Chrome profile with the flag on, the page shows "downloadable", the click shows progress, and the status ends at "available".
- [ ] **Step 5:** Run `git add -A && git commit -m "feat: on-device model status and gesture-driven init"`.

### Task 7: Input, redaction gate and results screens (amendment A5)

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/InputScreen.tsx`, `src/ui/RedactionGate.tsx`, `src/ui/ResultsScreen.tsx`
- Modify: `src/main.tsx` (render `<App />`)

**Interfaces:**
- Consumes: `validateInput` (T2), `redact` (T4), `runFirstPassScan`, `models`, `ScanParseError` (T5), `getDeviceStatus`, `initDeviceModel`, `ModelStatus` (T6)
- Produces:
  - `type Screen = { name: "input" } | { name: "gate"; purpose: "hybrid" | "research"; text: string } | { name: "results"; source: string; scan: ScanEnvelope } | { name: "research"; ... } | { name: "draft"; ... }` in `App.tsx`. Task 8 fills the `research` variant and Task 9 fills `draft`.
  - `<RedactionGate initialText purpose onConfirm(text, jurisdiction?) onCancel />`. It shows `redact(initialText).redactedText` in an editable textarea, plus `"N items masked"`. When `purpose === "research"`, it also shows the jurisdiction `<select>` with `JURISDICTION_LABELS`. The confirm button reads `"Confirm & send this text to Google Gemini"`.

Flow decisions:
- **Private Scan** (default): `runFirstPassScan(text, models.local…)`. Disabled unless `status === "available"`.
- **Cloud-allowed scan**: open `RedactionGate` with purpose `hybrid`. On confirm, run the hybrid model on the **edited redacted text**, and verify quotes against that same text. When `status === "unsupported"`, this is the main button, labelled `"Scan with cloud (redacted)"`.
- Results show:
  - a route badge: `ON_DEVICE` → "On this device", `IN_CLOUD` → "Google Cloud (redacted text)", `UNKNOWN` → "Route unknown"
  - `durationMs`
  - the risk level and summary
  - up to 3 finding cards. Verified quotes appear in a blockquote. Unverified ones appear in normal text with an "Unverified quote — check the original" chip.
  - key dates with the same treatment
  - unknowns
  - two buttons: "Draft a message" and "Research in cloud"
- Errors:
  - `ScanParseError` → `"The model's answer came back incomplete. Try again."` with a retry button
  - any other error from `local` → `"On-device scan failed. You can try the redacted cloud scan instead."`
- Sample cards fetch `/samples/*.txt` into the textarea.
- The footer copy comes from Global Constraints.

- [ ] **Step 1:** Build the four components with the decisions above.
- [ ] **Step 2:** Run `npm run test && npx tsc --noEmit`. Expected: all prior tests pass, 0 type errors.
- [ ] **Step 3:** Manual check in Chrome with Nano available:
  - Sample 1 private scan shows the "On this device" badge and ≥ 1 verified quote.
  - With the DevTools Network tab open, no request goes to `firebasevertexai.googleapis.com` during a private scan.
  - The cloud-allowed scan shows the gate, and the request payload contains `[REDACTED_` only when the input had PII. Paste the Task 4 "Dear Alex Smith…" line into Sample 2 to check this.
  - In a second browser with no Nano (Edge, or Chrome with the flag off), the page shows the unsupported message and the cloud scan works.
- [ ] **Step 4:** Run `git add -A && git commit -m "feat: input, redaction gate, and results screens"`.

### Task 8: Grounded cloud research (amendments A2, A3)

**Files:**
- Create: `src/firebase/research.ts`, `src/ui/ResearchScreen.tsx`
- Test: `tests/firebase/research.test.ts`
- Add dependencies: `npm i marked dompurify` and `npm i -D @types/dompurify`

**Interfaces:**
- Consumes: `models.grounded`, `GenerateFn` (T5), `JurisdictionId`, `JURISDICTION_LABELS` (T2), `RedactionGate` (T7)
- Produces:
  - `type Grounding = { sources: { title: string; uri: string }[]; searchSuggestionsHtml: string | null }`
  - `extractGrounding(response: unknown): Grounding`. It reads `candidates[0].groundingMetadata`. `sources` comes from `groundingChunks[].web` entries that have both `uri` and `title`, deduped by `uri`. `searchSuggestionsHtml` is `searchEntryPoint.renderedContent ?? null`. It never throws.
  - `buildResearchPrompt(redactedText: string, j: JurisdictionId): string`. This is the spec §6 prompt with `JURISDICTION_LABELS[j]` substituted. Add one line: `"Prefer official sources (legislation.gov.uk, gov.uk, CMA, ftc.gov, state AG sites). If a rule is not yet in force, say so and give its start date."`
  - `runCloudLegalResearch(redactedText: string, j: JurisdictionId, generate: GenerateFn): Promise<{ markdown: string; grounding: Grounding; jurisdiction: JurisdictionId }>`
- `ResearchScreen` rendering rules:
  - Markdown goes through `DOMPurify.sanitize(marked.parse(md))`, because model output is untrusted.
  - When `searchSuggestionsHtml` is present, render it in `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc={html}>` directly under the analysis. This is required by the grounding terms.
  - Sources are listed as links with `rel="noopener noreferrer" target="_blank"`. When there are none, show `"No web sources were returned for this answer."`
  - Add a "Draft a message from this" button.

- [ ] **Step 1: Write failing tests**
  ```ts
  test("extractGrounding handles missing metadata", () => expect(extractGrounding({ candidates: [{}] })).toEqual({ sources: [], searchSuggestionsHtml: null }));
  test("extractGrounding handles garbage", () => expect(extractGrounding(undefined)).toEqual({ sources: [], searchSuggestionsHtml: null }));
  test("extracts and dedupes sources plus suggestions", () => { const g = extractGrounding({ candidates: [{ groundingMetadata: { searchEntryPoint: { renderedContent: "<div>s</div>" }, groundingChunks: [{ web: { uri: "u1", title: "gov.uk" } }, { web: { uri: "u1", title: "gov.uk" } }, { web: { uri: "u2" } }] } }] }); expect(g.sources).toEqual([{ uri: "u1", title: "gov.uk" }]); expect(g.searchSuggestionsHtml).toBe("<div>s</div>"); });
  test("prompt carries jurisdiction label and in-force instruction", () => { const p = buildResearchPrompt("x", "UK"); expect(p).toContain(JURISDICTION_LABELS.UK); expect(p).toContain("not yet in force"); });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/firebase/research.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `research.ts` and `ResearchScreen.tsx`.
- [ ] **Step 4:** Run the same command. Expected: 4 passed. Then do a manual run on Sample 2 with UK selected:
  - the analysis has the 4 sections
  - the suggestions widget renders
  - at least 1 source link opens
  - the analysis notes that the DMCC subscription rules start in 2027
- [ ] **Step 5:** Run `git add -A && git commit -m "feat: grounded cloud research with required search suggestions"`.

### Task 9: Action drafts

**Files:**
- Create: `src/domain/drafts.ts`, `src/ui/DraftEditor.tsx`
- Test: `tests/domain/drafts.test.ts`

**Interfaces:**
- Consumes: `Finding`, `TriageResult` (T2), `models.draftLocal`/`draftHybrid` (T5)
- Produces:
  - `type DraftKind = "CANCEL" | "CLARIFY" | "NEGOTIATE"`
  - `buildDraftPrompt(kind: DraftKind, findings: Finding[], context?: string): string`. It asks for a polite message under 180 words with `[YOUR NAME]` and `[ACCOUNT NUMBER]` placeholders. It includes each verified finding's quote. Unverified ones are included as "the terms appear to say…".
  - `<DraftEditor findings context? />`. It has 3 kind buttons. It runs `draftLocal` when Nano is available and otherwise asks for consent and then runs `draftHybrid` on redacted context. Output goes into an editable textarea with a "Copy" button (`navigator.clipboard.writeText`).

- [ ] **Step 1: Write failing tests**
  ```ts
  test("cancel prompt includes verified quote verbatim", () => expect(buildDraftPrompt("CANCEL", [verifiedFinding])).toContain(verifiedFinding.quote));
  test("unverified finding is hedged", () => expect(buildDraftPrompt("CLARIFY", [unverifiedFinding])).toContain("the terms appear to say"));
  test("prompt requests placeholders not real names", () => expect(buildDraftPrompt("NEGOTIATE", [])).toContain("[YOUR NAME]"));
  ```
- [ ] **Step 2:** Run `npx vitest run tests/domain/drafts.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `drafts.ts` and `DraftEditor.tsx`.
- [ ] **Step 4:** Run the same command. Expected: 3 passed. Manual check: after a Sample 1 scan, "Cancel" produces a draft, and Copy puts it on the clipboard.
- [ ] **Step 5:** Run `git add -A && git commit -m "feat: copyable action drafts"`.

### Task 10: 12-case evaluation suite (24–25 Nov)

**Files:**
- Create: `src/domain/eval-cases.ts`, `src/ui/EvalRunner.tsx` (reachable at `?eval=1`, not linked in the UI)
- Test: `tests/domain/eval-cases.test.ts`

**Interfaces:**
- Consumes: `runFirstPassScan`, `models.local` (T5), `TriageResult` (T2)
- Produces:
  - `type EvalCase = { id: string; text: string; expectRisk: ("LOW"|"MEDIUM"|"HIGH")[]; mustInclude: Finding["category"][]; mustNotFlag?: true }`
  - `EVAL_CASES: EvalCase[]`, with exactly 12 entries:
    - the 3 spec samples
    - 3 benign clauses (a plain monthly rolling plan with 1-click cancel, a 14-day refund, a privacy policy with no AI or sale terms), each with `mustNotFlag: true` and `expectRisk: ["LOW"]`
    - 2 insufficient-text cases (80–150 chars, vague), which must put ≥ 1 item in `unknowns`
    - 4 mixed traps: a mid-contract price rise, an auto-renew with no reminder, a data-sale opt-out buried in the text, and a cancel-by-phone-only clause
  - `scoreCase(c: EvalCase, r: TriageResult): { pass: boolean; reasons: string[] }`. It checks the risk is in `expectRisk`, every `mustInclude` category is present, `mustNotFlag` ⇒ no finding with severity `HIGH`, and the insufficient cases have `unknowns.length > 0`. It also records the verified-quote rate.
  - `EvalRunner` runs all 12 cases on-device in sequence and shows a pass/fail table plus the verified-quote %.

- [ ] **Step 1:** Write failing tests for `scoreCase`:
  - a benign case with one HIGH finding fails, with reason `"flagged HIGH on benign text"`
  - a case missing a required category fails, naming the category
  - a valid result passes
  - `EVAL_CASES.length === 12`
- [ ] **Step 2:** Run `npx vitest run tests/domain/eval-cases.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the cases, `scoreCase` and `EvalRunner`.
- [ ] **Step 4:** Unit tests pass. Run `?eval=1` in Chrome with Nano. **Target: ≥ 10/12 pass and ≥ 80% verified quotes.** If it falls short, tune `SYSTEM_PROMPT_TRIAGE` only (for example, add "If the text is ordinary and fair, return overallRisk LOW and no HIGH findings"), then rerun. Record each run's score in `docs/eval-log.md`.
- [ ] **Step 5:** Run `git add -A && git commit -m "test: 12-case on-device eval suite"`.

### Task 11: Hosting, App Check enforcement and offline proof (26–27 Nov)

**Files:**
- Create: `firebase.json` (`"hosting": { "public": "dist", "rewrites": [{ "source": "**", "destination": "/index.html" }] }`), `.firebaserc`

- [ ] **Step 1:** Run `npm run build && firebase deploy --only hosting`. Expected: a `https://<project>.web.app` URL.
- [ ] **Step 2:** On the deployed URL, in a normal Chrome profile with no debug token, check that private, hybrid and grounded all succeed. Then confirm App Check → APIs → AI Logic shows verified requests.
- [ ] **Step 3: Offline proof.**
  1. With Nano available, load the page and run one private scan.
  2. Turn off Wi-Fi **without reloading**.
  3. Run a private scan on Sample 3. Expected: results appear with the "On this device" badge.
  4. Run a cloud scan. Expected: a readable network error, not a crash.

  If the offline private scan fails because App Check or other network calls block it, write down the behavior. Then show "offline" in the video only if it works, and never claim it otherwise.
- [ ] **Step 4:** Run `git add firebase.json .firebaserc && git commit -m "chore: firebase hosting config"`.

### Task 12: Repo polish and submission (28–30 Nov)

**Files:**
- Create: `README.md`, `docs/demo-script.md`

- [ ] **Step 1:** Write `README.md` with these sections:
  - value proposition (spec §2)
  - "How we use Firebase AI Logic", covering the three modes, with links to `src/firebase/models.ts`, `scan.ts` and `research.ts`
  - Run locally: `.env.example`, the debug token steps, the Chrome flag, and the model download note
  - "Testing instructions for judges": the hosted URL, the Chrome ≥ 139 and flag steps, and the fact that the cloud path works without Nano
  - "Built during the submission period (11–30 Nov 2026)", which is required by the rules
  - a privacy note: what leaves the device and when
- [ ] **Step 2:** Run the secrets audit: `git log -p | grep -iE "debug.?token|AIza|6L[a-zA-Z0-9_-]{30,}"`. Expected: no debug tokens and no reCAPTCHA secrets. The public web API key in source is acceptable only through env vars, so it must also be absent from history.
- [ ] **Step 3:** Push to a public GitHub repo. Set About → License so it shows Apache-2.0.
- [ ] **Step 4:** Write `docs/demo-script.md`, timed to ≤ 2:50:
  - 0:00 the problem
  - 0:20 private scan of Sample 1 with Network tab clean
  - 0:55 verified quotes and dates
  - 1:15 the redaction gate with PII masked
  - 1:35 grounded UK research with suggestions and sources
  - 2:10 draft and copy
  - 2:25 unsupported-browser path to redacted cloud scan with the `IN_CLOUD` badge
  - 2:40 close

  Record the video, upload it to YouTube as public, and add English captions.
- [ ] **Step 5:** Fill in the Devpost form (Web (Chrome) platform, repo URL, hosted URL, video URL, description) by **30 Nov 12:00 PT**.

### Task 13: Chrome extension shell (option A) + Remote Config (26 Nov, droppable)

Run this after Task 11, because it needs the hosted URL. If it is not working by 27 Nov 12:00, drop it and submit the website alone.

**Files:**
- Create: `extension/manifest.json`, `extension/sidepanel.html`, `extension/sidepanel.js`, `extension/background.js`
- Modify: `src/ui/App.tsx` (accept page text from `postMessage`), `src/firebase/models.ts` (cloud model name from Remote Config)

**Decisions:**
- **Manifest:** MV3 with `"permissions": ["activeTab", "scripting", "sidePanel", "contextMenus"]` and no host permissions. The side panel is `sidepanel.html`.
- **Side panel:** contains only `<iframe src="https://<project>.web.app/?embed=1" allow="language-model">`. There is no Firebase code and no remote script in the extension. Firebase, App Check and Nano all run in the hosted page.
- **"Scan this page" button and "Scan selection" context menu:** `chrome.scripting.executeScript` returns `window.getSelection().toString()`, or `document.body.innerText` when nothing is selected. Then `iframe.contentWindow.postMessage({ type: "SMALLPRINT_TEXT", text }, "https://<project>.web.app")`.
- **App.tsx:** accept messages only when `event.origin` starts with `chrome-extension://` and `data.type === "SMALLPRINT_TEXT"`. Load the text into the input. When the text is over 6,000 characters, show it with the existing over-limit message and a hint to "select one section and use Scan selection".
- **Remote Config:** key `cloud_model`, default `"gemini-3.8-flash"`. Call `fetchAndActivate` once at startup, and fall back to the default on failure. `createModels()` reads it before the cloud models are built.

- [ ] **Step 1:** Write a unit test for the message filter, `acceptsMessage(e: { origin: string; data: unknown }): string | null`. It returns the text for a valid extension message and `null` for any other origin or type.
- [ ] **Step 2:** Run `npx vitest run`. Expected: the new test fails.
- [ ] **Step 3:** Implement the extension files, `acceptsMessage`, and Remote Config.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all tests pass. Redeploy hosting, then load `extension/` in `chrome://extensions` → Load unpacked. On a ToS page, select a clause, right-click and choose "Scan selection". Expected: results appear in the side panel with the "On this device" badge.
- [ ] **Step 5:** Run `git add -A && git commit -m "feat: chrome extension side panel and remote config"`. Zip `extension/` as a GitHub release asset.
