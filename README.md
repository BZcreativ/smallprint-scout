# SmallPrint Scout

**"Wait, what am I signing?"** SmallPrint Scout is a Chrome app that reads subscription and service terms for you. It finds renewal traps, fee increases, cancellation deadlines and data-sharing clauses, and quotes the exact wording it found.

Built for [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) with **Firebase AI Logic** hybrid inference:

- **Private scan (default):** runs on-device with Gemini Nano in Chrome. The text never leaves the computer.
- **Cloud-allowed scan:** personal details are masked first, and you approve the exact text before it is sent.
- **Cloud research:** Gemini with Google Search grounding checks the clause against UK or US consumer guidance and shows its sources.

> Not legal advice. Check the original document and official guidance.

- Hosted app: <https://smallprint-scout.web.app>
- Source: <https://github.com/BZcreativ/smallprint-scout>

## Value proposition

SmallPrint Scout helps everyday consumers uncover the hidden renewal traps, fee hikes, cancellation deadlines and data-sharing rules buried in subscription and service agreements. A strict, local-by-default first pass runs on-device through Firebase AI Logic, and it escalates to grounded cloud Gemini research only after explicit consent and local PII redaction ([spec §2](docs/spec.md)).

Why that architecture: instead of silently falling back to the cloud when a user expects privacy, the app exposes all three inference modes on purpose, so the trade-off is the user's choice and never a surprise. And because every warning card needs a verbatim `quote` that a client-side validator checks against the text, a finding that cannot be verified is shown as unverified rather than presented as fact.

## How we use Firebase AI Logic

All inference goes through `firebase/ai`, wrapped in [`src/firebase/models.ts`](src/firebase/models.ts). Five model objects, one per path:

| What the user gets | `InferenceMode` | Model object |
|---|---|---|
| Private scan, nothing leaves the machine | `ONLY_ON_DEVICE` | `models.local` |
| Opt-in hybrid scan with cloud fallback | `PREFER_ON_DEVICE` | `models.hybrid` |
| Grounded research, cloud only | `ONLY_IN_CLOUD` + `googleSearch` | `models.grounded`, `models.groundedFallback` |
| Action drafts, private or hybrid/cloud | `ONLY_ON_DEVICE` / `PREFER_ON_DEVICE` / `ONLY_IN_CLOUD` | `models.draftLocal`, `models.draftHybrid`, `models.draftCloud`, `models.draftCloudFallback` |

- **`ONLY_ON_DEVICE` is the default.** A private scan never contacts Google, even if the on-device model would fail. When Gemini Nano is missing, the screen offers the redacted cloud scan instead of throwing.
- **`PREFER_ON_DEVICE` and cloud fallbacks.** When a cloud triage, grounded research, or cloud draft call hits a transient `500`/`503`/`429`, high-demand, or timeout error on `gemini-3.8-flash` (within a 90 s timeout window covering App Check + inference), the app automatically falls back to `gemini-3.5-flash-lite`. The UI shows which route was actually taken, read from `response.inferenceSource` in [`src/firebase/scan.ts`](src/firebase/scan.ts) (`toRoute`, where a missing report shows as unknown).
- **Long-policy support (up to 120,000 characters).** On-device scans over 6,000 characters (`SINGLE_PASS_MAX`) automatically split on paragraph boundaries via `chunkText` and `runLongScan`, deduplicating findings and verifying verbatim quotes per section. Cloud scans process long agreements up to 120,000 characters in a single pass.
- **`ONLY_IN_CLOUD` with Google Search grounding** is the research pass in [`src/firebase/research.ts`](src/firebase/research.ts). It runs only on text the user has already redacted and approved, and it degrades to "no sources" when the model answers without searching.
- **Structured output both ways.** The same `triageSchema` ([`src/domain/schema.ts`](src/domain/schema.ts)) is passed as `responseConstraint` on-device and as `responseSchema` with `responseMimeType: "application/json"` in cloud, so both routes return the same JSON shape.
- **Firebase Auth (Google Sign-In).** `signInWithPopup` with `GoogleAuthProvider` in [`src/firebase/auth.ts`](src/firebase/auth.ts); the signed-in user owns their scan history.
- **Cloud Firestore, label-only scan history.** [`src/firebase/scans.ts`](src/firebase/scans.ts) writes to `users/{uid}/scans`. Each document holds `documentType`, `overallRisk`, `categories`, `findingCount`, `route` and `createdAt` only, which [`firestore.rules`](firestore.rules) enforces field by field and keeps immutable.
- **App Check.** `setupAppCheck()` in [`src/firebase/app.ts`](src/firebase/app.ts) uses reCAPTCHA Enterprise, and every model is created with `useLimitedUseAppCheckTokens: true` so AI Logic requests carry a single-use token.
- **Remote Config.** The cloud model name comes from the `cloud_model` key (default `gemini-3.8-flash`), fetched and activated once at startup, so the model can be changed without a redeploy.

## Enable on-device AI

Private scans need Chrome's built-in model. On a profile without it, the app says so and points at the redacted cloud scan. The "How to enable" link in [`src/ui/ModelStatus.tsx`](src/ui/ModelStatus.tsx) lands on this section.

