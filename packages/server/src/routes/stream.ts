import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../index";

const stream = new Hono<Env>();

stream.use("*", cors());

/**
 * POST /me/stream/token — Exchange Clerk auth for a stream token.
 * Called via normal authenticated fetch (Authorization header).
 * Returns a short-lived HMAC token the EventSource can use as a query param.
 *
 * This route runs AFTER the global auth middleware (clerkOrDevToken + resolveAuth)
 * because it's mounted under /me/stream but only matches /token, not /.
 * The SSE GET / route handles its own auth via query param.
 */

/** Verify and decode a stream token. Returns userId or null. */
async function verifyStreamToken(
  token: string,
  secretKey: string
): Promise<string | null> {
  const parts = token.split(":");
  if (parts.length !== 3) return null;
  const [userId, expStr, sigHex] = parts;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || Date.now() / 1000 > exp) return null;

  const payload = [userId, expStr].join(":");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const hexPairs = sigHex.match(/.{2}/g);
  if (!hexPairs) return null;
  const sigBytes = new Uint8Array(
    hexPairs.map((h) => parseInt(h, 16))
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(payload)
  );
  return valid ? userId : null;
}

/** SSE stream — authenticates via stream token or API key in query param */
stream.get("/", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Unauthorized", 401);

  let userId: string | null = null;

  // Try stream token first (userId:exp:sig)
  if (token.includes(":")) {
    userId = await verifyStreamToken(token, c.env.CLERK_SECRET_KEY);
  }

  // Fall back to API key
  if (!userId && token.startsWith("sk_")) {
    const { hashApiKey } = await import("../utils/apiKey");
    const db = c.get("db");
    const hash = await hashApiKey(token);
    const user = await db.getUserByApiKeyHash(hash);
    if (user) userId = user.clerkUserId;
  }

  if (!userId) return c.text("Unauthorized", 401);

  const id = c.env.USER_STREAM.idFromName(userId);
  const stub = c.env.USER_STREAM.get(id);

  const url = new URL(c.req.url);
  url.pathname = "/connect";
  url.search = "";
  return stub.fetch(url.toString());
});

export default stream;
