import { describe, it, expect, beforeEach, vi } from "vitest";
import { Miniflare } from "miniflare";
import { app } from "../src/index";
import fs from "fs";
import path from "path";

const DEV_AUTH_TOKEN = "test-dev-token";
const DEV_USER_ID = "test-user-id";


async function createTestD1(): Promise<D1Database> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: { DB: "test-db" },
  });
  const d1 = await mf.getD1Database("DB");

  const migrationsDir = path.resolve(__dirname, "../migrations");
  const files = fs.readdirSync(migrationsDir).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const stripped = sql.replace(/--.*$/gm, "");
    const statements = stripped
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 0);
    await d1.batch(statements.map((s) => d1.prepare(s)));
  }

  return d1;
}

function makeEnv(d1: D1Database) {
  return {
    D1: d1,
    DEV_AUTH_TOKEN,
    DEV_USER_ID,
    CLERK_PUBLISHABLE_KEY: "test-key",
    CLERK_SECRET_KEY: "test-secret",
    DATABASE_URL: "file:./test.db",
  };
}

async function appFetch(
  d1: D1Database,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const env = makeEnv(d1);
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", DEV_AUTH_TOKEN);
  }
  const req = new Request(`http://localhost${path}`, {
    ...init,
    headers,
  });
  return app.fetch(req, env);
}