1. Use Chrome desktop **139 or newer**, on Windows, macOS, Linux or ChromeOS, with at least 22 GB free disk space.
2. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and set it to **Enabled**.
3. Restart Chrome.
4. Open the app and click **Enable private on-device AI**. That single click is the user gesture `initializeDeviceModel()` needs; the download starts, the progress bar fills, and the model stays on the device for later visits.

## Run locally

1. Install Node.js 20 or newer, then run `npm install`.
2. Copy [`.env.example`](.env.example) to `.env.local` and fill it from `npx -y firebase-tools@latest apps:sdkconfig WEB <APP_ID> --project smallprint-scout`. Never commit `.env.local`.
3. **App Check debug token** (local only, because localhost is not a registered reCAPTCHA Enterprise domain): set `VITE_USE_APPCHECK_DEBUG=true` in `.env.local`, run the app, copy the debug token it prints to the browser console, and register it under App Check → Apps → Manage debug tokens in the Firebase console. Without it, AI Logic rejects the request.
4. Run `npm run dev` and open the URL it prints.
5. Tests: `npm test` for the logic suite, and `npm run test:rules` for the Firestore security rules on the local emulator (needs Java 21 or newer).
6. Deploy: `npm run build && npx -y firebase-tools@latest deploy --only hosting,firestore:rules --project smallprint-scout`.

## Testing instructions for judges

1. **Hosted app:** open <https://smallprint-scout.web.app> in Chrome desktop 139 or newer and sign in with Google from the header.
2. **On-device path:** if the model is not enabled yet, follow [Enable on-device AI](#enable-on-device-ai), then click **Enable private on-device AI** and wait for the download. Load Sample 1, choose **Private Scan**, and results arrive with the **On this device** badge. Keep the Network tab open while you do it: no request goes to Google for the scan.
3. **Cloud path, no Gemini Nano needed:** in any browser, load a sample and choose **Scan with cloud (redacted)**. The redaction gate shows the exact text to be sent, with emails, phones, postcodes, account IDs and names masked and prices and notice periods intact. Approve it and the results carry the **Google Cloud (redacted text)** badge. This path works in Safari, Firefox, or Chrome without the flag.
4. **Grounded research:** from the results, choose **Research Clause in Cloud** and pick UK or US guidance. The answer comes back in four Markdown sections with a sources list, and a run where the model did not search says so instead of inventing sources.
5. **Chrome extension (`extension/`, v0.1.1):** load [`extension/`](extension) from `chrome://extensions` (Developer mode → Load unpacked) and open its side panel. Toggle **Auto-detect on this site** (opt-in via `optional_host_permissions`, EN/FR/DE/ES/IT heuristics) to spot and highlight consent popups, checkboxes, buttons, and policy links in a closed Shadow DOM overlay with zero host-DOM mutation. Click **Scan** on a Terms/Privacy link to fetch the full policy text into the side panel, click **Scan this page** (prefers open consent modals over background copy), or select a clause and right-click → **Scan selection**.
6. **Evaluation suite:** on a machine with the on-device model, open `?eval=1` and click **Run the 12 cases on this device**. Target: at least 10 of 12 pass with at least 80% of quotes verified, recorded in [`docs/eval-log.md`](docs/eval-log.md).

## Built during the submission period (11–30 Nov 2026)

Everything in this repository was written during the hackathon submission period, 11–30 November 2026: the domain layer (types, schema, input validation, quote verification), the PII redactor, the on-device and hybrid scan paths, the grounded research pass, the input, redaction-gate, results, research, draft and evaluation screens, the 12-case evaluation suite, the Firestore rules, the hosting configuration, the Chrome extension and these docs. There is no pre-existing product code behind it.

## Privacy

- **What stays on the device:** with `ONLY_ON_DEVICE` (the default) the agreement text and the full JSON result never leave the computer, and the scan makes no network request.
- **What is masked before any cloud call:** [`src/domain/redact.ts`](src/domain/redact.ts) masks emails, card numbers, labelled account IDs, phone numbers, postcodes and labelled names. The [`src/ui/RedactionGate.tsx`](src/ui/RedactionGate.tsx) gate then shows the exact outbound text in an editable box, with a count of the masked items, and nothing is sent before the user approves it.
- **What Firestore stores:** summary labels only, namely `overallRisk`, `documentType`, `categories`, `findingCount`, `route` and `createdAt`. Never the contract text, the quotes or anything the user typed, and the rules reject a document with any extra field.
- **No secrets in the repo:** App Check debug tokens stay in the browser and the Firebase console, the reCAPTCHA key comes from `.env.local`, and the public Web API key is read from the environment and never committed. The audit is described in [the implementation plan](docs/plans/2026-11-16-smallprint-scout.md).

## Docs

- [Spec](docs/spec.md): the product and technical spec
- [Implementation plan](docs/plans/2026-11-16-smallprint-scout.md): task-by-task build plan, with the review amendments that override the spec
- [Demo script](docs/demo-script.md): the 2:50 walkthrough, beat by beat
- [Evaluation log](docs/eval-log.md): the 12-case suite, the target and the recorded runs
- [Team plan](TEAM_PLAN.md): who does what, the schedule and the checklists

## Licence

[Apache-2.0](LICENSE)
