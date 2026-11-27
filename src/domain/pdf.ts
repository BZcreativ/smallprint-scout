import { getDocument, GlobalWorkerOptions, VerbosityLevel } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { MAX_LENGTH } from "./input";

export const MAX_PDF_BYTES = 15 * 1024 * 1024;

// ASCII "%PDF-" header
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC[i]) return false;
  }
  return true;
}

export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  if (bytes.byteLength === 0) {
    throw new Error("That PDF file is empty.");
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error("That PDF is larger than 15 MB.");
  }
  if (!isPdfBytes(bytes)) {
    throw new Error("That file does not appear to be a valid PDF.");
  }

  if (typeof Worker !== "undefined") {
    GlobalWorkerOptions.workerSrc = workerUrl;
  }

  const loadingTask = getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    verbosity: VerbosityLevel.ERRORS,
  });

  try {
    const doc = await loadingTask.promise;
    const pages: string[] = [];
    let totalChars = 0;

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let pageText = "";

      for (const item of content.items) {
        if ("str" in item && typeof item.str === "string") {
          pageText += item.str + (item.hasEOL ? "\n" : " ");
        }
      }

      const cleaned = pageText
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join("\n");

      if (cleaned) {
        pages.push(cleaned);
        totalChars += cleaned.length + 2;
        if (totalChars >= MAX_LENGTH) break;
      }
    }

    const text = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_LENGTH);
    if (text.length < 20) {
      throw new Error("This PDF has no selectable text (it may be a scanned image).");
    }

    return { text, pageCount: doc.numPages };
  } finally {
    await loadingTask.destroy();
  }
}
