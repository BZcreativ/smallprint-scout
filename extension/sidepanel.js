/* global chrome */

import { findActiveTab } from "./active-tab.js";

// The side panel is a shell: it holds the hosted app in an iframe, hands it
// the text of the page, and lists what the local detector (detect.js) found.
// Nothing here talks to Firebase, and no text is read until the user asks.

const APP_ORIGIN = "https://smallprint-scout.web.app";
const ORIGINS_KEY = "scout-origins";

const autoDetect = document.getElementById("auto-detect");
const section = document.getElementById("candidates");
const list = document.getElementById("candidate-list");
const hint = document.getElementById("detect-hint");

let currentTab = null; // the tab this panel is looking at
const candidatesByFrame = new Map(); // frameId -> candidate items of that frame

// The selection when there is one, the whole page otherwise.
function readText() {
  const selection = window.getSelection();
  const selected = selection ? selection.toString().trim() : "";
  return selected || document.body.innerText;
}

// Hands the text to the app. The app checks that the message came from an
// extension before it uses it.
function postToApp(text) {
  const frame = document.getElementById("app-frame");
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage({ type: "SMALLPRINT_TEXT", text }, APP_ORIGIN);
}

// Reads a tab and puts the text in the app.
async function scanTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: readText,
  });

  postToApp(results && results[0] ? results[0].result : "");
}

// The http(s) origin of the active tab, or null (activeTab grants the URL,
// so chrome:// pages and not-yet-granted tabs come back empty).
function tabOrigin(tab) {
  if (!tab || typeof tab.url !== "string") return null;
  try {
    const url = new URL(tab.url);
    return /^https?:$/.test(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

// Same one-liner as in background.js: this is a module, the service worker
// is not, and one line is not worth a shared file.
function scriptId(origin) {
  return "scout-detect-" + origin.replace(/^[a-z]+:\/\//i, "").replace(/[^a-z0-9.-]+/gi, "-");
}

async function storedOrigins() {
  try {
    const stored = await chrome.storage.sync.get({ [ORIGINS_KEY]: [] });
    return stored[ORIGINS_KEY] || [];
  } catch {
    return [];
  }
}

// The checkbox follows the real permission state, never the click.
async function refreshToggle() {
  const origin = tabOrigin(currentTab);
  autoDetect.disabled = !origin;
  autoDetect.title = origin ? "" : "Open this panel on an http(s) page first";
  autoDetect.checked = origin !== null && (await chrome.permissions.contains({ origins: [origin + "/*"] }));
  hint.textContent = autoDetect.checked
    ? "Auto-detect is on. Terms links, consent checkboxes and popups found on this page appear below."
    : "Auto-detect is off. Turn it on to spot terms links, consent checkboxes and popups.";
}

// The panel opened, the tab changed, or auto-detect was just enabled: ask the
// detector in the page to report now (it may have found things before this
// panel was up), and take the badge over.
async function resyncTab() {
  if (!currentTab || typeof currentTab.id !== "number") return;
  try {
    await chrome.tabs.sendMessage(currentTab.id, { type: "SCOUT_RESYNC" });
  } catch {
    // No detector in this tab: auto-detect is off or not injected yet.
  }
  chrome.action.setBadgeText({ tabId: currentTab.id, text: "" }).catch(() => {
    // The tab may be gone already.
  });
}

async function enableAutoDetect(tab, origin) {
  const granted = await chrome.permissions.request({ origins: [origin + "/*"] });
  if (!granted) return;

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
    // Registered by an earlier enable; nothing to do.
  }

  // The registration only covers future navigations, so also inject into the
  // page that is open right now.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["detect-core.js", "detect.js"],
    });
  } catch {
    // Some pages refuse injection; the next navigation detects normally.
  }

  const origins = await storedOrigins();
  if (!origins.includes(origin)) {
    await chrome.storage.sync.set({ [ORIGINS_KEY]: [...origins, origin] });
  }
}

async function disableAutoDetect(tab, origin) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [scriptId(origin)] });
  } catch {
    // Nothing registered under this id.
  }

  try {
    await chrome.permissions.remove({ origins: [origin + "/*"] });
  } catch {
    // Already gone.
  }

  await chrome.storage.sync.set({
    [ORIGINS_KEY]: (await storedOrigins()).filter((o) => o !== origin),
  });

  // The detector keeps running in tabs that are open: tell it to pack up.
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "SCOUT_DISABLE" });
  } catch {
    // No detector in this tab right now.
  }
  chrome.action.setBadgeText({ tabId: tab.id, text: "" }).catch(() => {});
}

autoDetect.addEventListener("change", async () => {
  const tab = currentTab;
  const origin = tabOrigin(tab);
  if (!tab || !origin) {
    await refreshToggle();
    return;
  }
  try {
    if (autoDetect.checked) {
      await enableAutoDetect(tab, origin);
      await resyncTab();
    } else {
      await disableAutoDetect(tab, origin);
    }
  } finally {
    await refreshToggle();
  }
});

