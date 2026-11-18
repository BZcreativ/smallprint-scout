/* global chrome */

// The service worker owns the side panel and the context menu.
//
// It reads the text of the page for the context menu and relays it to the
// panel, which is the part that talks to the app.

const CONTEXT_MENU_ID = "scan-selection";
const ORIGINS_KEY = "scout-origins";

// The text of the last scan, kept until the panel has taken it.
let pendingText = null;

// Same one-liner as in sidepanel.js: the service worker is a classic script
// and cannot import the module that holds it.
function scriptId(origin) {
  return "scout-detect-" + origin.replace(/^[a-z]+:\/\//i, "").replace(/[^a-z0-9.-]+/gi, "-");
}

// Dynamic content-script registrations do not survive an extension reload or
// update, so every startup the enabled origins are re-registered from storage.
// Safe to run repeatedly: already-registered ids are skipped.
async function restoreAutoDetect() {
  let origins = [];
  try {
    const stored = await chrome.storage.sync.get({ [ORIGINS_KEY]: [] });
    origins = stored[ORIGINS_KEY] || [];
  } catch {
    return;
  }

  let registered = [];
  try {
    registered = await chrome.scripting.getRegisteredContentScripts();
  } catch {
    return;
  }
  const have = new Set(registered.map((s) => s.id));

  for (const origin of origins) {
    if (have.has(scriptId(origin))) continue;
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: scriptId(origin),
          matches: [origin + "/*"],
          js: ["detect-core.js", "detect.js"],
          runAt: "document_idle",
          allFrames: true,
          persistAcrossSessions: true,
        },
      ]);
    } catch {
      // The origin's permission was revoked in settings: leave it off.
    }
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(restoreAutoDetect);
chrome.runtime.onStartup.addListener(restoreAutoDetect);

chrome.runtime.onInstalled.addListener(() => {
  // Removed first: a reloaded extension still has the old item.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "Scan selection",
      contexts: ["selection", "page"],
    });
  });
});

// The selection when there is one, the whole page otherwise.
function readText() {
  const selection = window.getSelection();
  const selected = selection ? selection.toString().trim() : "";
  return selected || document.body.innerText;
}

// Reads the text of a tab.
async function readPage(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: readText,
  });

  return results && results[0] ? results[0].result : "";
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab || typeof tab.id !== "number") return;

  // The panel is opened straight away: Chrome only allows that during the
  // click that asked for it.
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
    // Chrome refuses to open the panel outside a user gesture.
  });

  readPage(tab.id)
    .then((text) => {
      pendingText = text;

      // A panel that is already up gets the text now; one that is still
      // loading picks it up when it asks for it.
      chrome.runtime
        .sendMessage({ type: "SMALLPRINT_TEXT", text })
        .catch(() => {
          // No panel to receive it yet.
        });
    })
    .catch(() => {
      // The page may refuse the injection (a chrome:// page, for instance).
    });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;

  // The panel asks whether the context menu asked for a scan.
  if (message.type === "SMALLPRINT_PENDING_TEXT") {
    sendResponse({ text: pendingText });
    return false;
  }

  // The panel has taken the pending text.
  if (message.type === "SMALLPRINT_PENDING_TAKEN") {
    pendingText = null;
    return false;
  }

  return false;
});
