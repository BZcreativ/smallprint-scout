// Checks a pasted contract before we spend model time on it, and cuts a long
// one into chunks the model can read. Minimum 80 characters (below that it is
// not worth scanning). The maximum is an abuse guard, not a model limit:
// anything longer than one on-device prompt is scanned chunk by chunk instead
// (see runLongScan in src/firebase/scan.ts).

const MIN_LENGTH = 80;
export const MAX_LENGTH = 120_000;

// What one on-device prompt can carry: the Prompt API's session is ~9,216
// tokens, shared by the triage prompt, the response schema and the JSON
// answer, so ~6,000 characters of contract text fits with headroom.
export const SINGLE_PASS_MAX = 6_000;

export type ValidatedInput = { ok: true; text: string } | { ok: false; message: string };

function looksLikeBinary(text: string): boolean {
  if (text.startsWith("%PDF-")) return true;
  const sample = text.slice(0, 2000);
  let controlCount = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if ((code <= 0x08) || (code >= 0x0e && code <= 0x1f) || code === 0xfffd) {
      controlCount++;
      if (controlCount >= 5) return true;
    }
  }
  return false;
}

export function validateInput(text: string): ValidatedInput {
  const trimmed = text.trim();

  if (looksLikeBinary(trimmed)) {
    return {
      ok: false,
      message: "That looks like a raw PDF or binary file rather than readable text. Upload the PDF or paste plain text instead.",
    };
  }

  if (trimmed.length < MIN_LENGTH) {
    return {
      ok: false,
      message: `Paste at least ${MIN_LENGTH} characters (you have ${trimmed.length.toLocaleString("en-GB")}).`,
    };
  }

  if (trimmed.length > MAX_LENGTH) {
    return {
      ok: false,
      message: `That's ${trimmed.length.toLocaleString("en-GB")} characters. The limit is ${MAX_LENGTH.toLocaleString("en-GB")} — paste the sections that matter.`,
    };
  }

  return { ok: true, text: trimmed };
}

// Cuts text into pieces of at most `max` characters, breaking at the last
// paragraph boundary inside each window (then line break, sentence, space) so
// a clause is never cut mid-sentence when the text has any break at all.
// Every chunk is a verbatim slice of the input, so quotes the model lifts
// from a chunk still verify against the full original text.
export function chunkText(text: string, max: number = SINGLE_PASS_MAX): string[] {
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    if (text.length - start <= max) {
      chunks.push(text.slice(start).trim());
      break;
    }

    const head = text.slice(start, start + max);
    let cut = head.lastIndexOf("\n\n");
    if (cut < max / 2) cut = head.lastIndexOf("\n");
    if (cut < max / 2) cut = head.lastIndexOf(". ");
    if (cut < max / 2) cut = head.lastIndexOf(" ");
    const end = cut >= max / 2 ? start + cut + 1 : start + max;

    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}
