import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../index";
import { resolveStreamAuth } from "../middleware/auth";

const stream = new Hono<Env>();

stream.use("*", cors());
stream.use("*", resolveStreamAuth);

stream.get("/", (c) => {
  const { userId } = c.get("auth");

  const id = c.env.USER_STREAM.idFromName(userId);
  const stub = c.env.USER_STREAM.get(id);

  // Forward to the DO — return its streaming response directly
  const url = new URL(c.req.url);
  url.pathname = "/connect";
  url.search = "";
  return stub.fetch(url.toString());
});

export default stream;
