import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import type { Env } from "../index";
import type { MiddlewareHandler } from "hono";
import { hashApiKey, isApiKey } from "../utils/apiKey";

/**
 * Clerk middleware that skips itself when a dev auth token or API key is present.
 */
const clerk = clerkMiddleware();
export const clerkOrDevToken: MiddlewareHandler<Env> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  if (
    (c.env.DEV_AUTH_TOKEN && header === c.env.DEV_AUTH_TOKEN) ||
    isApiKey(header)
  ) {
    return next();
  }
  return clerk(c, next);
};

/**
 * Resolves the authenticated user. Supports Clerk, dev-token, and API key auth.
 * Returns 401 if no valid auth is found.
 */
export const resolveAuth: MiddlewareHandler<Env> = async (c, next) => {
  const authFromHeader = c.req.header("Authorization") ?? "";

  // 1. Dev token
  if (authFromHeader && authFromHeader === c.env.DEV_AUTH_TOKEN) {
    c.set("auth", { userId: c.env.DEV_USER_ID });
    return next();
  }

  // 2. API key (sk_...)
  if (isApiKey(authFromHeader)) {
    const db = c.get("db");
    const hash = await hashApiKey(authFromHeader);
    const user = await db.getUserByApiKeyHash(hash);
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    c.set("auth", { userId: user.clerkUserId, email: user.email });
    return next();
  }

  // 3. Clerk
  const auth = getAuth(c);

  if (!auth?.isAuthenticated || !auth.userId) {
    return c.text("Unauthorized", 401);
  }

  c.set("auth", { userId: auth.userId });
  return next();
};

