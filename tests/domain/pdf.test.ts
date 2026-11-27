import { expect, test } from "vitest";
import { extractPdfText, isPdfBytes } from "../../src/domain/pdf";

// Builds a minimal valid single-page uncompressed PDF containing the supplied ASCII line.
function buildMinimalPdf(line: string): Uint8Array {
  const escaped = line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${escaped}) Tj\nET\n`;

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}

test("isPdfBytes recognises %PDF- magic header", () => {
  expect(isPdfBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe(true);
  expect(isPdfBytes(new TextEncoder().encode("<html>hello</html>"))).toBe(false);
});

test("extractPdfText extracts readable text from a valid PDF locally", async () => {
  const bytes = buildMinimalPdf("PeakForm Fitness monthly fee is 64.99 pounds and auto renews every 12 months.");
  const result = await extractPdfText(bytes);

  expect(result.pageCount).toBe(1);
  expect(result.text).toContain("PeakForm Fitness monthly fee is 64.99 pounds");
});

test("extractPdfText rejects non-PDF bytes", async () => {
  await expect(extractPdfText(new TextEncoder().encode("<html>not a pdf</html>"))).rejects.toThrow(/valid PDF/);
});
