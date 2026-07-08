import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateFlagInputSchema,
  ToggleFlagInputSchema,
  SetUserOverrideInputSchema,
  SetUserAdminInputSchema,
} from "@season-sprint/shared";
import type { Env } from "../index";
import { requireAdmin, allowlist } from "../middleware/admin";
import { audit } from "../utils/audit";

const admin = new Hono<Env>();

// Every route here is admin-only.
admin.use("*", requireAdmin);

// ── Flags ─────────────────────────────────────────────────────────────────

admin.get("/flags", async (c) => {
  return c.json(await c.get("db").listFlags());
});

admin.post("/flags", zValidator("json", CreateFlagInputSchema), async (c) => {
  const { key, description } = c.req.valid("json");
  const flag = await c.get("db").createFlag(key, description ?? "");
  audit(c, "flag.create", { key });
  return c.json(flag);
});

admin.patch("/flags/:key", zValidator("json", ToggleFlagInputSchema), async (c) => {
  const key = c.req.param("key");
  const { enabledGlobally } = c.req.valid("json");
  const flag = await c.get("db").setFlagGlobal(key, enabledGlobally);
  audit(c, "flag.setGlobal", { key, enabledGlobally });
  return c.json(flag);
});

// ── Users & per-user overrides ──────────────────────────────────────────────

admin.get("/users", async (c) => {
  const email = c.req.query("email") ?? "";
  const allow = allowlist(c.env);
  const users = await c.get("db").searchUsersByEmail(email);
  // `allowlisted` users are admins via the env allowlist regardless of the DB
  // isAdmin flag (see isAdmin()), so the UI greys out their admin toggle.
  // clerkUserId is only needed for that match — drop it from the response.
  return c.json(
    users.map(({ clerkUserId, ...u }) => ({
      ...u,
      allowlisted: allow.has(clerkUserId),
    }))
  );
});

admin.put(
  "/users/:userId/flags/:flagKey",
  zValidator("json", SetUserOverrideInputSchema),
  async (c) => {
    const userId = c.req.param("userId");
    const flagKey = c.req.param("flagKey");
    const { enabled } = c.req.valid("json");
    const override = await c.get("db").setUserOverride(userId, flagKey, enabled);
    audit(c, "user.flag.override.set", { userId, flagKey, enabled });
    return c.json(override);
  }
);

admin.delete("/users/:userId/flags/:flagKey", async (c) => {
  const userId = c.req.param("userId");
  const flagKey = c.req.param("flagKey");
  const cleared = await c.get("db").clearUserOverride(userId, flagKey);
  audit(c, "user.flag.override.clear", { userId, flagKey, cleared });
  return c.json({ cleared });
});

admin.patch("/users/:userId", zValidator("json", SetUserAdminInputSchema), async (c) => {
  const userId = c.req.param("userId");
  const { isAdmin } = c.req.valid("json");
  const user = await c.get("db").setUserAdmin(userId, isAdmin);
  audit(c, "user.setAdmin", { userId, isAdmin });
  return c.json(user);
});

export default admin;
