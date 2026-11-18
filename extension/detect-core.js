// Pure scoring helpers for the local detector. Loaded before detect.js as a
// classic content script and imported for side effect by the unit tests; no
// DOM, no network, no Chrome APIs. Sets globalThis.ScoutDetect.
(function (global) {
  'use strict';

  // EU stems are unaccented where the accent trails the stem (confidentialité
  // matches "confidentialit" + boundary because é is not a \w char); accents
  // inside the word are spelled out (política).
  var LINK_RE = /\b(terms?|tos|conditions?|privacy|eula|agreement|polic(?:y|ies)|legal|refund|cancel|politique|pol[ií]tica|datenschutz|cookies?|confidentialit|vie priv|mentions l|cgu|cgv|impressum|aviso legal)\b/i;
  var CONSENT_RE = /\b(accept(?:e[rz]?)?|i agree|acknowledge|consent|refus(?:e[rz]?)?|param[eè]tres|akzeptieren|ablehnen|zustimmen|aceptar|rechazar|accettare|rifiutare)\b/i;
  var BY_CLICKING_RE = /by (?:clicking|using|continuing)[\s\S]{0,120}?you agree/i;

  // The part of an href that names the destination page: hostname plus the
  // final non-empty path segment. Query strings carry tracking junk that can
  // coincidentally contain "terms", so they never count.
  function hrefTail(href) {
    var s = String(href || '').split(/[?#]/)[0];
    var m = s.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)(?:\/(.*))?$/i);
    var host = '';
    if (m) {
      host = m[1];
      s = m[2] || '';
    }
    s = s.replace(/\/+$/, '');
    return host + '/' + s.slice(s.lastIndexOf('/') + 1);
  }

  // > 0 only when the link's visible text or its href names a legal page.
  // A visible text match is worth more than a URL match: the label is what
  // the user was about to click. A long anchor is a news card or a paragraph
  // link, not a terms link, so its keyword counts as coincidence.
  function linkScore(text, href) {
    var t = (text || '').trim();
    var score =
      (t.length > 0 && t.length <= 60 && LINK_RE.test(t) ? 3 : 0) +
      (LINK_RE.test(hrefTail(href)) ? 2 : 0);
    if (score === 0) return 0;
    return score + (t ? 1 : 0);
  }

  // > 0 only when the checkbox itself or the text around it asks for consent.
  // "By clicking X, you agree" counts as consent on its own and adds a bonus.
  function checkboxScore(label, context) {
    var ctxText = context || '';
    var byClicking = BY_CLICKING_RE.test(ctxText);
    var inLabel = CONSENT_RE.test(label || '');
    var inContext = CONSENT_RE.test(ctxText) || byClicking;
    if (!inLabel && !inContext) return 0;
    var score = inLabel ? 5 : 4;
    if (byClicking) score += 2;
    return score;
  }

  // > 0 only when a button's label is consent language. Nav and shop buttons
  // ("Menu", "Search", "Buy") never match; long texts are not button labels.
  function buttonScore(text) {
    var t = (text || '').trim();
    if (!t || t.length > 60) return 0;
    return CONSENT_RE.test(t) ? 4 : 0;
  }

  var DENSE_MIN_CHARS = 800;
  var DENSE_MIN_SENTENCES_PER_100 = 0.4;

  // Dense legal prose: long, about legal topics, and made of real sentences
  // (a 900-character menu has no periods and never qualifies).
  function denseScore(text) {
    if (!text || text.length <= DENSE_MIN_CHARS) return 0;
    if (!LINK_RE.test(text)) return 0;
    var sentences = (text.match(/[.!?]/g) || []).length;
    if ((sentences * 100) / text.length < DENSE_MIN_SENTENCES_PER_100) return 0;
    return 3;
  }

  // The iframe early-return gate: only scan a frame whose first bit of text
  // mentions legal or consent topics at all.
  function frameWorthScanning(headText) {
    var text = String(headText || '');
    return LINK_RE.test(text) || CONSENT_RE.test(text);
  }

  global.ScoutDetect = {
    LINK_RE: LINK_RE,
    CONSENT_RE: CONSENT_RE,
    BY_CLICKING_RE: BY_CLICKING_RE,
    linkScore: linkScore,
    buttonScore: buttonScore,
    checkboxScore: checkboxScore,
    denseScore: denseScore,
    frameWorthScanning: frameWorthScanning,
  };
})(globalThis);
