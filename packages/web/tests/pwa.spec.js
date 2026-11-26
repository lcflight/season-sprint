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
  const ctx = vm.createContext({ self, caches, fetch: fetchImpl ?? (async () => new Response("net")), URL, Response, Request, Headers, Promise, console });
  vm.runInContext(readFileSync(path.join(PUBLIC, "sw.js"), "utf8"), ctx);
  return { handlers, self, stores };
}

function dispatchFetch(handlers, request) {
  let responded = null;
  handlers.fetch({ request, respondWith: (p) => (responded = p) });
  return responded;
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
    let online = true;
    const { handlers, stores } = loadSw({
      fetchImpl: async () => {
        if (!online) throw new TypeError("offline");
        return new Response("<html>fresh</html>", { headers: { "content-type": "text/html" } });
      },
    });
    const live = await dispatchFetch(handlers, req(ORIGIN + "/ranked", {}, "navigate"));
    expect(await live.text()).toBe("<html>fresh</html>");
    await new Promise((r) => setTimeout(r, 0));
    expect([...stores.get("ss-shell-v1").keys()]).toContain(ORIGIN + "/");

    online = false;
    const offline = await dispatchFetch(handlers, req(ORIGIN + "/world-tour", {}, "navigate"));
    expect(await offline.text()).toBe("<html>fresh</html>");
  });

  it("does not cache non-HTML or error responses as the shell", async () => {
    const { handlers, stores } = loadSw({ fetchImpl: async () => new Response("oops", { status: 500, headers: { "content-type": "text/html" } }) });
    await dispatchFetch(handlers, req(ORIGIN + "/", {}, "navigate"));
    await new Promise((r) => setTimeout(r, 0));
    expect(stores.get("ss-shell-v1")?.size ?? 0).toBe(0);
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
