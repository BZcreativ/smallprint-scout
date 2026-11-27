// The Chrome extension sends the text of a page (or of a selection) into the
// app with postMessage. A page in any other tab can post messages too, so the
// message is only used when it comes from another extension and carries the
// shape the extension sends.

const EXTENSION_ORIGIN_PREFIX = "chrome-extension://";
const MESSAGE_TYPE = "SMALLPRINT_TEXT";
const PDF_MESSAGE_TYPE = "SMALLPRINT_PDF";
const MAX_PDF_BYTES = 15 * 1024 * 1024;

export interface ExtensionMessage {
  origin: string;
  data: unknown;
}

export interface PdfExtensionPayload {
  bytes: Uint8Array;
  filename?: string;
}

// Returns the text of a valid extension message, or null for anything else:
// a message from a web page, the wrong message type, or a payload that is not
// an object with a string `text`.
export function acceptsMessage(e: ExtensionMessage): string | null {
  if (typeof e.origin !== "string" || !e.origin.startsWith(EXTENSION_ORIGIN_PREFIX)) {
    return null;
  }

  if (typeof e.data !== "object" || e.data === null) {
    return null;
  }

  const data = e.data as Record<string, unknown>;
  if (data.type !== MESSAGE_TYPE) {
    return null;
  }

  if (typeof data.text !== "string") {
    return null;
  }

  return data.text;
}

export function acceptsPdfMessage(e: ExtensionMessage): PdfExtensionPayload | null {
  if (typeof e.origin !== "string" || !e.origin.startsWith(EXTENSION_ORIGIN_PREFIX)) {
    return null;
  }

  if (typeof e.data !== "object" || e.data === null) {
    return null;
  }

  const data = e.data as Record<string, unknown>;
  if (data.type !== PDF_MESSAGE_TYPE) {
    return null;
  }

  const raw = data.bytes;
  let bytes: Uint8Array | null = null;
  if (ArrayBuffer.isView(raw)) {
    bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  } else if (raw instanceof ArrayBuffer || Object.prototype.toString.call(raw) === "[object ArrayBuffer]") {
    bytes = new Uint8Array(raw as ArrayBuffer);
  }

  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES) {
    return null;
  }

  return {
    bytes,
    filename: typeof data.filename === "string" && data.filename.trim() ? data.filename.trim() : undefined,
  };
}
