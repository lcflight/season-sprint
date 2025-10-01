import { Hono } from "hono";
import { DbService } from "./services/db";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { cors } from "hono/cors";
import type { Record } from "./types";
import * as dotenv from "dotenv";

dotenv.config();

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

const constants = {
  DEV_AUTH_TOKEN: process.env.DEV_AUTH_TOKEN,
};

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
  const authFromHeader = c.req.header("Authorization");

  if (authFromHeader === constants.DEV_AUTH_TOKEN) {
    c.set("auth", {
      userId: "dev_user_id",
    });
    return next();
  }

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

app.post("/me/records", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");

  const { date, winPoints } = await c.req.json<Record>();

  if (date === undefined || winPoints === undefined) {
    return c.text("Missing data", 400);
  }

  await db.createRecord(userId, date, winPoints);

  return c.json({
    message: "Record created",
    missingData: { date: date, winPoints: winPoints },
  });
});

export default app;
