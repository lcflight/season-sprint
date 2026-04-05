import { Hono } from "hono";
import type { Env } from "../index";
import { resolveStreamAuth } from "../middleware/auth";

const stream = new Hono<Env>();

stream.use("*", resolveStreamAuth);

stream.get("/", async (c) => {
  const { userId } = c.get("auth");

  const id = c.env.USER_STREAM.idFromName(userId);
  const stub = c.env.USER_STREAM.get(id);

  return stub.fetch(
    new Request(new URL("/connect", c.req.url).toString(), {
      headers: c.req.raw.headers,
    })
  );
});

export default stream;
