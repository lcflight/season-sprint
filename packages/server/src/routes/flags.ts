import { Hono } from "hono";
import type { Env } from "../index";
import { isAdmin } from "../middleware/admin";

const flags = new Hono<Env>();

// Resolved flags + admin status for the current user, fetched on app boot.
flags.get("/", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");

  const [resolved, admin] = await Promise.all([
    db.getResolvedFlags(userId),
    isAdmin(c),
  ]);

  return c.json({ flags: resolved, isAdmin: admin });
});

export default flags;
