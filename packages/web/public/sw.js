/* Season Sprint service worker.
 *
 * Purpose: make the app installable and let the shell open offline.
 * Safety rules (auth and data must never come from a cache):
 *   - Only same-origin GET requests are ever handled. The API worker, Clerk
 *     (clerk.seasonsprint.com / accounts.*), the live WebSocket and any other
 *     origin go straight to the network.
 *   - Even same-origin, only an allowlist is handled: page navigations,
 *     content-hashed build output, and a few static files. Anything else,
 *     and any request carrying credentials headers, passes through untouched.
 *   - Navigations are network-first, so a deploy is picked up on the next
 *     load; the cached index.html is only used when the network fails.
 *
 * Kill switch: if this ever misbehaves in production, deploy a sw.js whose
 * activate handler calls self.registration.unregister() and clears caches.
 */
"use strict";

var VERSION = "v1";
var SHELL_CACHE = "ss-shell-" + VERSION;
var ASSET_CACHE = "ss-assets-" + VERSION;
var MAX_ASSETS = 200;
// "/" not "/index.html": Cloudflare Pages 308-redirects *.html to the clean URL,
// and a redirected response can't be used to answer a navigation.
var SHELL_URL = "/";
var PRECACHE = [SHELL_URL, "/manifest.webmanifest", "/apple-touch-icon.png", "/icons/icon-192.png"];

// Vue CLI output with a content hash in the name: safe to cache forever.
var HASHED_RE = /^\/(js|css|img|fonts|media|tracker)\/[^/]+\.[0-9a-f]{8}\.[a-z0-9]+$/i;
// Static, unversioned public files: network-first with a cached fallback.
var STATIC_RE = /^\/(manifest\.webmanifest|apple-touch-icon\.png|favicon\.ico|logo(-transparent)?\.svg|icons\/[^/]+\.png|data\/[^/]+\.json)$/;

/** Decide how to handle a request. Exported for tests via self.__ssClassify. */
function classify(request, scopeOrigin) {
  if (request.method !== "GET") return "bypass";
  var url = new URL(request.url);
  if (url.origin !== scopeOrigin) return "bypass";
  if (request.headers && (request.headers.get("authorization") || request.headers.get("x-api-key"))) return "bypass";
  if (request.mode === "navigate") return "navigate";
  if (HASHED_RE.test(url.pathname)) return "immutable";
  if (STATIC_RE.test(url.pathname)) return "static";
  return "bypass";
}

function isHtml(res) {
  return (res.headers.get("content-type") || "").indexOf("text/html") !== -1;
}

function trim(cacheName, max) {
  return caches.open(cacheName).then(function (cache) {
    return cache.keys().then(function (keys) {
      if (keys.length <= max) return;
      return Promise.all(keys.slice(0, keys.length - max).map(function (k) { return cache.delete(k); }));
    });
  });
}

function navigate(request) {
  return fetch(request)
    .then(function (res) {
      // Only remember real app HTML (the SPA rewrite serves index.html for every route).
      if (res.ok && isHtml(res) && !res.redirected) {
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { return c.put(SHELL_URL, copy); });
      }
      return res;
    })
    .catch(function () {
      return caches.match(SHELL_URL, { cacheName: SHELL_CACHE }).then(function (hit) {
        return hit || Response.error();
      });
    });
}

function immutable(request) {
  return caches.open(ASSET_CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (res) {
        if (res.ok && res.type === "basic") {
          cache.put(request, res.clone()).then(function () { return trim(ASSET_CACHE, MAX_ASSETS); });
        }
        return res;
      });
    });
  });
}

function networkFirst(request) {
  return fetch(request)
    .then(function (res) {
      if (res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { return c.put(request, copy); });
      }
      return res;
    })
    .catch(function () {
      return caches.match(request, { cacheName: SHELL_CACHE }).then(function (hit) {
        return hit || Response.error();
      });
    });
}

self.__ssClassify = classify;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) {
          return k.indexOf("ss-") === 0 && k !== SHELL_CACHE && k !== ASSET_CACHE;
        }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var kind = classify(event.request, self.location.origin);
  if (kind === "navigate") event.respondWith(navigate(event.request));
  else if (kind === "immutable") event.respondWith(immutable(event.request));
  else if (kind === "static") event.respondWith(networkFirst(event.request));
  // "bypass": don't call respondWith; the browser handles it as if no SW existed.
});
