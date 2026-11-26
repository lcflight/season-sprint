import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import vm from "vm";
import { registerServiceWorker } from "@/registerServiceWorker";

const PUBLIC = path.resolve(__dirname, "../public");
const ORIGIN = "https://app.seasonsprint.com";

/** Run public/sw.js in a sandbox with fake caches/fetch; return its handlers. */
function loadSw({ fetchImpl } = {}) {
  const stores = new Map();
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    const key = (r) => (typeof r === "string" ? new URL(r, ORIGIN).href : r.url);
    return {
      match: async (r) => m.get(key(r)),
      put: async (r, res) => void m.set(key(r), res),
      addAll: async (urls) => urls.forEach((u) => m.set(key(u), new Response("pre", { headers: { "content-type": "text/html" } }))),
      keys: async () => [...m.keys()].map((u) => new Request(u)),
      delete: async (r) => m.delete(key(r)),
    };
  };
  const caches = {
    open: async (n) => cacheFor(n),
    match: async (r, opts) => cacheFor(opts.cacheName).match(r),
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
  };
  const handlers = {};
  const self = {
    location: new URL(ORIGIN + "/sw.js"),
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fetch = async (input, init) => {
    const res = await (fetchImpl ?? (async () => new Response("net")))(input, init);
    // Node Responses have type "default"; a browser same-origin fetch is "basic".
    if (res && res.type === "default") Object.defineProperty(res, "type", { value: "basic" });
    return res;
  };
  const ctx = vm.createContext({ self, caches, fetch, URL, Response, Request, Headers, Promise, console });
  vm.runInContext(readFileSync(path.join(PUBLIC, "sw.js"), "utf8"), ctx);
  return { handlers, self, stores };
}

/** Dispatch a fetch event; resolves to the response once it and all waitUntil work settle. */
function dispatchFetch(handlers, request) {
  let responded = null;
  const extended = [];
  handlers.fetch({ request, respondWith: (p) => (responded = p), waitUntil: (p) => extended.push(p) });
  if (!responded) return null;
  return responded.then(async (res) => {
    // waitUntil may be called after the response resolves (e.g. after reading the body).
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    await Promise.all(extended);
    res.extendedCount = extended.length;
    return res;
  });
}

async function runInstall(handlers) {
  const p = [];
  handlers.install({ waitUntil: (x) => p.push(x) });
  return Promise.all(p);
}

// What Vue CLI emits: unquoted attributes, defer scripts, prefetch for lazy routes.
const BUILD_HTML =
  '<!doctype html><html><head><link href=/js/about.aaaaaaaa.js rel=prefetch>' +
  '<script defer=defer src=/js/chunk-vendors.bbbbbbbb.js></script><script defer src="/js/app.cccccccc.js"></script>' +
  '<link href=/css/app.dddddddd.css rel=stylesheet><link rel="icon" href="/logo.svg">' +
  '<script src="https://clerk.seasonsprint.com/npm/x.11111111.js"></script></head><body><div id=app></div></body></html>';
const BUILD_ASSETS = ["/js/about.aaaaaaaa.js", "/js/chunk-vendors.bbbbbbbb.js", "/js/app.cccccccc.js", "/css/app.dddddddd.css"];

function siteFetch({ html = BUILD_HTML, fail = [], online = () => true, manifest = null } = {}) {
  const seen = [];
  const impl = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
    seen.push(url.pathname);
    if (!online()) throw new TypeError("offline");
    if (fail.includes(url.pathname)) return new Response("nope", { status: 404 });
    if (url.pathname === "/asset-manifest.json") {
      return manifest ? Response.json({ files: manifest }) : new Response("not found", { status: 404 });
    }
    if (url.pathname === "/" || !/\./.test(url.pathname) || url.pathname.endsWith(".html")) {
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response("asset " + url.pathname, { headers: { "content-type": "text/javascript" } });
  };
  return { impl, seen };
}

const req = (url, init = {}, mode) => {
  const r = new Request(url, init);
  if (mode) Object.defineProperty(r, "mode", { value: mode });
  return r;
};

