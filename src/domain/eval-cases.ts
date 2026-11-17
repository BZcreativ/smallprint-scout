import type { Finding, TriageResult } from "./types";

// The 12-case evaluation suite (amendment A10).
//
// The set is deliberately unbalanced: three real samples, three clauses that
// must come back quiet, two excerpts that cannot be judged at all, and four
// clauses that mix a real trap with reassuring filler. A prompt change is only
// an improvement if it moves the pass count without breaking a different case,
// which is why the benign and insufficient cases exist at all.

export interface EvalCase {
  id: string;
  text: string;
  expectRisk: ("LOW" | "MEDIUM" | "HIGH")[];
  mustInclude: Finding["category"][];
  mustNotFlag?: true;
  expectUnknowns?: true;
}

// The three seeded samples, verbatim (docs/spec.md §5).
const GYM = `PeakForm Fitness — 14-Day Promotional Trial & Annual Membership Terms
By activating your £1.00 14-day trial, you authorise PeakForm Fitness Ltd to automatically convert your trial into a 12-month Committed Membership at £64.99/month unless cancelled in writing at least 7 full business days before the 14th day. Following the initial 12-month minimum term, this agreement automatically renews for successive 12-month periods unless you submit a physical cancellation form via recorded delivery between 45 and 30 days prior to your renewal date. An annual "Facility Enhancement Levy" of £49.00 is billed on Day 30 and is strictly non-refundable under all circumstances. Early cancellation during the minimum term requires immediate payment of 100% of the remaining months.`;

const SUBSCRIPTION = `CloudWork Pro — Subscription & Billing Terms (Section 4)
Your annual promotional plan (£96 billed upfront, equivalent to £8/month) will automatically renew at the then-current standard list rate (currently £240/year) unless auto-renewal is disabled in Account Settings at least 30 days before the end of your billing cycle. We reserve the right to modify subscription fees at any time upon 15 days' notice sent by email; continued use constitutes acceptance. All prepaid annual fees are non-refundable, and no prorated credits or refunds will be issued for partial months or unused seats if you downgrade or cancel mid-cycle.`;

const PRIVACY = `SnapCanvas Studio — Content Licence & Dispute Resolution (Section 9 & 14)
By uploading photos, voice recordings, or documents to the Service, you grant SnapCanvas and its commercial affiliates a worldwide, perpetual, irrevocable, royalty-free, sublicensable licence to host, reproduce, modify, and use your content—including biometric facial geometry and voiceprints—to train, fine-tune, and commercialise foundational artificial intelligence models, even after you delete your account. You further agree that any dispute arising out of this Agreement shall be resolved exclusively through binding individual arbitration, and you expressly waive any right to participate in a class-action lawsuit or trial by jury.`;

export const EVAL_CASES: EvalCase[] = [
  { id: "gym-membership", text: GYM, expectRisk: ["MEDIUM", "HIGH"], mustInclude: ["RENEWAL", "CANCELLATION"] },
  { id: "subscription-renewal", text: SUBSCRIPTION, expectRisk: ["MEDIUM", "HIGH"], mustInclude: ["RENEWAL", "REFUND"] },
  { id: "privacy-ai-terms", text: PRIVACY, expectRisk: ["MEDIUM", "HIGH"], mustInclude: ["PRIVACY", "RIGHTS"] },

  // Three clauses a good answer leaves alone. They are here to catch the
  // prompt that learned to shout "HIGH" at every contract.
  {
    id: "benign-monthly-rolling",
    text: "This plan is an ordinary monthly rolling subscription at £12 per month. You can cancel at any time with one click in your account settings, and billing stops at the end of the current month.",
    expectRisk: ["LOW"],
    mustInclude: [],
    mustNotFlag: true,
  },
  {
    id: "benign-refund-policy",
    text: "If you are not satisfied, request a full refund within 14 days of purchase and we will return the whole amount to your original payment method, with no questions asked and no restocking fee.",
    expectRisk: ["LOW"],
    mustInclude: [],
    mustNotFlag: true,
  },
  {
    id: "benign-privacy-policy",
    text: "We collect only the details needed to run your account. We do not use your content to train artificial intelligence models, and we never sell your personal data to third parties or advertisers.",
    expectRisk: ["LOW"],
    mustInclude: [],
    mustNotFlag: true,
  },

  // Two excerpts too thin to judge. The only right answer is a list of what
  // is missing, so these check that `unknowns` is used at all.
  {
    id: "insufficient-billing-excerpt",
    text: "Terms summary: the plan is billed monthly at the current rate and full details of renewal and cancellation appear in the master agreement.",
    expectRisk: ["LOW", "MEDIUM", "HIGH"],
    mustInclude: [],
    expectUnknowns: true,
  },
  {
    id: "insufficient-renewal-excerpt",
    text: "Excerpt: your plan renews unless you tell us otherwise, and fees may change. See the master agreement for the full terms.",
    expectRisk: ["LOW", "MEDIUM", "HIGH"],
    mustInclude: [],
    expectUnknowns: true,
  },

  // Four mixed traps: one buried clause inside otherwise ordinary wording.
  {
    id: "trap-mid-contract-price-rise",
    text: "The monthly fee is £25 for the first six months and then rises to £32 for the remaining six months of your 12-month minimum term. We may change the fee again with 30 days' notice sent by email.",
    expectRisk: ["MEDIUM", "HIGH"],
    mustInclude: ["PRICE"],
  },
  {
    id: "trap-auto-renew-no-reminder",
    text: "This membership renews automatically for a further 12 months at the end of every term. We are not obliged to send you a reminder before it renews, or to tell you the price it renews at.",
    expectRisk: ["MEDIUM", "HIGH"],
    mustInclude: ["RENEWAL"],
  },
  {
    id: "trap-data-sale-opt-out",
    text: "We may sell your personal data to advertising partners. If you do not want your data sold, you must send a written opt-out by post within seven days of signing up for the service.",
    expectRisk: ["MEDIUM", "HIGH"],
    mustInclude: ["PRIVACY"],
  },
  {
    id: "trap-cancel-by-phone-only",
    text: "You may cancel only by telephone on our customer line between 9am and 5pm on weekdays. Requests sent by email, in writing, or through your account settings will not be accepted.",
    expectRisk: ["MEDIUM", "HIGH"],
    mustInclude: ["CANCELLATION"],
  },
];

export interface CaseScore {
  pass: boolean;
  reasons: string[];
  verifiedQuoteRate: number;
}

export function scoreCase(c: EvalCase, r: TriageResult): CaseScore {
  const reasons: string[] = [];

  if (!c.expectRisk.includes(r.overallRisk)) {
    reasons.push(`risk ${r.overallRisk} is not one of ${c.expectRisk.join("/")}`);
  }

  for (const category of c.mustInclude) {
    if (!r.findings.some((f) => f.category === category)) {
      reasons.push(`missing required category: ${category}`);
    }
  }

  if (c.mustNotFlag && r.findings.some((f) => f.severity === "HIGH")) {
    reasons.push("flagged HIGH on benign text");
  }

  // An excerpt that does not say what it costs or how to leave cannot be
  // judged, and the suite treats a confident answer to it as a failure.
  const needsUnknowns = c.expectUnknowns === true || c.id.startsWith("insufficient");
  if (needsUnknowns && r.unknowns.length === 0) {
    reasons.push("no unknowns listed on insufficient text");
  }

  const verified = r.findings.filter((f) => f.quoteVerified).length;

  return {
    pass: reasons.length === 0,
    reasons,
    verifiedQuoteRate: r.findings.length === 0 ? 0 : verified / r.findings.length,
  };
}
