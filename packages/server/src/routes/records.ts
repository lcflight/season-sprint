import { Hono } from "hono";
import type { Env } from "../index";
import type { Record } from "../types";
import getEmail from "../getEmail";
import { parseDate } from "../utils/parseDate";

const records = new Hono<Env>();

records.get("/", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");

  const result = await db.getUserRecords(userId);
  return c.json(result);
});

records.post("/", async (c) => {
  const { userId, email: cachedEmail } = c.get("auth");
  const email = await getEmail(userId, c.env, cachedEmail);
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

records.put("/:id", async (c) => {
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
    return c.text("Not found", 404);
  }

  return c.json(updated);
});

records.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");
  const id = c.req.param("id");

  const deleted = await db.deleteRecordIfOwner(userId, id);
  if (!deleted) {
    return c.text("Not found", 404);
  }

  return c.json({ deleted: true });
});

records.delete("/", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");

  const count = await db.deleteAllUserRecords(userId);
  return c.json({ deleted: count });
});

records.post("/bulk", async (c) => {
  const { userId, email: cachedEmail } = c.get("auth");
  const email = await getEmail(userId, c.env, cachedEmail);
  const db = c.get("db");

  const { records: input } = await c.req.json<{
    records: { date: string; winPoints: number }[];
  }>();

  const result = await db.bulkUpsertRecords(
    userId,
    email,
    input.map((r) => ({ date: new Date(r.date), winPoints: r.winPoints }))
  );

  return c.json({ records: result });
});

export default records;