describe("service worker safety", () => {
  const { self } = loadSw();
  const classify = (r) => self.__ssClassify(r, ORIGIN);

  it("never touches other origins (API worker, Clerk, CDNs)", () => {
    for (const u of [
      "https://api.seasonsprint.com/me/records?mode=ranked",
      "https://clerk.seasonsprint.com/v1/client",
      "https://accounts.seasonsprint.com/sign-in",
      "https://img.clerk.com/x.png",
    ]) {
      expect(classify(req(u))).toBe("bypass");
    }
  });

  it("never touches non-GET or credentialed same-origin requests", () => {
    expect(classify(req(ORIGIN + "/me/records", { method: "POST", body: "{}" }))).toBe("bypass");
    expect(classify(req(ORIGIN + "/js/app.1a2b3c4d.js", { headers: { Authorization: "Bearer x" } }))).toBe("bypass");
  });

  it("only caches allowlisted same-origin paths", () => {
    expect(classify(req(ORIGIN + "/ranked", {}, "navigate"))).toBe("navigate");
    expect(classify(req(ORIGIN + "/js/app.1a2b3c4d.js"))).toBe("immutable");
    expect(classify(req(ORIGIN + "/css/chunk-vendors.deadbeef.css"))).toBe("immutable");
    expect(classify(req(ORIGIN + "/tracker/modes.0123abcd.pgm"))).toBe("immutable");
    expect(classify(req(ORIGIN + "/data/finals-seasons.json"))).toBe("static");
    expect(classify(req(ORIGIN + "/manifest.webmanifest"))).toBe("static");
    // Unhashed or unknown paths (a same-origin API would land here) pass through.
    expect(classify(req(ORIGIN + "/js/app.js"))).toBe("bypass");
    expect(classify(req(ORIGIN + "/api/me/records"))).toBe("bypass");
    expect(classify(req(ORIGIN + "/me/stream?token=abc"))).toBe("bypass");
  });

  it("bypassed requests are not intercepted at all", () => {
    const { handlers } = loadSw();
    expect(dispatchFetch(handlers, req("https://api.seasonsprint.com/me/records"))).toBeNull();
  });

  it("navigations are network-first and fall back to the cached shell offline", async () => {
    let up = true;
    const site = siteFetch({ online: () => up });
    const { handlers, stores } = loadSw({ fetchImpl: site.impl });
    const live = await dispatchFetch(handlers, req(ORIGIN + "/ranked", {}, "navigate"));
    expect(await live.text()).toBe(BUILD_HTML);
    expect(live.extendedCount).toBeGreaterThan(0); // cache work held open with waitUntil
    expect([...stores.get("ss-shell-v1").keys()]).toContain(ORIGIN + "/");

    up = false;
    const offline = await dispatchFetch(handlers, req(ORIGIN + "/world-tour", {}, "navigate"));
    expect(await offline.text()).toBe(BUILD_HTML);
    // ...and the bundles it needs are there too.
    for (const a of BUILD_ASSETS) {
      const r = await dispatchFetch(handlers, req(ORIGIN + a));
      expect(r.status).toBe(200);
    }
  });

  it("does not cache non-HTML or error responses as the shell", async () => {
    const { handlers, stores } = loadSw({ fetchImpl: async () => new Response("oops", { status: 500, headers: { "content-type": "text/html" } }) });
    await dispatchFetch(handlers, req(ORIGIN + "/", {}, "navigate"));
    expect(stores.get("ss-shell-v1")?.size ?? 0).toBe(0);
  });

  it("finds the hashed same-origin assets a build's index.html references", () => {
    expect(self.__ssReferencedAssets(BUILD_HTML, ORIGIN)).toEqual(BUILD_ASSETS);
  });

  it("install caches the shell plus every bundle it references (first visit works offline)", async () => {
    const site = siteFetch();
    const { handlers, stores } = loadSw({ fetchImpl: site.impl });
    await runInstall(handlers);
    expect([...stores.get("ss-shell-v1").keys()]).toContain(ORIGIN + "/");
    expect([...stores.get("ss-assets-v1").keys()].map((u) => new URL(u).pathname).sort()).toEqual([...BUILD_ASSETS].sort());
  });

  it("also caches lazy route chunks listed in /asset-manifest.json", async () => {
    const lazy = ["/js/167.6f2ad456.js", "/css/167.5ccf1e54.css", "/tracker/modes.0123abcd.pgm"];
    const site = siteFetch({ manifest: [...lazy, "/js/app.cccccccc.js", "/not-hashed.js", "https://evil.example/x.12345678.js"] });
    const { handlers, stores } = loadSw({ fetchImpl: site.impl });
    await runInstall(handlers);
    const cached = [...stores.get("ss-assets-v1").keys()].map((u) => new URL(u).pathname).sort();
    expect(cached).toEqual([...BUILD_ASSETS, ...lazy].sort());
    expect(site.seen).not.toContain("/not-hashed.js");
  });

  it("keeps the previous complete shell if a new build's bundles can't be cached", async () => {
    const v1 = siteFetch();
    let impl = v1.impl;
    const { handlers, stores } = loadSw({ fetchImpl: (...a) => impl(...a) });
    await runInstall(handlers);

    const v2html = BUILD_HTML.replace("app.cccccccc", "app.eeeeeeee");
    impl = siteFetch({ html: v2html, fail: ["/js/app.eeeeeeee.js"] }).impl;
    const res = await dispatchFetch(handlers, req(ORIGIN + "/", {}, "navigate"));
    expect(res.status).toBe(200); // the user still gets the fresh page
    const shell = await stores.get("ss-shell-v1").get(ORIGIN + "/").text();
    expect(shell).toBe(BUILD_HTML); // ...but the offline shell stays on the complete v1

    impl = siteFetch({ html: v2html }).impl; // bundle reachable again
    await dispatchFetch(handlers, req(ORIGIN + "/", {}, "navigate"));
    expect(await stores.get("ss-shell-v1").get(ORIGIN + "/").text()).toBe(v2html);
  });
});

describe("manifest + iOS tags", () => {
  const manifest = JSON.parse(readFileSync(path.join(PUBLIC, "manifest.webmanifest"), "utf8"));
  const html = readFileSync(path.join(PUBLIC, "index.html"), "utf8");

  it("is installable as a standalone app", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512", "180x180"]));
  });

  it("has a 180x180 opaque apple-touch-icon linked from index.html", () => {
    expect(html).toMatch(/rel="apple-touch-icon"/);
    expect(html).toMatch(/rel="manifest"/);
    const png = readFileSync(path.join(PUBLIC, "apple-touch-icon.png"));
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
    expect(png[25]).toBe(2); // color type 2 = RGB, no alpha
  });
});

describe("registerServiceWorker", () => {
  it("does nothing outside production", () => {
    const register = vi.fn();
    expect(registerServiceWorker({ env: "development", nav: { serviceWorker: { register } }, win: {} })).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it("registers /sw.js once the page has loaded in production", () => {
    const register = vi.fn().mockResolvedValue({});
    const win = { document: { readyState: "complete" }, addEventListener: vi.fn() };
    expect(registerServiceWorker({ env: "production", nav: { serviceWorker: { register } }, win })).toBe(true);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });
});
