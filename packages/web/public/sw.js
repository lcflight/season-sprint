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
 *     load; the cached shell is only used when the network fails.
 *   - The offline shell is "staged": a new index.html is stored only after
 *     every hashed bundle it references, and every file listed in the build's
 *     /asset-manifest.json (lazy route chunks), is in the asset cache. Install does this too, so one online
 *     visit is enough for an offline launch.
 *   - All cache writes are held open with event.waitUntil and can never
 *     turn a good network response into an error.
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
// The shell itself is staged separately (see stageShell) so it is only stored
// together with the bundles it references.
var STATIC_PRECACHE = ["/manifest.webmanifest", "/apple-touch-icon.png", "/icons/icon-192.png"];

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

/** Same-origin hashed asset paths referenced by an HTML document (scripts, styles, prefetch). */
function referencedAssets(html, origin) {
  var out = [];
  var re = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  var m;
  while ((m = re.exec(html))) {
    var raw = m[1] || m[2] || m[3];
    var u;
    try { u = new URL(raw, origin + "/"); } catch (e) { continue; }
    if (u.origin === origin && HASHED_RE.test(u.pathname) && out.indexOf(u.pathname) === -1) out.push(u.pathname);
  }
  return out;
}

/** Drop the oldest assets beyond `max`, never touching paths in `keep`. */
function trim(cache, max, keep) {
  return cache.keys().then(function (keys) {
    var excess = keys.length - max;
    if (excess <= 0) return;
    var victims = keys.filter(function (k) { return keep.indexOf(new URL(k.url).pathname) === -1; }).slice(0, excess);
    return Promise.all(victims.map(function (k) { return cache.delete(k); }));
  });
}

/**
 * Every hashed file of the deployed build, from /asset-manifest.json (written
 * by vue.config.js). Lets lazy route chunks be cached before they're visited.
 * A missing manifest (404) means "no extra files"; a network error rejects.
 */
function buildAssets() {
  return fetch("/asset-manifest.json", { cache: "no-cache", credentials: "same-origin" }).then(function (res) {
    if (res.status === 404) return [];
    if (!res.ok) throw new Error("asset-manifest " + res.status);
    return res.json().then(function (m) {
      return (m && Array.isArray(m.files) ? m.files : []).filter(function (f) {
        return typeof f === "string" && HASHED_RE.test(f);
      });
    });
  });
}

/**
 * Store `html` as the offline shell only once every hashed asset it references,
 * plus every file in the build's asset manifest, is in the asset cache. If any
 * of them can't be fetched or stored, the previous (complete) shell stays.
 */
function stageShell(html, origin) {
  return buildAssets().then(function (all) {
    var assets = referencedAssets(html, origin);
    all.forEach(function (f) { if (assets.indexOf(f) === -1) assets.push(f); });
    return stageAssets(html, assets);
  });
}

function stageAssets(html, assets) {
  return caches.open(ASSET_CACHE).then(function (assetCache) {
    return Promise.all(assets.map(function (path) {
      return assetCache.match(path).then(function (hit) {
        if (hit) return;
        return fetch(path, { credentials: "same-origin" }).then(function (res) {
          if (!res.ok || res.type !== "basic") throw new Error("asset " + path + " -> " + res.status);
          return assetCache.put(path, res);
        });
      });
    }))
      .then(function () {
        return caches.open(SHELL_CACHE).then(function (c) {
          return c.put(SHELL_URL, new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
        });
      })
      .then(function () { return trim(assetCache, MAX_ASSETS, assets); });
  });
}

/** Run background cache work without letting it fail the request or be cut short. */
function keepAlive(event, promise) {
  var safe = promise.catch(function () {});
  if (event && event.waitUntil) event.waitUntil(safe);
  return safe;
}

function navigate(event) {
  return fetch(event.request)
    .then(function (res) {
      // Only remember real app HTML (the SPA rewrite serves index.html for every route).
      if (res.ok && isHtml(res) && !res.redirected) {
        keepAlive(event, res.clone().text().then(function (html) { return stageShell(html, self.location.origin); }));
      }
      return res;
    })
    .catch(function () {
      return caches.match(SHELL_URL, { cacheName: SHELL_CACHE }).then(function (hit) {
        return hit || Response.error();
      });
    });
}

function immutable(event) {
  var request = event.request;
  return caches.open(ASSET_CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (res) {
        if (res.ok && res.type === "basic") {
          // Trimming happens in stageShell, which knows which assets the current shell needs.
          keepAlive(event, cache.put(request, res.clone()));
        }
        return res;
      });
    });
  });
}

function networkFirst(event) {
  var request = event.request;
  return fetch(request)
    .then(function (res) {
      if (res.ok && res.type === "basic") {
        var copy = res.clone();
        keepAlive(event, caches.open(SHELL_CACHE).then(function (c) { return c.put(request, copy); }));
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
self.__ssReferencedAssets = referencedAssets;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (c) { return c.addAll(STATIC_PRECACHE); })
      // Fetch the current shell and cache every bundle it references, so the
      // very first visit is enough for an offline launch.
      .then(function () { return fetch(SHELL_URL, { cache: "no-cache", credentials: "same-origin" }); })
      .then(function (res) {
        if (!res.ok || !isHtml(res) || res.redirected) throw new Error("shell fetch failed: " + res.status);
        return res.text();
      })
      .then(function (html) { return stageShell(html, self.location.origin); })
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
  if (kind === "navigate") event.respondWith(navigate(event));
  else if (kind === "immutable") event.respondWith(immutable(event));
  else if (kind === "static") event.respondWith(networkFirst(event));
  // "bypass": don't call respondWith; the browser handles it as if no SW existed.
});
