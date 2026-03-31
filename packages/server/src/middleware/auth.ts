import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import type { Env } from "../index";
import type { MiddlewareHandler } from "hono";

/**
 * Clerk middleware that skips itself when a dev auth token is present.
 */
const clerk = clerkMiddleware();
export const clerkOrDevToken: MiddlewareHandler<Env> = async (c, next) => {
  if (c.env.DEV_AUTH_TOKEN && c.req.header("Authorization") === c.env.DEV_AUTH_TOKEN) {
    return next();
  }
  return clerk(c, next);
};

/**
 * Resolves the authenticated user. Supports both Clerk and dev-token auth.
 * Returns 401 if no valid auth is found.
 */
export const resolveAuth: MiddlewareHandler<Env> = async (c, next) => {
  const authFromHeader = c.req.header("Authorization");

  if (authFromHeader && authFromHeader === c.env.DEV_AUTH_TOKEN) {
    c.set("auth", { userId: c.env.DEV_USER_ID });
    return next();
  }

  const auth = getAuth(c);

  if (!auth?.isAuthenticated || !auth.userId) {
    return c.text("Unauthorized", 401);
  }

  c.set("auth", { userId: auth.userId });
  return next();
};
