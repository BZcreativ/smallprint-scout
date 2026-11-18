/* global chrome */
// The local detector. 100% local: it never calls the network, never calls an
// AI, and never mutates the host page. It reads the DOM, scores candidates
// with detect-core.js, draws outlines in its own closed shadow root, and
// reports the top candidates to the extension (the side panel shows them).
//
// Classic content script (content scripts cannot be ES modules); detect-core.js
// runs first in the same isolated world and sets globalThis.ScoutDetect.

(function () {
  'use strict';

  var core = globalThis.ScoutDetect;
  if (!core) return;

  // The toggle can inject this script into a frame that already runs it.
  if (globalThis.__scoutDetectActive) return;
  globalThis.__scoutDetectActive = true;

  var MAX_CANDIDATES = 10;
  // 120000 = MAX_LENGTH in the app's src/domain/input.ts; longer text is
  // split into section scans by the app itself.
  var MAX_TEXT = 120000;
  var FRAME_KEY = Math.random().toString(36).slice(2, 7);
  var seq = 0;
  var ids = new WeakMap();
  var candidates = []; // { id, el, kind } for the last published scan
  var host = null;
  var boxes = null; // Map id -> box element, inside the closed shadow root
  var shadow = null;
  var observer = null;

  function idFor(el) {
    var id = ids.get(el);
    if (!id) {
      id = FRAME_KEY + '-' + ++seq;
      ids.set(el, id);
    }
    return id;
  }

  // Iframes only report when their first bit of text looks relevant; the top
  // frame always scans. (document_idle guarantees document.body exists.)
  try {
    if (window.top !== window) {
      var head = document.body && document.body.innerText ? document.body.innerText.slice(0, 2000) : '';
      if (!core.frameWorthScanning(head)) return;
    }
  } catch {
    // Cross-origin window.top access: treat like an iframe and gate anyway.
    if (!core.frameWorthScanning((document.body && document.body.innerText) || '')) return;
  }

  var DENSE_TAGS = { P: 1, LI: 1, BLOCKQUOTE: 1, DIV: 1, SECTION: 1, ARTICLE: 1 };

  // Depth-first over light DOM children and open shadow roots. Closed shadow
  // roots are unreachable by design and stay unread.
  function walk(el, inDialog, inDense, out) {
    if (!el || el.nodeType !== 1 || el.id === 'scout-layer') return;

    var tag = el.tagName;
    if (tag === 'DIALOG' && !el.open) return; // closed <dialog> is not rendered

    var dialogNow = inDialog || el.matches('dialog[open], [role="dialog"]');
    var denseNow = inDense;

    if (tag === 'A' && el.getAttribute('href')) {
      var label = (el.textContent || '').trim().slice(0, 120);
      var score = core.linkScore(label, el.getAttribute('href'));
      if (score > 0) {
        // el.href is the absolute URL; only http(s) pages can be fetched by
        // the panel later.
        out.push({ el: el, kind: 'link', score: score + (dialogNow ? 2 : 0), dialog: dialogNow, label: label, text: label, href: /^https?:$/.test(el.protocol) ? el.href : '' });
      }
    } else if (tag === 'INPUT' && el.type === 'checkbox') {
      // ponytail: only ancestor-or-label context; a <label for> elsewhere is missed
      var box = el.closest('label') || el.parentElement;
      var context = box ? (box.textContent || '').trim().slice(0, 600) : '';
      var cScore = core.checkboxScore(el.getAttribute('title') || el.getAttribute('aria-label') || '', context);
      if (cScore > 0) {
        out.push({ el: el, kind: 'checkbox', score: cScore + (dialogNow ? 2 : 0), dialog: dialogNow, label: context.slice(0, 80) || 'Consent checkbox', text: context.slice(0, MAX_TEXT) });
      }
    } else if (tag === 'BUTTON' || el.getAttribute('role') === 'button') {
      var bLabel = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 120);
      var bScore = el.closest('nav') ? 0 : core.buttonScore(bLabel);
      if (bScore > 0) {
        out.push({ el: el, kind: 'button', score: bScore + (dialogNow ? 2 : 0), dialog: dialogNow, label: bLabel, text: bLabel });
      }
    } else if (!denseNow && DENSE_TAGS[tag] && el.children.length <= 2) {
      var text = el.textContent || '';
      if (text.length > 800) {
        var dScore = core.denseScore(text);
        if (dScore > 0) {
          out.push({ el: el, kind: 'dense', score: dScore + (dialogNow ? 2 : 0), dialog: dialogNow, label: 'Legal text block (' + text.length.toLocaleString('en-GB') + ' chars)', text: '' });
          denseNow = true; // nested blocks are part of this one, not new candidates
        }
      }
    }

    if (el.shadowRoot) {
      var shadowChildren = el.shadowRoot.children;
      for (var s = 0; s < shadowChildren.length; s++) walk(shadowChildren[s], dialogNow, denseNow, out);
    }
    var children = el.children;
    for (var i = 0; i < children.length; i++) walk(children[i], dialogNow, denseNow, out);
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }

  function publish(top) {
    candidates = top.map(function (c) {
      return { id: idFor(c.el), el: c.el, kind: c.kind };
    });

    var items = top.map(function (c, i) {
      var text = c.text;
      if (c.kind === 'dense') {
        // innerText is only read for the shortlisted few; it forces layout.
        text = ((c.el.innerText || c.el.textContent || '').trim() || '').slice(0, MAX_TEXT);
      }
      if (c.dialog) {
        // "Accepter tout" alone, or a "Privacy Policy" link's short label,
        // tells the app nothing: Scan should be able to fall back to the
        // whole consent notice the candidate lives in.
        var dlg = c.el.closest('dialog[open], [role="dialog"]');
        var dlgText = dlg ? (dlg.innerText || '').trim() : '';
        if (dlgText.length > text.length) text = dlgText.slice(0, MAX_TEXT);
      }
      var item = { id: candidates[i].id, kind: c.kind, label: c.label, rect: rectOf(c.el), text: text };
      if (c.href) item.href = c.href;
      if (c.dialog) item.dialog = true;
      return item;
    });

    chrome.runtime.sendMessage({ type: 'SMALLPRINT_CANDIDATES', items: items }).catch(function () {
      // No side panel open yet; the next scan reports again.
    });
    renderBoxes();
  }

  // ponytail: fixed/absolute + z-index>99 also catches sticky headers with a
  // big z-index; raise the threshold or check viewport centering if noisy.
  function inOverlay(el) {
    // Sticky headers live in fixed high-z-index layers too; they are not
    // popups.
    if (el.closest('header, nav')) return false;
    for (var a = el.parentElement, depth = 0; a && depth < 8; a = a.parentElement, depth++) {
      if (a.id === 'scout-layer') break;
      var cs = getComputedStyle(a);
      if ((cs.position === 'fixed' || cs.position === 'absolute') && parseInt(cs.zIndex, 10) > 99) return true;
    }
    return false;
  }

  function scan() {
    if (!document.body || !document.documentElement) return;
    var raw = [];
    walk(document.documentElement, false, false, raw);

    // Drop stale or invisible nodes before spending slots on them.
    raw = raw.filter(function (c) {
      if (!c.el.isConnected) return false;
      var r = c.el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    raw.sort(function (a, b) {
      return b.score - a.score;
    });

    // The style walk is expensive, so it runs for the shortlisted few only:
    // a candidate in a fixed/high-z-index layer is in a modal, same as
    // dialog[open] / [role="dialog"].
    var top = raw.slice(0, MAX_CANDIDATES);
    top.forEach(function (c) {
      if (!c.dialog && inOverlay(c.el)) {
        c.dialog = true;
        c.score += 2;
      }
    });
    top.sort(function (a, b) {
      return b.score - a.score;
    });
    publish(top);
  }

  // The highlight layer: one host div, one closed shadow root. The page can
  // neither restyle it nor reach into it, and nothing of the page is mutated.
  var layerEl = null;

  function ensureLayer() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = 'scout-layer';
    shadow = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent =
      ':host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none}' +
      '.box{position:absolute;border:2px solid;box-sizing:border-box;border-radius:4px;pointer-events:none}' +
      '.link{border-color:#f59e0b}.checkbox{border-color:#ef4444}.dense{border-color:#3b82f6}' +
      '.box.flash{animation:scout-flash .4s ease-in-out 3 alternate}' +
      '@keyframes scout-flash{from{background:transparent}to{background:rgba(245,158,11,.35)}}';
    layerEl = document.createElement('div');
    shadow.appendChild(style);
    shadow.appendChild(layerEl);
    boxes = new Map();
    document.documentElement.appendChild(host);
  }

  function renderBoxes() {
    if (candidates.length === 0) {
      if (boxes) boxes.forEach(function (box) { box.remove(); });
      if (boxes) boxes.clear();
      return;
    }
    ensureLayer();
    var live = new Set(candidates.map(function (c) { return c.id; }));

    boxes.forEach(function (box, id) {
      if (!live.has(id)) {
        box.remove();
        boxes.delete(id);
      }
    });

    candidates.forEach(function (c) {
      if (!boxes.has(c.id)) {
        var box = document.createElement('div');
        box.className = 'box ' + c.kind;
        layerEl.appendChild(box);
        boxes.set(c.id, box);
      }
    });
    reposition();
  }

  function reposition() {
    if (!boxes) return;
    boxes.forEach(function (box, id) {
      var c = null;
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].id === id) { c = candidates[i]; break; }
      }
      if (!c || !c.el.isConnected) {
        box.style.display = 'none';
        return;
      }
      var r = c.el.getBoundingClientRect();
      box.style.display = 'block';
      box.style.left = r.left + 'px';
      box.style.top = r.top + 'px';
      box.style.width = r.width + 'px';
      box.style.height = r.height + 'px';
    });
  }

  var rafPending = false;
  function queueReposition() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      reposition();
    });
  }

  function flash(id) {
    var box = boxes && boxes.get(id);
    if (!box) return;
    box.classList.remove('flash');
    // Restart the animation even when it is still running.
    void box.offsetWidth;
    box.classList.add('flash');
    setTimeout(function () { box.classList.remove('flash'); }, 1300);
  }

  // ponytail: scrollIntoView inside an iframe scrolls only the iframe's own
  // document; the outer page may still need to scroll the frame into view.

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message) return false;
    if (message.type === 'SCOUT_FOCUS' && typeof message.id === 'string') {
      var c = null;
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].id === message.id && candidates[i].el.isConnected) { c = candidates[i]; break; }
      }
      if (!c) return false; // another frame owns this candidate
      c.el.scrollIntoView({ block: 'center' });
      reposition();
      flash(c.id);
      sendResponse({ found: true });
      return false;
    }
    if (message.type === 'SCOUT_RESYNC') {
      // The panel just opened or the tab became active: report now instead
      // of waiting for the next mutation.
      scan();
      return false;
    }
    if (message.type === 'SCOUT_DISABLE') {
      if (observer) observer.disconnect();
      if (host) host.remove();
      host = null;
      shadow = null;
      layerEl = null;
      boxes = null;
      candidates = [];
      // Allow a later re-enable to inject this script again.
      globalThis.__scoutDetectActive = false;
      return false;
    }
    return false;
  });

  // One rAF-throttled listener for every scroll source plus resizes.
  document.addEventListener('scroll', queueReposition, true);
  window.addEventListener('resize', queueReposition);

  // SPAs and modals: rescan 200ms after the DOM settles. Attribute changes
  // matter too: consent banners are revealed by removing a hidden class.
  var timer = 0;
  observer = new MutationObserver(function () {
    clearTimeout(timer);
    timer = setTimeout(scan, 200);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden'],
  });

  scan();
})();
