# Demo script: SmallPrint Scout (2:50, hard stop)

Screen recording of the hosted app at <https://smallprint-scout.web.app> in Chrome desktop 139+ with Gemini Nano already downloaded, plus one second browser without the flag for the 2:25 beat. Nothing is claimed that the recording does not show: if the offline or on-device beat fails on the day, say so on camera and show the redacted cloud path instead.

Record at 1080p with the Network tab visible from 0:20 to 0:55, and upload to YouTube as public with English captions.

| Time | Beat | On screen | Voice-over |
|---|---|---|---|
| **0:00** | The problem | Sample 1 (`gym-membership.txt`) scrolled slowly past the trial conversion, the 12-month lock-in, the levy and the "physical cancellation form via recorded delivery" line. | "You agreed to this in four seconds. The traps are on line nine: a £1 trial that becomes £64.99 a month, a levy that is never refundable, and a cancellation route that is almost impossible to use." |
| **0:20** | Private scan of Sample 1, Network tab clean | Click **Private Scan**. Badge reads **On this device**. The Network tab stays empty for the whole run. Timer shows the duration in ms. | "This is Firebase AI Logic on-device: Gemini Nano, running inside Chrome. The contract never leaves this laptop. There is no request to Google, and the Network tab is empty because there is nothing to send." |
| **0:55** | Verified quotes and dates | Scroll the finding cards: each quote is highlighted verbatim in the source text; one card shows the **Unverified quote — check the original** chip instead of a quote. Then the key dates: the 7-business-day window, the 45-to-30-day renewal window. | "Every finding has to quote the contract word for word, and we check that quote against your text before it is shown. If it does not match, we say so instead of trusting it. Dates come out as dates: 7 business days to cancel the trial, a 45-to-30-day window to stop the renewal." |
| **1:15** | Redaction gate with PII masked | Click **Research Clause in Cloud**. The gate shows the payload with `[REDACTED_EMAIL]`, `[REDACTED_PHONE]`, `[REDACTED_POSTCODE]`, `[REDACTED_ID]`, `[REDACTED_NAME]`, the masked-item count, prices and notice periods still readable, and the editable box. | "Research needs the cloud, so we ask first. Before anything leaves, we mask emails, phone numbers, postcodes, account IDs and names, and we keep the prices and deadlines, because a redacted clause that does not say what it costs is useless. You see the exact text and you can edit it. Nothing is sent until you approve." |
| **1:35** | Grounded UK research with suggestions and sources | Jurisdiction set to **UK**. Click approve. The answer renders the four sections (what the clause requires, relevant guidance, what we cannot determine, questions to ask), followed by the sources list and the search suggestions block. | "This is Gemini with Google Search grounding, checked against CMA and gov.uk guidance. It says what the clause requires, what the regulator says about it, what it cannot determine from the excerpt, and what to ask before signing. And it shows its work: these are the pages it read." |
| **2:10** | Draft and copy | Click **Draft a Message**, edit one sentence, then **Copy**. Paste into a notes window to show the copied text. | "Then it writes the message for you: the cancellation notice, with the deadline and the exact clause quoted. Edit it, copy it, send it." |
| **2:25** | Unsupported-browser path to the redacted cloud scan with the `IN_CLOUD` badge | In the second browser without Gemini Nano: open the app, show the honest "On-device AI isn't available in this browser" message, paste Sample 3, click **Scan with cloud (redacted)**, approve the gate, and show the **Google Cloud (redacted text)** badge on the results. | "No Nano on this browser? We say so, and we do not pretend. The redacted cloud scan does the same triage. The badge reads Google Cloud, because the badge reports the route it actually took, not the route we hoped for." |
| **2:40** | Close | Back on the first browser, the Chrome side panel scanning a clause from a live terms page, then the title screen: SmallPrint Scout, hosted URL, Apache-2.0. | "Private by default. Cloud only when you say so, and only after redaction. Read what you are signing, before you sign it." |

## Before recording

- Chrome: Nano downloaded (click **Enable private on-device AI** once, wait for 100%), one private scan already run so the model is warm.
- Second browser: a normal Chrome profile with `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` set back to **Default**, or Firefox.
- Signed in with Google on both, so the header and the scan history are settled.
- Close every other tab and notification, and keep the Network tab pinned and clear at 0:20.
- Walk the whole route once untimed, then record in a single take; a 2:50 cap leaves no room for a second attempt mid-video.

## Do not claim

- Do not say "offline" unless the scan really ran with Wi-Fi off and no reload; if it did, show it, otherwise skip it.
- Do not say "legal advice", "guaranteed", or "we detect every trap". The app says "may raise fairness concerns", and so does the script.
- Do not say the research is live if the model answered without searching; check for the sources list first.
