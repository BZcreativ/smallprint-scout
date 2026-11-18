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

// The selection when there is one; otherwise the text of an open consent
// dialog (a modal covers the page, so its notice is what the user actually
// sees — and innerText of a hidden dialog node is empty, so a stale
// [role="dialog"] element never wins); the whole page as a last resort.
// Same one-liner trio as in sidepanel.js: the service worker is a classic
// script and cannot import the module that holds it.
function readText() {
  const selection = window.getSelection();
  const selected = selection ? selection.toString().trim() : "";
  if (selected) return selected;
  const dialog = document.querySelector('dialog[open], [role="dialog"]');
  const dialogText = dialog && dialog.innerText ? dialog.innerText.trim() : "";
  return dialogText || document.body.innerText;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  // The detector reports what it found: the toolbar badge counts it, so the
  // user knows to open the panel. No sidePanel.open() here: that only works
  // inside a user gesture.
  if (message.type === "SMALLPRINT_CANDIDATES" && sender.tab && typeof sender.tab.id === "number") {
    const count = Array.isArray(message.items) ? message.items.length : 0;
    const tabId = sender.tab.id;
    chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" }).catch(() => {
      // The tab may be gone already.
    });
    if (count > 0) {
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" }).catch(() => {});
    }
    return false;
  }

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
