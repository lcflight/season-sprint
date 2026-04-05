import { getAuthorizationHeader } from "./api.js";

const isLocalDevHost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const BASE =
  process.env.VUE_APP_API_BASE_URL ||
  (isLocalDevHost ? "http://localhost:8787" : "");

/**
 * Fetch a short-lived stream token (5 min TTL) from the server.
 * Uses the normal Clerk auth header.
 */
async function getStreamToken() {
  const authHeader = await getAuthorizationHeader();
  if (!authHeader) return null;
  const res = await fetch(`${BASE}/me/stream/token`, {
    method: "POST",
    headers: { Authorization: authHeader },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.token;
}

/**
 * Opens an SSE connection to /me/stream for real-time record updates.
 *
 * @param {Object} handlers
 * @param {(record: object) => void} handlers.onUpsert
 * @param {(payload: {id: string}) => void} handlers.onDelete
 * @param {() => void} handlers.onDeleteAll
 * @param {(payload: {records: object[]}) => void} handlers.onBulkUpsert
 * @returns {Promise<{close: () => void}>}
 */
export async function connectSSE(handlers) {
  if (!BASE) return { close() {} };

  let es = null;
  let closed = false;
  let refreshTimer = null;

  async function open() {
    if (closed) return;

    const token = await getStreamToken();
    if (!token) {
      setTimeout(open, 5000);
      return;
    }

    const url = `${BASE}/me/stream?token=${encodeURIComponent(token)}`;
    es = new EventSource(url);

    es.addEventListener("record:upsert", (e) => {
      try {
        handlers.onUpsert?.(JSON.parse(e.data));
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener("record:delete", (e) => {
      try {
        handlers.onDelete?.(JSON.parse(e.data));
      } catch {
        // ignore
      }
    });

    es.addEventListener("record:delete-all", () => {
      handlers.onDeleteAll?.();
    });

    es.addEventListener("record:bulk-upsert", (e) => {
      try {
        handlers.onBulkUpsert?.(JSON.parse(e.data));
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        es = null;
        setTimeout(open, 2000);
      }
    };
  }

  await open();

  // Refresh token every 4 minutes (token TTL is 5 min)
  refreshTimer = setInterval(() => {
    if (es && !closed) {
      es.close();
      es = null;
      open();
    }
  }, 4 * 60 * 1000);

  return {
    close() {
      closed = true;
      clearInterval(refreshTimer);
      if (es) {
        es.close();
        es = null;
      }
    },
  };
}
