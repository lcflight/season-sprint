import { Hono } from "hono";
import type { Env } from "../index";
import { requireAdmin } from "../middleware/admin";

const admin = new Hono<Env>();

// Every route here is admin-only.
admin.use("*", requireAdmin);

// ── Flags ─────────────────────────────────────────────────────────────────

admin.get("/flags", async (c) => {
  return c.json(await c.get("db").listFlags());
});

admin.post("/flags", async (c) => {
  const { key, description } = await c.req.json<{
    key: string;
    description?: string;
  }>();
  if (!key || typeof key !== "string") {
    return c.text("Missing flag key", 400);
  }
  const flag = await c.get("db").createFlag(key, description ?? "");
  return c.json(flag);
});

admin.patch("/flags/:key", async (c) => {
  const key = c.req.param("key");
  const { enabledGlobally } = await c.req.json<{ enabledGlobally: boolean }>();
  if (typeof enabledGlobally !== "boolean") {
    return c.text("enabledGlobally must be a boolean", 400);
  }
  const flag = await c.get("db").setFlagGlobal(key, enabledGlobally);
  return c.json(flag);
});

// ── Users & per-user overrides ──────────────────────────────────────────────

admin.get("/users", async (c) => {
  const email = c.req.query("email") ?? "";
  return c.json(await c.get("db").searchUsersByEmail(email));
});

admin.put("/users/:userId/flags/:flagKey", async (c) => {
  const userId = c.req.param("userId");
  const flagKey = c.req.param("flagKey");
  const { enabled } = await c.req.json<{ enabled: boolean }>();
  if (typeof enabled !== "boolean") {
    return c.text("enabled must be a boolean", 400);
  }
  const override = await c.get("db").setUserOverride(userId, flagKey, enabled);
  return c.json(override);
});

admin.delete("/users/:userId/flags/:flagKey", async (c) => {
  const userId = c.req.param("userId");
  const flagKey = c.req.param("flagKey");
  const cleared = await c.get("db").clearUserOverride(userId, flagKey);
  return c.json({ cleared });
});

admin.patch("/users/:userId", async (c) => {
  const userId = c.req.param("userId");
  const { isAdmin } = await c.req.json<{ isAdmin: boolean }>();
  if (typeof isAdmin !== "boolean") {
    return c.text("isAdmin must be a boolean", 400);
  }
  const user = await c.get("db").setUserAdmin(userId, isAdmin);
  return c.json(user);
});

export default admin;
