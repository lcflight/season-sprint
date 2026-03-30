import { Hono } from "hono";
import { DbService } from "./services/db";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { cors } from "hono/cors";
import type { Record } from "./types";
import getEmail from "./getEmail";
import { parseDate } from "./utils/parseDate";
import { getCachedSeasons, scrapeAndStore } from "./services/seasonScraper";

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
  // Ensure the D1 binding exists at runtime
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
    // No cache yet — bootstrap with a live scrape
    const fresh = await scrapeAndStore(c.env.D1);
    c.header("Cache-Control", "public, max-age=3600");
    return c.json(fresh);
  } catch {
    return c.json({ error: "Season data unavailable" }, 503);
  }
});

const clerk = clerkMiddleware();
app.use("*", async (c, next) => {
  // In local/dev-token mode, skip Clerk middleware entirely.
  if (c.req.header("Authorization") === c.env.DEV_AUTH_TOKEN) {
    return next();
  }
  return clerk(c, next);
});

app.use("*", async (c, next) => {
  const authFromHeader = c.req.header("Authorization");

  if (authFromHeader && authFromHeader === c.env.DEV_AUTH_TOKEN) {
    c.set("auth", {
      userId: c.env.DEV_USER_ID,
    });
    return next();
  }

  const auth = getAuth(c);

  if (!auth?.isAuthenticated || !auth.userId) {
    return c.text("Unauthorized", 401);
  }

  c.set("auth", { userId: auth.userId });

  return next();
});

app.get("/me/records", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");

  const records = await db.getUserRecords(userId);
  return c.json(records);
});

app.post("/me/records", async (c) => {
  const { userId } = c.get("auth");
  const email = await getEmail(userId, c.env);

  const db = c.get("db");

  const { date, winPoints } = await c.req.json<Record>();

  const record = await db.upsertRecord(userId, email, date, winPoints);

  return c.json({
    message: "Record upserted",
    userEmail: email,
    userId,
    record,
  });
});

// Update a record that belongs to the authenticated user
app.put("/me/records/:id", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json<
      Partial<{ date: string | Date; winPoints: number }>
    >();
  } catch {
    body = {};
  }

  const maybeDate = (body as { date?: string | Date }).date;
  const maybeWinPoints = (body as { winPoints?: unknown }).winPoints;

  const date = parseDate(maybeDate);
  const winPoints =
    typeof maybeWinPoints === "number" ? maybeWinPoints : undefined;

  if (date === undefined && winPoints === undefined) {
    return c.text("No fields to update", 400);
  }

  const updated = await db.updateRecordIfOwner(userId, id, { date, winPoints });
  if (!updated) {
    // Hide whether the record exists to avoid leaking info
    return c.text("Not found", 404);
  }

  return c.json(updated);
});

// Delete a single record that belongs to the authenticated user
app.delete("/me/records/:id", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");
  const id = c.req.param("id");

  const deleted = await db.deleteRecordIfOwner(userId, id);
  if (!deleted) {
    return c.text("Not found", 404);
  }

  return c.json({ deleted: true });
});

// Delete all records for the authenticated user
app.delete("/me/records", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");

  const count = await db.deleteAllUserRecords(userId);
  return c.json({ deleted: count });
});

// Bulk upsert records for the authenticated user
app.post("/me/records/bulk", async (c) => {
  const { userId } = c.get("auth");
  const email = await getEmail(userId, c.env);
  const db = c.get("db");

  const { records: input } = await c.req.json<{
    records: { date: string; winPoints: number }[];
  }>();

  const records = await db.bulkUpsertRecords(
    userId,
    email,
    input.map((r) => ({ date: new Date(r.date), winPoints: r.winPoints }))
  );

  return c.json({ records });
});

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
