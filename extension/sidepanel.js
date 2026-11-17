/* global chrome */

import { findActiveTab } from "./active-tab.js";

// The side panel is a shell: it holds the hosted app in an iframe and hands it
// the text of the page. Nothing here talks to Firebase, and no text is read
// until the user asks for it.

const APP_ORIGIN = "https://smallprint-scout.web.app";

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

document.getElementById("scan-page").addEventListener("click", () => {
  findActiveTab()
    .then((tabId) => (tabId === null ? null : scanTab(tabId)))
    .catch(() => {
      // The page may refuse the injection (a chrome:// page, or a tab the
      // extension has no permission for).
    });
});

// The background sends the text it read for the context menu.
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "SMALLPRINT_TEXT" && typeof message.text === "string") {
    postToApp(message.text);
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
