import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateRecordInputSchema,
  UpdateRecordInputSchema,
  BulkUpsertInputSchema,
} from "@season-sprint/shared";
import type { Env } from "../index";
import getEmail from "../getEmail";
import { parseDate } from "../utils/parseDate";
import { broadcast } from "../utils/broadcast";

const records = new Hono<Env>();

records.get("/", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");

  const mode = c.req.query("mode") ?? "world-tour";
  const result = await db.getUserRecords(userId, mode);
  return c.json(result);
});

records.post("/", zValidator("json", CreateRecordInputSchema), async (c) => {
  const { userId, email: cachedEmail } = c.get("auth");
  const email = await getEmail(userId, c.env, cachedEmail);
  const db = c.get("db");

  const { date, winPoints, mode } = c.req.valid("json");
  const resolvedMode = mode ?? "world-tour";

  const record = await db.upsertRecord(
    userId,
    email,
    new Date(date),
    winPoints,
    resolvedMode
  );

  broadcast(c, userId, "record:upsert", record);

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
    body = await c.req.json();
  } catch {
    body = {};
  }
  const fields =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  // Each field is validated independently (rather than parsing `fields` as a whole)
  // so a malformed field doesn't wipe out an otherwise-valid one.
  const dateResult = UpdateRecordInputSchema.shape.date.safeParse(fields.date);
  const winPointsResult = UpdateRecordInputSchema.shape.winPoints.safeParse(fields.winPoints);

  const date = dateResult.success ? parseDate(dateResult.data) : undefined;
  const winPoints = winPointsResult.success ? winPointsResult.data : undefined;

  if (date === undefined && winPoints === undefined) {
    return c.text("No fields to update", 400);
  }

  const updated = await db.updateRecordIfOwner(userId, id, { date, winPoints });
  if (!updated) {
    return c.text("Not found", 404);
  }

  broadcast(c, userId, "record:upsert", updated);

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

  broadcast(c, userId, "record:delete", { id, mode: deleted.mode });

  return c.json({ deleted: true });
});

records.delete("/", async (c) => {
  const { userId } = c.get("auth");
  const db = c.get("db");

  const mode = c.req.query("mode") ?? "world-tour";
  const count = await db.deleteAllUserRecords(userId, mode);

  broadcast(c, userId, "record:delete-all", { mode });

  return c.json({ deleted: count });
});

records.post("/bulk", zValidator("json", BulkUpsertInputSchema), async (c) => {
  const { userId, email: cachedEmail } = c.get("auth");
  const email = await getEmail(userId, c.env, cachedEmail);
  const db = c.get("db");

  const { records: input, mode } = c.req.valid("json");
  const resolvedMode = mode ?? "world-tour";

  const result = await db.bulkUpsertRecords(
    userId,
    email,
    input.map((r) => ({ date: new Date(r.date), winPoints: r.winPoints })),
    resolvedMode
  );

  broadcast(c, userId, "record:bulk-upsert", {
    records: result,
    mode: resolvedMode,
  });

  return c.json({ records: result });
});

export default records;
