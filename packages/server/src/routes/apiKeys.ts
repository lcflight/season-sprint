import { Hono } from "hono";
import type { Env } from "../index";
import getEmail from "../getEmail";
import { generateApiKey, hashApiKey, keyPrefix } from "../utils/apiKey";

const apiKeys = new Hono<Env>();

apiKeys.post("/", async (c) => {
  const { userId, email: cachedEmail } = c.get("auth");
  const email = await getEmail(userId, c.env, cachedEmail);
  const db = c.get("db");

  const { name } = await c.req.json<{ name: string }>();
  if (!name || typeof name !== "string") {
    return c.text("name is required", 400);
  }
  if (name.length > 64) {
    return c.text("name must be 64 characters or fewer", 400);
  }

  const existing = await db.listApiKeys(userId);
  if (existing.length >= 10) {
    return c.text("Maximum of 10 API keys per account", 400);
  }

  const rawKey = generateApiKey();
  const hash = await hashApiKey(rawKey);
  const prefix = keyPrefix(rawKey);

  const record = await db.createApiKey(userId, email, name, hash, prefix);

  return c.json({ ...record, key: rawKey });
});

apiKeys.get("/", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");

  const keys = await db.listApiKeys(userId);
  return c.json(keys);
});

apiKeys.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");
  const id = c.req.param("id");

  const revoked = await db.revokeApiKey(userId, id);
  if (!revoked) {
    return c.text("Not found", 404);
  }

  return c.json({ revoked: true });
});

export default apiKeys;