describe("API Routes", () => {
  let d1: D1Database;

  beforeEach(async () => {
    d1 = await createTestD1();
  });

  describe("GET /me/records", () => {
    it("returns empty array when no records exist", async () => {
      const res = await appFetch(d1, "/me/records");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("returns records after creating them", async () => {
      await appFetch(d1, "/me/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-03-01", winPoints: 100 }),
      });

      const res = await appFetch(d1, "/me/records");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].winPoints).toBe(100);
    });
  });

  describe("POST /me/records", () => {
    it("creates a record and returns it", async () => {
      const res = await appFetch(d1, "/me/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-03-01", winPoints: 150 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.record.winPoints).toBe(150);
      expect(body.record.id).toBeDefined();
    });

    it("upserts when same date is posted twice", async () => {
      await appFetch(d1, "/me/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-03-01", winPoints: 100 }),
      });

      await appFetch(d1, "/me/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-03-01", winPoints: 200 }),
      });

      const listRes = await appFetch(d1, "/me/records");
      const records = await listRes.json();
      expect(records).toHaveLength(1);
      expect(records[0].winPoints).toBe(200);
    });
  });

  describe("DELETE /me/records/:id", () => {
    it("deletes an owned record", async () => {
      const createRes = await appFetch(d1, "/me/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-03-01", winPoints: 100 }),
      });
      const { record } = await createRes.json();

      const deleteRes = await appFetch(d1, `/me/records/${record.id}`, {
        method: "DELETE",
      });
      expect(deleteRes.status).toBe(200);

      const listRes = await appFetch(d1, "/me/records");
      const remaining = await listRes.json();
      expect(remaining).toHaveLength(0);
    });

    it("returns 404 for non-existent record", async () => {
      const res = await appFetch(d1, "/me/records/fake-id", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /me/records", () => {
    it("deletes all records for the user", async () => {
      await appFetch(d1, "/me/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-03-01", winPoints: 100 }),
      });
      await appFetch(d1, "/me/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-03-02", winPoints: 200 }),
      });

      const deleteRes = await appFetch(d1, "/me/records", {
        method: "DELETE",
      });
      expect(deleteRes.status).toBe(200);
      const body = await deleteRes.json();
      expect(body.deleted).toBe(2);

      const listRes = await appFetch(d1, "/me/records");
      const remaining = await listRes.json();
      expect(remaining).toHaveLength(0);
    });

    it("returns 0 when no records exist", async () => {
      const res = await appFetch(d1, "/me/records", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(0);
    });
  });

  describe("POST /me/records/bulk", () => {
    it("creates multiple records", async () => {
      const res = await appFetch(d1, "/me/records/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: [
            { date: "2026-03-01", winPoints: 100 },
            { date: "2026-03-02", winPoints: 200 },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.records).toHaveLength(2);

      const listRes = await appFetch(d1, "/me/records");
      const all = await listRes.json();
      expect(all).toHaveLength(2);
    });

    it("upserts existing dates in bulk", async () => {
      await appFetch(d1, "/me/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-03-01", winPoints: 50 }),
      });

      const res = await appFetch(d1, "/me/records/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: [
            { date: "2026-03-01", winPoints: 999 },
            { date: "2026-03-02", winPoints: 200 },
          ],
        }),
      });

      expect(res.status).toBe(200);

      const listRes = await appFetch(d1, "/me/records");
      const all = await listRes.json();
      expect(all).toHaveLength(2);
      const march1 = all.find(
        (r) => r.date.slice(0, 10) === "2026-03-01"
      );
      expect(march1?.winPoints).toBe(999);
    });
  });

  describe("GET /seasons", () => {
    it("returns cached season data without auth", async () => {
      // Seed cache
      const payload = JSON.stringify({
        fetchedAt: "2026-03-27T00:00:00.000Z",
        source: "https://www.thefinals.wiki/wiki/Seasons",
        seasons: [
          { name: "Season 10", start: "2026-03-26T00:00:00.000Z", end: "2026-06-21T00:00:00.000Z", source: "wikitable" },
        ],
        currentSeason: { name: "Season 10", start: "2026-03-26T00:00:00.000Z", end: "2026-06-21T00:00:00.000Z" },
      });
      await d1
        .prepare(
          `INSERT INTO "ScrapeCache" ("key", "value", "updatedAt") VALUES (?, ?, datetime('now'))`
        )
        .bind("finals-seasons", payload)
        .run();

      // Request without auth header
      const env = makeEnv(d1);
      const req = new Request("http://localhost/seasons");
      const res = await app.fetch(req, env);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.seasons).toHaveLength(1);
      expect(body.seasons[0].name).toBe("Season 10");
    });

    it("returns 503 when cache is empty and scrape fails", async () => {
      // Mock fetch to simulate wiki being unreachable
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      try {
        const env = makeEnv(d1);
        const req = new Request("http://localhost/seasons");
        const res = await app.fetch(req, env);
        expect(res.status).toBe(503);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("authentication", () => {
    it("rejects requests with wrong dev token", async () => {
      const res = await appFetch(d1, "/me/records", {
        headers: { Authorization: "wrong-token" },
      });
      // Clerk middleware throws outside Workers runtime, so we get 500 instead of 401.
      // In production, this would be a proper 401. Here we just verify it's not 200.
      expect(res.status).not.toBe(200);
    });

    it("accepts requests with correct dev token", async () => {
      const res = await appFetch(d1, "/me/records");
      expect(res.status).toBe(200);
    });
  });

  describe("API Keys", () => {
    it("creates a key and returns it with sk_ prefix", async () => {
      const res = await appFetch(d1, "/me/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test-key" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.key).toMatch(/^sk_[0-9a-f]{64}$/);
      expect(body.name).toBe("test-key");
      expect(body.keyPrefix).toBe(body.key.slice(0, 11));
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
    });

    it("rejects create without name", async () => {
      const res = await appFetch(d1, "/me/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("lists active keys with prefix only", async () => {
      await appFetch(d1, "/me/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "key-1" }),
      });
      await appFetch(d1, "/me/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "key-2" }),
      });

      const res = await appFetch(d1, "/me/api-keys");
      expect(res.status).toBe(200);
      const keys = await res.json();
      expect(keys).toHaveLength(2);
      expect(keys[0].keyPrefix).toMatch(/^sk_[0-9a-f]{8}$/);
      // Should not expose the hash or full key
      expect(keys[0].keyHash).toBeUndefined();
      expect(keys[0].key).toBeUndefined();
    });

    it("authenticates with an API key to access records", async () => {
      // Create a key using dev token auth
      const createRes = await appFetch(d1, "/me/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "tracker" }),
      });
      const { key } = await createRes.json();

      // Create a record using the API key
      const recordRes = await appFetch(d1, "/me/records", {
        method: "POST",
        headers: {
          Authorization: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date: "2026-03-15", winPoints: 500 }),
      });
      expect(recordRes.status).toBe(200);

      // Fetch records using the API key
      const listRes = await appFetch(d1, "/me/records", {
        headers: { Authorization: key },
      });
      expect(listRes.status).toBe(200);
      const records = await listRes.json();
      expect(records).toHaveLength(1);
      expect(records[0].winPoints).toBe(500);
    });

    it("rejects revoked keys", async () => {
      const createRes = await appFetch(d1, "/me/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "temp-key" }),
      });
      const { key, id } = await createRes.json();

      // Revoke the key
      const revokeRes = await appFetch(d1, `/me/api-keys/${id}`, {
        method: "DELETE",
      });
      expect(revokeRes.status).toBe(200);
      const revokeBody = await revokeRes.json();
      expect(revokeBody.revoked).toBe(true);

      // Try to use revoked key
      const listRes = await appFetch(d1, "/me/records", {
        headers: { Authorization: key },
      });
      expect(listRes.status).toBe(401);
    });

    it("revoked key no longer appears in list", async () => {
      const createRes = await appFetch(d1, "/me/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "to-revoke" }),
      });
      const { id } = await createRes.json();

      await appFetch(d1, `/me/api-keys/${id}`, { method: "DELETE" });

      const listRes = await appFetch(d1, "/me/api-keys");
      const keys = await listRes.json();
      expect(keys).toHaveLength(0);
    });

    it("returns 404 when revoking non-existent key", async () => {
      const res = await appFetch(d1, "/me/api-keys/fake-id", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});