document.getElementById("scan-page").addEventListener("click", () => {
  findActiveTab()
    .then((tab) => (tab === null ? null : scanTab(tab.id)))
    .catch(() => {
      // The page may refuse the injection (a chrome:// page, or a tab the
      // extension has no permission for).
    });
});

function kindName(kind) {
  if (kind === "checkbox") return "Checkbox";
  if (kind === "dense") return "Legal text";
  if (kind === "button") return "Consent button";
  return "Terms link";
}

// Scans a candidate. A terms link with an http(s) href is fetched and its
// document's text goes to the app; anything else (or a fetch that is denied,
// fails, or yields too little) falls back to the text captured on the page,
// which for a dialog candidate is the whole consent notice.
async function scanItem(item, button) {
  const fallback = String(item.text || "");
  let origin = null;
  if (typeof item.href === "string") {
    try {
      const url = new URL(item.href);
      if (url.protocol === "http:" || url.protocol === "https:") origin = url.origin;
    } catch {
      origin = null;
    }
  }

  if (origin) {
    const pattern = origin + "/*";
    let granted = await chrome.permissions.contains({ origins: [pattern] });
    if (!granted) granted = await chrome.permissions.request({ origins: [pattern] });

    if (granted) {
      button.textContent = "Loading...";
      let text = "";
      try {
        const html = await (await fetch(item.href)).text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        if (doc.body) {
          doc.body.querySelectorAll("script, style, noscript, svg, nav, header, footer").forEach((el) => el.remove());
          // 6000 is the app's paste-box limit.
          text = (doc.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 6000);
        }
      } catch {
        // Offline, blocked, or a 404: fall back below.
      }
      button.textContent = "Scan";

      if (text.length >= 80) {
        hint.textContent = "Scanned the page the selected link points to.";
        postToApp(text);
        return;
      }
      hint.textContent = "Could not read the linked page, so the text shown on this page was scanned instead.";
    } else {
      hint.textContent = "Permission to read the linked page was not granted, so the text shown on this page was scanned instead.";
    }
  }

  postToApp(fallback);
}

function renderCandidates() {
  const items = [];
  for (const frameItems of candidatesByFrame.values()) items.push(...frameItems);

  section.hidden = items.length === 0;
  list.replaceChildren();

  for (const item of items) {
    const row = document.createElement("li");

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = item.label || item.kind;
    row.append(label);

    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = item.dialog ? kindName(item.kind) + " · popup" : kindName(item.kind);
    row.append(kind);

    const focus = document.createElement("button");
    focus.type = "button";
    focus.textContent = "Focus";
    focus.addEventListener("click", () => {
      if (!currentTab) return;
      chrome.tabs.sendMessage(currentTab.id, { type: "SCOUT_FOCUS", id: item.id }).catch(() => {
        // The page navigated away; the list refreshes on the next scan.
      });
    });
    row.append(focus);

    const scan = document.createElement("button");
    scan.type = "button";
    scan.textContent = "Scan";
    scan.addEventListener("click", () => scanItem(item, scan));
    row.append(scan);

    list.append(row);
  }
}

// The background sends the text it read for the context menu, and detect.js
// in the page sends the candidates it found (one message per frame).
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message) return;

  if (message.type === "SMALLPRINT_TEXT" && typeof message.text === "string") {
    postToApp(message.text);
    return;
  }

  if (
    message.type === "SMALLPRINT_CANDIDATES" &&
    Array.isArray(message.items) &&
    sender.tab &&
    sender.tab.id === (currentTab && currentTab.id)
  ) {
    candidatesByFrame.set(
      sender.frameId,
      message.items.filter((item) => item && typeof item.id === "string" && typeof item.kind === "string"),
    );
    renderCandidates();
  }
});

// The panel stays open across tab switches: follow the active tab.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (currentTab && currentTab.id === tabId) return;
  currentTab = await findActiveTab();
  candidatesByFrame.clear();
  renderCandidates();
  await refreshToggle();
  await resyncTab();
});

// Follow navigations/redirects within the active tab so the per-site toggle
// and candidate list stay accurate.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!currentTab || currentTab.id !== tabId) return;
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  currentTab = tab;
  if (changeInfo.url) {
    candidatesByFrame.clear();
    renderCandidates();
  }
  await refreshToggle();
  if (changeInfo.status === "complete") {
    await resyncTab();
  }
});

// The background may have read the text before this panel was ready, so the
// panel asks for it once it is up.
chrome.runtime
  .sendMessage({ type: "SMALLPRINT_PENDING_TEXT" })
  .then((response) => {
    if (!response || typeof response.text !== "string") return undefined;
    chrome.runtime.sendMessage({ type: "SMALLPRINT_PENDING_TAKEN" }).catch(() => {
      // The background may be asleep already; the text still arrives.
    });
    postToApp(response.text);
    return undefined;
  })
  .catch(() => {
    // No background to answer: the user can still press "Scan this page".
  });

(async () => {
  currentTab = await findActiveTab();
  await refreshToggle();
  await resyncTab();
})();
