// The Chrome extension sends the text of a page (or of a selection) into the
// app with postMessage. A page in any other tab can post messages too, so the
// message is only used when it comes from another extension and carries the
// shape the extension sends.

const EXTENSION_ORIGIN_PREFIX = "chrome-extension://";
const MESSAGE_TYPE = "SMALLPRINT_TEXT";

export interface ExtensionMessage {
  origin: string;
  data: unknown;
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
