/**
 * Durable Object that manages live connections for a single user via WebSockets,
 * using the Hibernation API so connections survive DO eviction.
 *
 * Routes (internal, called by the Worker):
 *   GET  (Upgrade: websocket) — establishes a hibernatable WebSocket for a client
 *   POST /broadcast           — sends an event to all of the user's connected sockets
 */
export class UserStream implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
    // Answer client "ping" messages with "pong" without waking the DO from hibernation.
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleUpgrade();
    }

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/broadcast") {
      return this.handleBroadcast(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private handleUpgrade(): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // Hibernation API: register the socket with the runtime (do NOT call server.accept()).
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const { event, data } = await request.json<{
      event: string;
      data: unknown;
    }>();

    const message = JSON.stringify({ event, data });
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // Dead socket; the runtime removes it from getWebSockets() automatically.
      }
    }

    return new Response("ok");
  }

  // No webSocketClose/webSocketError handlers are needed: with the Hibernation API,
  // closed/errored sockets are removed from getWebSockets() automatically.
}
