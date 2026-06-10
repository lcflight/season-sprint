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
 * Opens a WebSocket connection to /me/stream for real-time record updates and
 * reconnects with backoff on drop. Messages are JSON `{ event, data }`.
 *
 * @param {Object} handlers
 * @param {(status: 'disconnected'|'connecting'|'connected') => void} handlers.onStatus
 * @param {(record: object) => void} handlers.onUpsert
 * @param {(payload: {id: string}) => void} handlers.onDelete
 * @param {() => void} handlers.onDeleteAll
 * @param {(payload: {records: object[]}) => void} handlers.onBulkUpsert
 * @returns {Promise<{close: () => void}>}
 */
export async function connectLiveUpdates(handlers) {
  if (!BASE) return { close() {} };

  // http -> ws, https -> wss
  const wsBase = BASE.replace(/^http/, "ws");

  let ws = null;
  let closed = false;
  let pingTimer = null;
  let reconnectTimer = null;

  function dispatch(message) {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      return; // e.g. "pong" keepalive
    }
    const { event, data } = parsed || {};
    switch (event) {
      case "record:upsert":
        handlers.onUpsert?.(data);
        break;
      case "record:delete":
        handlers.onDelete?.(data);
        break;
      case "record:delete-all":
        handlers.onDeleteAll?.();
        break;
      case "record:bulk-upsert":
        handlers.onBulkUpsert?.(data);
        break;
    }
  }

  function scheduleReconnect() {
    // We immediately retry, so the link is "connecting", not gone.
    handlers.onStatus?.("connecting");
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    ws = null;
    if (!closed) reconnectTimer = setTimeout(open, 2000);
  }

  async function open() {
    if (closed) return;
    handlers.onStatus?.("connecting");

    const token = await getStreamToken();
    if (!token) {
      reconnectTimer = setTimeout(open, 5000);
      return;
    }

    ws = new WebSocket(`${wsBase}/me/stream?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      handlers.onStatus?.("connected");
      // Keep the socket warm; the server auto-responds "pong".
      pingTimer = setInterval(() => {
        try {
          ws?.send("ping");
        } catch {
          // ignore
        }
      }, 25000);
    };

    ws.onmessage = (e) => dispatch(e.data);
    ws.onclose = scheduleReconnect;
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        // onclose will handle reconnect
      }
    };
  }

  await open();

  return {
    close() {
      closed = true;
      handlers.onStatus?.("disconnected");
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
        ws = null;
      }
    },
  };
}
