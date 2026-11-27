import type { ScanEnvelope } from "../firebase/scan";

// Renders a finished scan as a shareable Markdown audit report: the same
// content the results screen shows, formatted to paste into a doc or email.
// Text only — no contract text is included beyond the flagged quotes.

export function formatAuditReport(scan: ScanEnvelope, sourceLength: number): string {
  const { data } = scan;
  const lines: string[] = [];

  lines.push("# Audit report", "");
  lines.push(
    `- **Risk level:** ${data.overallRisk}`,
    `- **Document type:** ${data.documentType}`,
    `- **Route:** ${scan.route}`,
    `- **Scanned:** ${sourceLength.toLocaleString("en-GB")} characters`,
    `- **Duration:** ${scan.durationMs.toLocaleString("en-GB")} ms`,
    "",
  );
  lines.push("## Summary", "", data.summary || "No summary.", "");

  if (data.findings.length > 0) {
    lines.push("## Findings", "");
    data.findings.forEach((finding, index) => {
      lines.push(`${index + 1}. **${finding.category} — ${finding.severity}**`, "", finding.plainEnglish, "");
      if (finding.quote) {
        const tag = finding.quoteVerified ? "verified" : "unverified — check the original";
        lines.push(`   > ${finding.quote.replace(/\r?\n/g, " ")} (${tag})`, "");
      }
      if (finding.whyItMatters) lines.push(`   Why it matters: ${finding.whyItMatters}`, "");
      if (finding.nextStep) lines.push(`   What to do: ${finding.nextStep}`, "");
    });
  } else {
    lines.push("## Findings", "", "No findings.", "");
  }

  if (data.keyDates.length > 0) {
    lines.push("## Key dates", "");
    for (const keyDate of data.keyDates) {
      const tag = keyDate.sourceVerified ? "verified" : "unverified";
      lines.push(`- **${keyDate.event}** — ${keyDate.dateOrTrigger}: ${keyDate.sourceQuote.replace(/\r?\n/g, " ")} (${tag})`);
    }
    lines.push("");
  }

  if (data.unknowns.length > 0) {
    lines.push("## Unknowns", "");
    for (const unknown of data.unknowns) lines.push(`- ${unknown}`);
    lines.push("");
  }

  lines.push("---", "", "Not legal advice. Check the original document and official guidance.");
  return lines.join("\n");
}
