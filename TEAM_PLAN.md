# SmallPrint Scout: Team Plan (2 people, 16–30 Nov 2026)

## The decision (made, don't revisit)

We build **one website** first. In week 2 we wrap it in a **Chrome extension**: a side panel that shows our website and sends it the text of the page you're on.
If the extension runs late, we submit the website alone. That still qualifies.

## Who does what

| | **Alex = Builder** (rename) | **Sam = Product & Test** (rename) |
|---|---|---|
| Main job | Works with the AI coding assistant (Antigravity CLI, `agy`) to build each task in the plan | Everything that isn't code: accounts, Firebase console, test contracts, testing, story, video, Devpost |
| Owns | GitHub repo `BZcreativ/smallprint-scout` | Firebase project, Devpost entry, YouTube, Chrome Web Store listing |
| Done means | The assistant says the tests pass, and the work is saved (committed) | Sam has tried it in Chrome and it matches the checklist |

**Golden rule:** a task is only done when **Sam has tested it in Chrome**. Builder never marks their own work done.

## How the Builder works with the coding assistant

1. Open a terminal in the project folder (the clone of `smallprint-scout`) and run `agy`. It reads `AGENTS.md` automatically, and the Firebase skills in `.agents/skills/`.
2. Type: `Do Task N of docs/plans/2026-11-16-smallprint-scout.md. Stop when its tests pass, commit, and tell me in plain English what Sam should check in Chrome.`
3. Do **one task per session**. Start a fresh session for the next task.
4. Stuck for more than 45 minutes? Copy the exact error and ask the assistant "explain this simply and fix it". If that fails, ask it to "go back to the last commit". A commit is a save point, so nothing is lost.
5. Still stuck? Post the error in the hackathon Discord channel **#hackathon-help**, using the #BuildHybridAI tag.

## Daily rhythm

- **Morning (15 min call):** What got done yesterday? What's today's task? Anything blocked?
- **Evening (30 min):** The Builder shows the result, and Sam tests it with the checklist below. Write problems in `ISSUES.md`, one line each.
- Keep a shared note with the hosted website link and today's status.

## Safety rules (important)

- Never paste keys, tokens or the `.env.local` file into chat, Discord, screenshots or the video.
- Only the Builder's computer holds `.env.local`. It is never uploaded to GitHub.
- Before recording the video, close DevTools tabs that show tokens.

## Schedule

| Days | Builder (with the coding assistant) | Sam | Check together (evening) |
|---|---|---|---|
| **Mon 16 – Tue 17** | Task 1: set up the project and do the "does Nano work?" test | Create the Firebase project ([steps below](#sams-firebase-setup-day-1)). Set up Chrome on **both** laptops ([steps below](#chrome-setup-both-laptops)). Join the Discord. | **Go/no-go:** does the on-device AI give answers on our 3 sample contracts? If not, simplify (the assistant knows how). |
| **Wed 18 – Fri 20** | Tasks 2, 3, 6: input checks, quote checking, AI status | Write **9 more test contracts** for Task 10 (see list in plan). Collect 5 real ToS pages (gym, streaming, SaaS, phone, AI app). | The paste box rejects text that is too short or too long. The "AI ready" status works. |
| **Sat 21 – Mon 23** | Tasks 4, 5, 7: privacy masking, scan, main screens | Test the privacy masking with fake names, phones and card numbers. Try to break it. | **First full scan on the website.** Sam checks no text leaves the laptop on a private scan. |
| **Tue 24 – Wed 25** | Tasks 8, 9: cloud research, message drafts | Run the 12-case test (`?eval=1`) and record the score. Draft the Devpost description. | The cloud research shows sources and the Google box. Drafts copy. |
| **Thu 26** | **Extension task** (side panel + "scan this page") + Remote Config | Test the extension on the 5 real ToS pages | Does the extension work? **If not by Fri midday, drop it.** Submit the website only. |
| **Fri 27** | Task 11: put the website online | Test the live link on a third computer (a friend's, or Chrome with the AI flag off) | The live link works for a stranger |
| **Sat 28** | Task 12: README, licence, safety check | Write the video script. Rehearse twice with a timer. | — |
| **Sun 29** | Fix only what Sam found. **No new features.** | Record the video (≤ 3 min) and upload it to YouTube as public, with English captions | Watch the video together |
| **Mon 30** | On standby | **Submit on Devpost by 12:00 PT (8 PM UK)** | Done |

**Cut list.** If you fall behind, drop these in this order: extension → message drafts → US jurisdiction → key dates. The private scan, the privacy check, and cloud research with sources are the core. Never cut those.

## Sam's Firebase setup (day 1)

1. Go to console.firebase.google.com and click **Create project**. Name it `smallprint-scout` (Firebase may add a suffix to the project ID; that is fine). Google Analytics isn't needed.
2. Open **AI Services → AI Logic → Get started** and choose **Gemini Developer API**, which is free.
3. Register a **Web app**. Copy the config values into a private note and give them to the Builder only.
4. Open **Security → App Check** and set up reCAPTCHA Enterprise for the site's domain. The Builder's assistant will give you the exact domain.
5. Add the Builder as a project member with the **Editor** role.

## Chrome setup (both laptops)

1. Update Chrome: open `chrome://settings/help` and make sure it's version 139 or newer. This needs desktop Chrome, not a phone.
2. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, set it to **Enabled**, and restart Chrome.
3. The AI model downloads on first use. This takes several minutes and needs free disk space. Do it on good Wi-Fi.
4. Keep **one** Chrome profile with the flag OFF. That's how you test what a judge without on-device AI sees.

## Sam's test checklist (every evening)

- [ ] Each of the 3 sample buttons loads its sample text.
- [ ] A private scan shows the "On this device" badge.
- [ ] Quotes shown as verified really appear in the contract (search with Ctrl+F).
- [ ] With Wi-Fi off and no page reload, a private scan still works.
- [ ] In the cloud preview, fake names, phones, emails and card numbers appear as `[REDACTED_…]`.
- [ ] Prices, dates and notice periods are **not** masked.
- [ ] Cloud research shows source links and the Google search box.
- [ ] In the flag-OFF profile, the app offers a cloud scan and doesn't show an error.
- [ ] Nothing says "legal advice", and the footer disclaimer is visible.

## Submission checklist (Sam owns this)

- [ ] Public GitHub repo with the **Apache-2.0** licence showing in About
- [ ] Hosted website link that works for a stranger
- [ ] YouTube video, public, ≤ 3 min, English
- [ ] Description covering: the problem, how we use Firebase AI Logic (on-device, hybrid, cloud with Google Search), features, and **what we built 11–30 Nov**
- [ ] Testing instructions: the Chrome version, the flag, the model download wait, and the fact that the cloud path works without on-device AI
- [ ] Platform selected: **Web (Chrome)**
- [ ] Extension: Web Store link, or a zip with install steps. The Web Store route only counts if you submitted to the store by **24 Nov**; otherwise use the zip.
