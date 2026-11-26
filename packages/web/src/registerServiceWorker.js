// Registers public/sw.js in production builds only. Dev (vue-cli-service
// serve) never gets a service worker, so stale caches can't confuse local work.
export function registerServiceWorker({
  env = process.env.NODE_ENV,
  nav = typeof navigator !== "undefined" ? navigator : undefined,
  win = typeof window !== "undefined" ? window : undefined,
} = {}) {
  if (env !== "production" || !nav || !("serviceWorker" in nav) || !win) return false;
  const register = () => {
    nav.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  };
  if (win.document?.readyState === "complete") register();
  else win.addEventListener("load", register, { once: true });
  return true;
}
