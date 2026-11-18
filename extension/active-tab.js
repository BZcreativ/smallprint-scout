/* global chrome */

// The tab the user is looking at.
//
// This is a module of its own because it is the only place in the extension
// that looks a tab up: the side panel asks for the tab it should read, and
// nothing else needs to know about tabs. The whole tab comes back because the
// panel needs its URL (available once activeTab is granted) for the
// per-origin auto-detect toggle.

export async function findActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  return tab && typeof tab.id === "number" ? tab : null;
}
