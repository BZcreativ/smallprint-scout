# Inference spike notes (Task 1, 17 Nov 2026)

Goal: prove that Gemini Nano on-device returns usable structured JSON for the three seeded
contracts *before* any UI is built. Every later task depends on the answers below.

## What the harness is

- `spike.html` at the repo root (dev only, not part of `vite build`): sample selector with the
  three files in `public/samples/`, three buttons, and `<pre id="output">`.
- `src/spike.ts`: creates AI with `getAI(firebaseApp, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true })`,
  then builds one model per button and runs the same prompt against the selected sample.
- `src/firebase/app.ts`: `firebaseApp`, `auth`, `db` plus `setupAppCheck()`. App Check is
  initialised once at module load, before any `firebase/ai` call, from `ReCaptchaEnterpriseProvider`
  using `VITE_RECAPTCHA_SITE_KEY`. Without a site key it returns `undefined` instead of throwing.
- `src/types/prompt-api.d.ts`: minimal global `LanguageModel` declaration used to report the
  on-device model's availability in the harness.

The three modes use `HybridParams` (`{ mode, onDeviceParams?, inCloudParams? }`), verified against
the installed `@firebase/ai` types:

| Button | Params | Expectation |
| --- | --- | --- |
| `ONLY_ON_DEVICE` | `mode: InferenceMode.ONLY_ON_DEVICE` (`"only_on_device"`), `onDeviceParams.promptOptions.responseConstraint` | `inferenceSource: "on_device"`, parseable JSON, ≥ 1 finding |
| `PREFER_ON_DEVICE` | `mode: InferenceMode.PREFER_ON_DEVICE` (`"prefer_on_device"`), same constraint plus `inCloudParams` (`gemini-3.8-flash` + `responseSchema`) | `"on_device"`, or `"in_cloud"` while Nano is still downloading |
| `ONLY_IN_CLOUD + Google Search` | `mode: InferenceMode.ONLY_IN_CLOUD` (`"only_in_cloud"`), `inCloudParams: { model: "gemini-3.8-flash", tools: [{ googleSearch: {} }] }` | `"in_cloud"`, `groundingChunks` and `searchEntryPoint.renderedContent` present |

Both structured-output paths must be configured on a hybrid model: `onDeviceParams.promptOptions.responseConstraint`
for Nano and `inCloudParams.generationConfig.responseSchema` for the cloud fallback. The spike
serialises the schema with `JSON.parse(JSON.stringify(schema))` because `Schema#toJSON` is marked
internal and stripped from the public types, while the Prompt API needs a plain JSON schema.

The system prompt is prepended to the prompt string (amendment A7), never passed as
`systemInstruction`.

## How to run it

1. `.env.local`: fill the `VITE_FIREBASE_*` values, then set `VITE_RECAPTCHA_SITE_KEY` and
   `VITE_USE_APPCHECK_DEBUG=true`.
2. `npm run dev`, then open <http://localhost:5173/spike.html> in Chrome desktop 139 or newer with
   `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled. Desktop Chrome only; the
   flag, hardware support and storage all have to line up.
3. Open DevTools once on load: the App Check SDK prints `AppCheck debug token: "<uuid>"`. Register
   that UUID in Firebase Console → App Check → Apps → Manage debug tokens. Never commit it and never
   hardcode it in client code.
4. Run AI Logic → Get started (Gemini Developer API) and confirm App Check shows **Enforced** under
   AI Logic before expecting on-device calls to succeed.

Each click: loads the selected sample, calls `initializeDeviceModel()` for the on-device and hybrid
buttons (it must run on or after a user gesture, which is why it lives in the click handler), then
`generateContent`. The harness logs, per run: sample size, download progress, `inferenceSource`
(`"on_device"` / `"in_cloud"`, never assumed), the raw text, `candidates[0].groundingMetadata`,
and a parse summary with the count of quotes found verbatim in the sample after quote/dash
normalisation.

## Gate: schema fallback

If Nano's output fails to parse on 2 of the 3 samples, simplify the schema now, in this order, and
rerun until it parses:

1. Drop `confidence` from each finding.
2. Drop `keyDates`.
3. Drop `whyItMatters` if it is still failing, and record the smaller schema in `docs/spike-notes.md`
   so Task 2's `src/domain/schema.ts` and Task 10's evaluation cases match reality.

If an on-device run throws instead of returning JSON (`ONLY_ON_DEVICE` does not fall back), keep the
cloud paths as the production path for that browser and surface the unsupported state in the UI
(Task 6 `getDeviceStatus`), rather than retrying in a loop.

## Results

| Date | Chrome | Mode | Sample | inferenceSource | JSON parsed | Verified quotes | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pending | | `ONLY_ON_DEVICE` | gym-membership | | | | |
| pending | | `ONLY_ON_DEVICE` | subscription-renewal | | | | |
| pending | | `ONLY_ON_DEVICE` | privacy-ai-terms | | | | |
| pending | | `PREFER_ON_DEVICE` | gym-membership | | | | |
| pending | | `ONLY_IN_CLOUD + Google Search` | subscription-renewal | | | | grounding + `searchEntryPoint` |

The spike needs a machine with Chrome 139+, the Prompt API flag on, and a working reCAPTCHA
Enterprise key, so the runs above stay `pending` until someone with that setup records them.
