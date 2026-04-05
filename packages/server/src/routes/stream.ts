import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../index";
import { resolveStreamAuth } from "../middleware/auth";

const stream = new Hono<Env>();

stream.use("*", cors());
stream.use("*", resolveStreamAuth);

stream.get("/", async (c) => {
  const { userId } = c.get("auth");

  const id = c.env.USER_STREAM.idFromName(userId);
  const stub = c.env.USER_STREAM.get(id);

  const doRes = await stub.fetch(
    new Request(new URL("/connect", c.req.url).toString())
  );

  // Pass through the DO's SSE stream with CORS headers
  const origin = c.req.header("Origin") ?? "*";
  return new Response(doRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    },
  });
});

export default stream;
