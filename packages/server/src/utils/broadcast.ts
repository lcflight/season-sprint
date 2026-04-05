import type { Context } from "hono";
import type { Env } from "../index";

/**
 * Send an SSE event to all of a user's connected clients via their Durable Object.
 * Uses waitUntil to avoid blocking the response. Silently no-ops if the DO
 * binding is unavailable (e.g., in tests).
 */
export function broadcast(
  c: Context<Env>,
  userId: string,
  event: string,
  data: unknown
): void {
  const userStream = c.env.USER_STREAM as DurableObjectNamespace | undefined;
  if (!userStream) return;

  const promise = (async () => {
    const id = userStream.idFromName(userId);
    const stub = userStream.get(id);
    await stub.fetch(
      new Request("https://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, data }),
      })
    );
  })();

  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // executionCtx not available (e.g., in tests) — fire and forget
    void promise;
  }
}
