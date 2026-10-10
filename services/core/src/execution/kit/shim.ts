/**
 * campsite-vista.js — the bridge every Vista includes (inlined by the composer).
 * Host → Vista: campsite:play | pause | restart | seek{atMs} | scene{sceneId} | restore{state}
 * Vista → Host: campsite:ready{durationMs?} | campsite:state{state} | campsite:scene{sceneId, atMs?}
 * The iframe runs with an opaque origin, so messages carry no secrets and the host validates `event.source`.
 */
export const SHIM_VERSION = '1.0.1';
export const SHIM_SOURCE = String.raw`
(function () {
  "use strict";
  var HOST_TYPES = { "campsite:play": 1, "campsite:pause": 1, "campsite:restart": 1, "campsite:seek": 1, "campsite:scene": 1, "campsite:restore": 1 };
  var hooks = {};
  var readySent = false;
  var startedAt = null;
  var pausedAt = 0;
  var declaredDuration = null;
  function post(msg) { try { (window.parent || window).postMessage(msg, "*"); } catch (e) { /* ignore */ } }
  function anims() { try { return document.getAnimations ? document.getAnimations() : []; } catch (e) { return []; } }
  function each(fn) { var a = anims(); for (var i = 0; i < a.length; i++) { try { fn(a[i]); } catch (e) { /* ignore */ } } }
  var Campsite = {
    version: "${SHIM_VERSION}",
    manualReady: false,
    onPlay: null, onPause: null, onRestart: null, onSeek: null, onScene: null, onRestore: null,
    ready: function (opts) {
      if (readySent) return; readySent = true;
      declaredDuration = opts && typeof opts.durationMs === "number" ? opts.durationMs : declaredDuration;
      var m = { type: "campsite:ready" }; if (typeof declaredDuration === "number") m.durationMs = declaredDuration;
      post(m);
    },
    state: function (partial) {
      if (!partial || typeof partial !== "object") return;
      var clean = {}; var n = 0;
      for (var k in partial) { if (!Object.prototype.hasOwnProperty.call(partial, k)) continue; var v = partial[k];
        if (/^[a-zA-Z0-9_]{1,40}$/.test(k) && (typeof v === "string" && v.length <= 200 || typeof v === "number" || typeof v === "boolean" || v === null)) { clean[k] = v; n++; } }
      if (n) post({ type: "campsite:state", state: clean });
    },
    scene: function (sceneId, atMs) {
      if (typeof sceneId !== "string") return;
      var m = { type: "campsite:scene", sceneId: String(sceneId).slice(0, 64) }; if (typeof atMs === "number") m.atMs = Math.max(0, Math.round(atMs));
      post(m);
    },
    play: function () { if (Campsite.onPlay) { Campsite.onPlay(); } else { each(function (a) { a.play(); }); } },
    pause: function () { if (Campsite.onPause) { Campsite.onPause(); } else { each(function (a) { a.pause(); }); } },
    restart: function () { if (Campsite.onRestart) { Campsite.onRestart(); } else { each(function (a) { a.currentTime = 0; a.play(); }); } },
    seek: function (atMs) { if (Campsite.onSeek) { Campsite.onSeek(atMs); } else { each(function (a) { a.currentTime = atMs; }); } },
    setDuration: function (ms) { declaredDuration = ms; }
  };
  window.Campsite = Campsite;
  window.addEventListener("message", function (ev) {
    // Ignore our own posts (at top level, parent === window): only the host may command the Vista.
    if (ev.source === window) return;
    var d = ev && ev.data; if (!d || typeof d !== "object" || !HOST_TYPES[d.type]) return;
    switch (d.type) {
      case "campsite:play": Campsite.play(); break;
      case "campsite:pause": Campsite.pause(); break;
      case "campsite:restart": Campsite.restart(); break;
      case "campsite:seek": if (typeof d.atMs === "number") Campsite.seek(d.atMs); break;
      case "campsite:scene": if (Campsite.onScene && typeof d.sceneId === "string") Campsite.onScene(d.sceneId); break;
      case "campsite:restore": if (Campsite.onRestore && d.state && typeof d.state === "object") Campsite.onRestore(d.state); break;
    }
  });
  function autoReady() { if (!Campsite.manualReady) requestAnimationFrame(function () { requestAnimationFrame(function () { Campsite.ready(); }); }); }
  if (document.readyState === "complete") autoReady(); else window.addEventListener("load", autoReady);
})();
`.trim();

export function shimTag(): string { return `<script id="campsite-vista">${SHIM_SOURCE}</script>`; }
