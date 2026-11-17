# Evaluation log: the 12-case on-device suite

The suite runs the real prompt on the real device model, the way a user meets it, and scores every answer the same way. It is reached at `?eval=1` and linked nowhere in the UI, so it never appears in a demo by accident.

- Cases and scoring: [`src/domain/eval-cases.ts`](../src/domain/eval-cases.ts)
- Runner: [`src/ui/EvalRunner.tsx`](../src/ui/EvalRunner.tsx)
- Prompt under test: `SYSTEM_PROMPT_TRIAGE` in [`src/firebase/scan.ts`](../src/firebase/scan.ts)

## Target

**At least 10 of 12 cases pass, with at least 80% of all quotes verified.**

The runner shows both numbers after a run: `N/12 pass` and `N% of quotes verified (verified/findings)`. If a run falls short, tune `SYSTEM_PROMPT_TRIAGE` only. Do not weaken a case to make it pass, because the benign and insufficient cases are what stop the prompt from shouting "HIGH" at every contract.

## How to run it

1. Use Chrome desktop 139+ with Gemini Nano downloaded (see [Enable on-device AI](../README.md#enable-on-device-ai)).
2. Open `https://smallprint-scout.web.app/?eval=1`.
3. Click **Run the 12 cases on this device** and leave the tab alone. Each case runs one at a time on `models.local`, so a full run takes several minutes; rows appear as they land.
4. Record the summary line and each failing row in the table below, then commit the updated log.

## Scoring rules

A case passes when all of these hold:

- `overallRisk` is one of the case's expected values.
- Every category in `mustInclude` appears in at least one finding.
- A `mustNotFlag` case has no finding at severity `HIGH`.
- An `expectUnknowns` case (or any `insufficient-*` case) lists at least one item in `unknowns`.

A case that throws is a failure with the error message as its reason; the scan has already retried once by then.

## The 12 cases

| # | Case id | What it checks | Expected risk | Must include | Record result |
|---|---|---|---|---|---|
| 1 | `gym-membership` | Sample 1 verbatim: trial conversion, 12-month lock-in, non-refundable levy, recorded-delivery cancellation | MEDIUM or HIGH | `RENEWAL`, `CANCELLATION` | |
| 2 | `subscription-renewal` | Sample 2 verbatim: auto-renewal at the list rate, 15-day fee change notice, no refunds | MEDIUM or HIGH | `RENEWAL`, `REFUND` | |
| 3 | `privacy-ai-terms` | Sample 3 verbatim: perpetual AI licence over biometric data, arbitration and class-action waiver | MEDIUM or HIGH | `PRIVACY`, `RIGHTS` | |
| 4 | `benign-monthly-rolling` | Ordinary monthly plan, one-click cancel: must stay quiet | LOW | none (no `HIGH`) | |
| 5 | `benign-refund-policy` | 14-day full refund, no restocking fee: must stay quiet | LOW | none (no `HIGH`) | |
| 6 | `benign-privacy-policy` | No AI training, no data sales: must stay quiet | LOW | none (no `HIGH`) | |
| 7 | `insufficient-billing-excerpt` | Billing excerpt without renewal or cancellation terms: must list unknowns | any | none, but `unknowns` | |
| 8 | `insufficient-renewal-excerpt` | "Renews unless you tell us otherwise": must list unknowns | any | none, but `unknowns` | |
| 9 | `trap-mid-contract-price-rise` | A fee rise buried in ordinary wording | MEDIUM or HIGH | `PRICE` | |
| 10 | `trap-auto-renew-no-reminder` | Auto-renewal with no reminder duty and no price disclosure | MEDIUM or HIGH | `RENEWAL` | |
| 11 | `trap-data-sale-opt-out` | Data sale with a postal, seven-day opt-out | MEDIUM or HIGH | `PRIVACY` | |
| 12 | `trap-cancel-by-phone-only` | Cancellation only by phone in office hours | MEDIUM or HIGH | `CANCELLATION` | |

## Recorded runs

Add one row per run. Keep rejected runs too: the tuning log only makes sense against them.

| Run | Date (UTC) | Browser and Chrome version | Commit | Pass | Quotes verified | Failing cases and why | Prompt change made after this run |
|---|---|---|---|---|---|---|---|
| 1 | | | | /12 | % (/) | | |

## Tuning log

Record each change to `SYSTEM_PROMPT_TRIAGE` with the run it followed. One change per run, so the effect of each sentence is measurable.

| After run | Sentence added or removed | Deliberately kept | Result |
|---|---|---|---|
| | | | |

## What counts as an improvement

A prompt change is only an improvement if it moves the pass count up without breaking a different case. A run that gains a trap, for example `trap-data-sale-opt-out`, but starts flagging `benign-privacy-policy` as `HIGH` is not better: it has traded a missed trap for a false alarm on a fair policy, which is the failure mode the benign and insufficient cases exist to catch.
