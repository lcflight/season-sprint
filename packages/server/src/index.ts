import { Hono } from "hono";
import { DbService } from "./services/db";
import { cors } from "hono/cors";
import { getAuth } from "@hono/clerk-auth";
import { getCachedSeasons, scrapeAndStore } from "./services/seasonScraper";
import { clerkOrDevToken, resolveAuth } from "./middleware/auth";
import records from "./routes/records";
import apiKeys from "./routes/apiKeys";
import stream from "./routes/stream";

interface Bindings {
  D1: D1Database;
  USER_STREAM: DurableObjectNamespace;
  DEV_AUTH_TOKEN: string;
  DEV_USER_ID: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
}

export interface Variables {
  db: DbService;
  auth: {
    userId: string;
    email?: string;
  };
}

export interface Env {
  Bindings: Bindings;
  Variables: Variables;
}

const app = new Hono<Env>();

app.use("*", cors());

// Type guard for D1 bindings without using any
const hasPrepare = (db: unknown): db is D1Database => {
  return !!db && typeof (db as { prepare?: unknown }).prepare === "function";
};

app.use("*", async (c, next) => {
  if (!hasPrepare(c.env.D1)) {
    console.error("D1 binding D1 is missing or invalid at runtime");
    return c.text("Server misconfigured: D1 binding missing", 500);
  }
  c.set("db", new DbService(c.env.D1));
  return next();
});

app.get("/", (c) => {
  const auth = getAuth(c);
  console.log({ auth });
  return c.text("Hello Hono!");
});

// Public endpoint — no auth required
app.get("/seasons", async (c) => {
  try {
    const cached = await getCachedSeasons(c.env.D1);
    if (cached) {
      c.header("Cache-Control", "public, max-age=3600");
      return c.json(cached);
    }
    const fresh = await scrapeAndStore(c.env.D1);
    c.header("Cache-Control", "public, max-age=3600");
    return c.json(fresh);
  } catch {
    return c.json({ error: "Season data unavailable" }, 503);
  }
});

// SSE stream — has its own auth via query param (must be before global auth)
app.route("/me/stream", stream);

// Auth middleware (Clerk + dev-token)
app.use("*", clerkOrDevToken);
app.use("*", resolveAuth);

// Authenticated routes
app.route("/me/records", records);
app.route("/me/api-keys", apiKeys);

// Stream token exchange — uses normal Clerk auth to issue a stream token
app.post("/me/stream/token", async (c) => {
  const { userId } = c.get("auth");
  const exp = Math.floor(Date.now() / 1000) + 300; // 5 min TTL
  const payload = `${userId}:${String(exp)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(c.env.CLERK_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return c.json({ token: `${payload}:${sigHex}`, expiresIn: 300 });
});

export { app };
export { UserStream } from "./durable-objects/UserStream";

export default {
  fetch: (req: Request, env: Bindings, ctx: ExecutionContext) =>
    app.fetch(req, env, ctx),
  scheduled(
    _event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(scrapeAndStore(env.D1));
  },
};
