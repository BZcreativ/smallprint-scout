# SmallPrint Scout

**"Wait, what am I signing?"** A Chrome app that reads subscription and service terms for you. It finds renewal traps, fee increases, cancellation deadlines and data-sharing clauses, and quotes the exact wording it found.

Built for [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) with **Firebase AI Logic** hybrid inference:

- **Private scan (default):** runs on-device with Gemini Nano in Chrome. The text never leaves the computer.
- **Cloud-allowed scan:** personal details are masked first, and you approve the exact text before it is sent.
- **Cloud research:** Gemini with Google Search grounding checks the clause against UK or US consumer guidance and shows its sources.

> Not legal advice. Check the original document and official guidance.

## Status

In development (16–30 Nov 2026). Everything in this repo is being built during the hackathon submission period.

## Docs

- [Spec](docs/spec.md): the product and technical spec
- [Implementation plan](docs/plans/2026-11-16-smallprint-scout.md): task-by-task build plan, with the review amendments that override the spec
- [Team plan](TEAM_PLAN.md): who does what, the schedule and the checklists

## Licence

[Apache-2.0](LICENSE)

## Run locally

1. Install Node.js 20 or newer, then run `npm install`.
2. Copy `.env.example` to `.env.local` and fill it in (see the comment at the top of the file). Never commit `.env.local`.
3. Run `npm run dev` and open the URL it prints.
4. Tests: `npm test` (logic) and `npm run test:rules` (Firestore security rules on the local emulator, needs Java 21 or newer).

Firebase project: `buildhybridai-32b9d`. Sign-in: Google. Database: Cloud Firestore, which stores scan summaries only (risk level, categories, date) and never contract text.
