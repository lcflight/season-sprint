import { Hono } from "hono";
import { DbService } from "./services/db";
import { cors } from "hono/cors";
import { getAuth } from "@hono/clerk-auth";
import { getCachedSeasons, scrapeAndStore } from "./services/seasonScraper";
import { clerkOrDevToken, resolveAuth } from "./middleware/auth";
import records from "./routes/records";

interface Bindings {
  D1: D1Database;
  DEV_AUTH_TOKEN: string;
  DEV_USER_ID: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
}

export interface Variables {
  db: DbService;
  auth: {
    userId: string;
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

// Auth middleware (Clerk + dev-token)
app.use("*", clerkOrDevToken);
app.use("*", resolveAuth);

// Authenticated routes
app.route("/me/records", records);

export { app };

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
