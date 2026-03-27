import { describe, it, expect, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
import { DbService } from "../src/services/db";
import fs from "fs";
import path from "path";

async function createTestD1(): Promise<D1Database> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: { DB: "test-db" },
  });
  const d1 = await mf.getD1Database("DB");

  // Apply migrations from files using batch()
  const migrationsDir = path.resolve(__dirname, "../migrations");
  const files = fs.readdirSync(migrationsDir).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    // Strip comments, collapse whitespace, split on semicolons
    const stripped = sql.replace(/--.*$/gm, "");
    const statements = stripped
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 0);
    await d1.batch(statements.map((s) => d1.prepare(s)));
  }

  return d1;
}

describe("DbService", () => {
  let d1: D1Database;
  let db: DbService;

  beforeEach(async () => {
    d1 = await createTestD1();
    db = new DbService(d1);
  });

  describe("existing methods (baseline)", () => {
    it("upsertRecord creates a user and record", async () => {
      const record = await db.upsertRecord(
        "clerk-1",
        "test@example.com",
        new Date("2026-03-01"),
        100
      );

      expect(record).toMatchObject({
        date: expect.any(Date),
        winPoints: 100,
      });
      expect(record.id).toBeDefined();
    });

    it("getUserRecords returns records for a user", async () => {
      await db.upsertRecord("clerk-1", "test@example.com", new Date("2026-03-01"), 100);
      await db.upsertRecord("clerk-1", "test@example.com", new Date("2026-03-02"), 200);

      const records = await db.getUserRecords("clerk-1");
      expect(records).toHaveLength(2);
      expect(records[0].winPoints).toBe(200); // DESC order
      expect(records[1].winPoints).toBe(100);
    });
  });

  describe("deleteRecordIfOwner", () => {
    it("deletes an owned record and returns true", async () => {
      const record = await db.upsertRecord(
        "clerk-1",
        "test@example.com",
        new Date("2026-03-01"),
        100
      );

      const result = await db.deleteRecordIfOwner("clerk-1", record.id);
      expect(result).toBe(true);

      const remaining = await db.getUserRecords("clerk-1");
      expect(remaining).toHaveLength(0);
    });

    it("returns false for a record owned by another user", async () => {
      const record = await db.upsertRecord(
        "clerk-1",
        "user1@example.com",
        new Date("2026-03-01"),
        100
      );

      const result = await db.deleteRecordIfOwner("clerk-2", record.id);
      expect(result).toBe(false);

      // Record should still exist
      const remaining = await db.getUserRecords("clerk-1");
      expect(remaining).toHaveLength(1);
    });

    it("returns false for a non-existent record", async () => {
      const result = await db.deleteRecordIfOwner("clerk-1", "non-existent-id");
      expect(result).toBe(false);
    });
  });

  describe("deleteAllUserRecords", () => {
    it("deletes all records for a user", async () => {
      await db.upsertRecord("clerk-1", "test@example.com", new Date("2026-03-01"), 100);
      await db.upsertRecord("clerk-1", "test@example.com", new Date("2026-03-02"), 200);

      const count = await db.deleteAllUserRecords("clerk-1");
      expect(count).toBe(2);

      const remaining = await db.getUserRecords("clerk-1");
      expect(remaining).toHaveLength(0);
    });

    it("does not affect records from other users", async () => {
      await db.upsertRecord("clerk-1", "user1@example.com", new Date("2026-03-01"), 100);
      await db.upsertRecord("clerk-2", "user2@example.com", new Date("2026-03-01"), 200);

      await db.deleteAllUserRecords("clerk-1");

      const user2Records = await db.getUserRecords("clerk-2");
      expect(user2Records).toHaveLength(1);
      expect(user2Records[0].winPoints).toBe(200);
    });

    it("returns 0 when user has no records", async () => {
      const count = await db.deleteAllUserRecords("clerk-nonexistent");
      expect(count).toBe(0);
    });
  });

  describe("bulkUpsertRecords", () => {
    it("creates multiple records at once", async () => {
      const records = await db.bulkUpsertRecords("clerk-1", "test@example.com", [
        { date: new Date("2026-03-01"), winPoints: 100 },
        { date: new Date("2026-03-02"), winPoints: 200 },
        { date: new Date("2026-03-03"), winPoints: 300 },
      ]);

      expect(records).toHaveLength(3);
      expect(records[0].winPoints).toBe(100);
      expect(records[1].winPoints).toBe(200);
      expect(records[2].winPoints).toBe(300);
      records.forEach((r) => expect(r.id).toBeDefined());
    });

    it("upserts existing dates instead of duplicating", async () => {
      await db.upsertRecord("clerk-1", "test@example.com", new Date("2026-03-01"), 100);

      const records = await db.bulkUpsertRecords("clerk-1", "test@example.com", [
        { date: new Date("2026-03-01"), winPoints: 999 },
        { date: new Date("2026-03-02"), winPoints: 200 },
      ]);

      expect(records).toHaveLength(2);

      const allRecords = await db.getUserRecords("clerk-1");
      expect(allRecords).toHaveLength(2);

      const march1 = allRecords.find(
        (r) => new Date(r.date).toISOString().slice(0, 10) === "2026-03-01"
      );
      expect(march1?.winPoints).toBe(999); // updated, not duplicated
    });

    it("returns empty array for empty input", async () => {
      const records = await db.bulkUpsertRecords("clerk-1", "test@example.com", []);
      expect(records).toEqual([]);
    });
  });
});
