# SmallPrint Scout: agent instructions

Read `docs/plans/2026-11-16-smallprint-scout.md` (build plan) and `TEAM_PLAN.md` (who does what) before starting a task.

## Firebase

- Before any Firebase work, read and follow the matching skill in `.agents/skills/` (AI Logic, Auth, Firestore, Hosting, Remote Config, rules).
- Firebase project: `buildhybridai-32b9d`. Run the CLI as `npx -y firebase-tools@latest`, never a bare `firebase`.
- Firestore rules: change `firestore.rules`, `src/domain/scan-summary.ts` and `tests/rules/` together, then run `npm run test:rules`. The emulator needs Java 21 or newer.

## Code search (XERJ)

The XERJ node must be running at `http://localhost:9200`. Search before grepping or reading whole files.

| Prefix / corpus | What it holds | Example |
|---|---|---|
| `smallprint` | this repo (code + docs) | `xerj def --prefix smallprint saveScanSummary` |
| `fbskills` | Firebase agent skills (`.agents/skills`) | `xerj search --prefix fbskills "google sign-in firebase.json"` |
| `fbaisdk` | installed `firebase/ai` SDK type definitions, the source of truth for hybrid inference APIs | `xerj def --prefix fbaisdk InferenceMode` |
| corpus `smallprint-ref` | reference repos: GoogleChromeLabs/web-ai-demos, GoogleChrome/chrome-extensions-samples, firebase/quickstart-js | `xerj search --corpus smallprint-ref "LanguageModel side panel extension"` |

Re-index after big changes. On a fresh machine, run them once:

```
xerj autoindex . --prefix smallprint
xerj autoindex .agents/skills --prefix fbskills
xerj autoindex node_modules/@firebase/ai/dist/src --prefix fbaisdk   # rerun after upgrading firebase
xerj corpus add smallprint-ref https://github.com/GoogleChromeLabs/web-ai-demos https://github.com/GoogleChrome/chrome-extensions-samples https://github.com/firebase/quickstart-js
xerj corpus index smallprint-ref
```

## Commits

Commits are credited to BZcreativ (or the teammate who made them). Do not add `Co-Authored-By` lines.
