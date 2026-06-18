import type { Env } from "../index";
import type { MiddlewareHandler } from "hono";

/**
 * Parse the comma-separated ADMIN_CLERK_USER_IDS allowlist into a set.
 * The allowlist guarantees the owner is always an admin regardless of DB
 * state, which prevents a bootstrap lockout for the admin panel.
 */
export function allowlist(env: Env["Bindings"]): Set<string> {
  return new Set(
    (env.ADMIN_CLERK_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** Returns true if the user is an admin via the env allowlist or the DB flag. */
export async function isAdmin(
  c: Parameters<MiddlewareHandler<Env>>[0]
): Promise<boolean> {
  const { userId } = c.get("auth");
  if (allowlist(c.env).has(userId)) return true;
  return c.get("db").isUserAdmin(userId);
}

/** Guards admin-only routes. Must run after resolveAuth. */
export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (!(await isAdmin(c))) {
    return c.text("Forbidden", 403);
  }
  return next();
};
