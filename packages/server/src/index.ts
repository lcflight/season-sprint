import { Hono } from "hono";
import { DbService } from "./services/db";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { cors } from "hono/cors";

interface Bindings {
  D1: D1Database;
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

app.use("*", async (c, next) => {
  c.set("db", new DbService(c.env.D1));

  return next();
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.use("*", clerkMiddleware());

app.use("*", async (c, next) => {
  const auth = getAuth(c);

  if (!auth?.isAuthenticated) {
    return c.text("Unauthorized", 401);
  }

  c.set("auth", auth);

  return next();
});

app.get("/me/records", (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");

  return c.json(db.getUserRecords(userId));
});

export default app;
