/**
 * Send an SSE event to all of a user's connected clients via their Durable Object.
 * Silently no-ops if the DO binding is unavailable (e.g., in tests).
 */
export async function broadcastToUser(
  userStream: DurableObjectNamespace | undefined,
  userId: string,
  event: string,
  data: unknown
): Promise<void> {
  if (!userStream) return;

  const id = userStream.idFromName(userId);
  const stub = userStream.get(id);

  await stub.fetch(
    new Request("https://do/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
    })
  );
}
