# Contributing to SmallPrint Scout

Thanks for helping improve SmallPrint Scout! Before contributing, please read our [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).

## Architecture & Privacy Principles

Keep these core invariants intact across any change:

1. **Private by default (`ONLY_ON_DEVICE`):** On-device Gemini Nano scans never make network requests. Never silently fall back to the cloud when a user invokes a private scan.
2. **Explicit consent & local PII redaction:** Any cloud scan, grounded research, or cloud draft must pass through `redact()` (`src/domain/redact.ts`) and an explicit user confirmation gate before leaving the browser.
3. **Label-only Firestore history:** `users/{uid}/scans` may only store summary labels (`documentType`, `overallRisk`, `categories`, `findingCount`, `route`, `createdAt`). Never persist contract text or quotes. Update `firestore.rules`, `src/domain/scan-summary.ts`, and `tests/rules/` together.
4. **No secrets or local env files:** Never commit `.env.local`, App Check debug tokens, or personal agreement text.
5. **Extension boundary:** Keep Firebase, App Check, and AI inference inside the hosted app (`APP_ORIGIN`), and gate cross-origin reads behind `optional_host_permissions` user consent.

## Local Setup

1. Install **Node.js 20+** and run:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and populate it from your Firebase project:
   ```bash
   npx -y firebase-tools@latest apps:sdkconfig WEB <APP_ID> --project smallprint-scout
   ```
   For localhost development, set `VITE_USE_APPCHECK_DEBUG=true` in `.env.local` and register the console debug token under App Check in the Firebase Console.
3. Start the dev server:
   ```bash
   npm run dev
   ```

## Checks Before Opening a Pull Request

Run all relevant checks locally:

```bash
npm test
npm run lint
npm run build
```

- If you modify `firestore.rules` or `src/domain/scan-summary.ts`, also run (requires Java 21+):
  ```bash
  npm run test:rules
  ```
- If you modify anything in `extension/`, verify extension scripts with `node --check extension/*.js` and rebuild the archive:
  ```bash
  npm run zip:extension
  ```
- If you change `SYSTEM_PROMPT_TRIAGE` (`src/firebase/scan.ts`), run the 12-case on-device evaluation suite (`?eval=1`) in Chrome and log the run in [`docs/eval-log.md`](docs/eval-log.md).

## Pull Requests

1. Fork the repo or create a focused branch from `main`.
2. Add or update unit tests for new behavior or bug fixes.
3. Keep changes scoped and fill out the [Pull Request template](.github/PULL_REQUEST_TEMPLATE.md).
4. By submitting a pull request, you agree that your contributions will be licensed under the [Apache-2.0 License](LICENSE).
