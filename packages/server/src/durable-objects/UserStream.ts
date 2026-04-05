/**
 * Durable Object that manages SSE connections for a single user.
 *
 * Routes (internal, called by the Worker):
 *   GET  /connect   — Establishes an SSE stream (returned to the client)
 *   POST /broadcast — Sends an event to all connected clients
 */
export class UserStream implements DurableObject {
  private connections: Set<WritableStreamDefaultWriter> = new Set();
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/connect") {
      return this.handleConnect();
    }

    if (request.method === "POST" && url.pathname === "/broadcast") {
      return this.handleBroadcast(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private handleConnect(): Response {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    this.connections.add(writer);

    // Schedule keepalive if this is the first connection
    if (this.connections.size === 1) {
      void this.state.storage.setAlarm(Date.now() + 30_000);
    }

    // Clean up when the client disconnects
    void writer.closed
      .then(() => this.connections.delete(writer))
      .catch(() => this.connections.delete(writer));

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const { event, data } = await request.json<{
      event: string;
      data: unknown;
    }>();

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await this.send(payload);

    return new Response("ok");
  }

  async alarm(): Promise<void> {
    // Send keepalive comment to prevent proxy timeouts
    await this.send(":keepalive\n\n");

    // Reschedule if there are still active connections
    if (this.connections.size > 0) {
      void this.state.storage.setAlarm(Date.now() + 30_000);
    }
  }

  private async send(message: string): Promise<void> {
    const encoded = new TextEncoder().encode(message);
    const dead: WritableStreamDefaultWriter[] = [];

    for (const writer of this.connections) {
      try {
        await writer.write(encoded);
      } catch {
        dead.push(writer);
      }
    }

    for (const writer of dead) {
      this.connections.delete(writer);
      try {
        void writer.close();
      } catch {
        // already closed
      }
    }
  }
}
