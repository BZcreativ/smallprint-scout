# Security Policy

## Supported Versions

SmallPrint Scout continuously deploys from `main` to Firebase Hosting (`https://smallprint-scout.web.app`). Only the latest commit on `main` and the latest extension release in `extension/` are actively maintained:

| Surface | Supported Version |
| --- | --- |
| Hosted Web App (`main`) | Latest deployed build |
| Chrome Extension (`extension/`) | Latest `0.1.x` release |

## Security & Privacy Design

- **Client-side PII redaction:** Personal details (emails, phone numbers, postcodes, card numbers, account IDs, labelled names) are masked locally before user-approved cloud calls.
- **No remote code in the Chrome extension:** MV3 extension scripts use `optional_host_permissions` + `activeTab` and enforce an explicit `chrome-extension://` origin + `APP_ORIGIN` `postMessage` boundary.
- **App Check & Firestore isolation:** AI Logic calls require limited-use reCAPTCHA Enterprise App Check tokens (`useLimitedUseAppCheckTokens: true`), and `firestore.rules` enforce strict per-owner, immutable, label-only scan summaries.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report suspected vulnerabilities privately via GitHub Security Advisories:

- **Report privately:** <https://github.com/BZcreativ/smallprint-scout/security/advisories/new>

When reporting, include:
1. A clear description of the issue and potential impact (e.g., CSP/iframe bypass, extension privilege escalation, redactor leak, or Firestore rules bypass).
2. Minimal reproduction steps or proof-of-concept payload (without real personal data).
3. Browser, OS, and extension/commit version if applicable.

We aim to acknowledge reports within **3 business days**, keep you updated during triage, and ship fixes promptly with credit (if desired) once resolved.
