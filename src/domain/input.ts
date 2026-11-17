// Checks a pasted contract before we spend model time on it.
// Minimum 80 characters (below that it is not worth scanning), maximum 6,000
// (the on-device token limit is 9,216, so one section at a time fits).

const MIN_LENGTH = 80;
const MAX_LENGTH = 6000;

export type ValidatedInput = { ok: true; text: string } | { ok: false; message: string };

export function validateInput(text: string): ValidatedInput {
  const trimmed = text.trim();

  if (trimmed.length < MIN_LENGTH) {
    return {
      ok: false,
      message: `Paste at least ${MIN_LENGTH} characters (you have ${trimmed.length.toLocaleString("en-GB")}).`,
    };
  }

  if (trimmed.length > MAX_LENGTH) {
    return {
      ok: false,
      message: `That's ${trimmed.length.toLocaleString("en-GB")} characters. The limit is ${MAX_LENGTH.toLocaleString("en-GB")} — paste one section at a time.`,
    };
  }

  return { ok: true, text: trimmed };
}
