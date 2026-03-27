import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseSeasons,
  pickCurrentSeason,
  getCachedSeasons,
  scrapeAndStore,
} from "../src/services/seasonScraper";
import { Miniflare } from "miniflare";
import fs from "fs";
import path from "path";

// Minimal wikitable HTML fixture matching the real wiki structure
const WIKI_HTML = `
<html><body>
<table class="wikitable">
<tbody><tr>
<th>Season</th>
<th>Duration</th>
<th>Sponsor(s)</th>
<th>New Content</th>
<th>Events</th>
</tr>
<tr>
<td><a href="/wiki/Season_3" title="Season 3">Season 3</a></td>
<td>March 14 2024 -<br/> June 20 2024</td>
<td><ul><li>SomeOrg</li></ul></td>
<td><ul><li>Stuff</li></ul></td>
<td></td>
</tr>
<tr>
<td><a href="/wiki/Season_2" title="Season 2">Season 2</a></td>
<td>March 14, 2024 - June 12, 2024</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td><a href="/wiki/Season_1" title="Season 1">Season 1</a></td>
<td>December 7, 2023 -<br/>March 14, 2024</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td><a href="/wiki/Season_0" title="Season 0">Season 0</a></td>
<td>March 7, 2023 -<br/>November 5, 2023</td>
<td></td>
<td></td>
<td></td>
</tr>
</tbody></table>
</body></html>
`;

// HTML with footnote refs in dates
const WIKI_HTML_FOOTNOTES = `
<html><body>
<table class="wikitable">
<tbody><tr>
<th>Season</th><th>Duration</th><th>Other</th>
</tr>
<tr>
<td>Season 5</td>
<td>January 10 2025[1] - April 5 2025[2]</td>
<td></td>
</tr>
</tbody></table>
</body></html>
`;

// HTML with "present"/"ongoing" end date
const WIKI_HTML_ONGOING = `
<html><body>
<table class="wikitable">
<tbody><tr>
<th>Season</th><th>Duration</th><th>Other</th>
</tr>
<tr>
<td>Season 10</td>
<td>March 26 2026 - present</td>
<td></td>
</tr>
</tbody></table>
</body></html>
`;

// HTML with separate Start/End columns
const WIKI_HTML_SEPARATE_COLS = `
<html><body>
<table class="wikitable">
<tbody><tr>
<th>Season</th><th>Start Date</th><th>End Date</th>
</tr>
<tr>
<td>Season 1</td>
<td>December 7, 2023</td>
<td>March 14, 2024</td>
</tr>
</tbody></table>
</body></html>
`;

// Empty / no table
const WIKI_HTML_EMPTY = `<html><body><p>No tables here</p></body></html>`;

// Fallback: table without wikitable class but with 3+ columns
const WIKI_HTML_FALLBACK = `
<html><body>
<table>
<tbody>
<tr><td>Season 1</td><td>December 7, 2023</td><td>March 14, 2024</td></tr>
</tbody>
</table>
</body></html>
`;

describe("seasonScraper", () => {
  describe("parseSeasons", () => {
    it("extracts seasons from a wikitable with Duration column", () => {
      const seasons = parseSeasons(WIKI_HTML);
      expect(seasons.length).toBeGreaterThanOrEqual(3);
      const s0 = seasons.find((s) => s.name === "Season 0");
      expect(s0).toBeDefined();
      expect(s0!.start).toContain("2023");
      expect(s0!.end).toContain("2023");
    });

    it("parses dates with commas (Month DD, YYYY)", () => {
      const seasons = parseSeasons(WIKI_HTML);
      const s1 = seasons.find((s) => s.name === "Season 1");
      expect(s1).toBeDefined();
      expect(s1!.start).not.toBeNull();
      expect(s1!.end).not.toBeNull();
    });

    it("strips footnote refs from dates", () => {
      const seasons = parseSeasons(WIKI_HTML_FOOTNOTES);
      expect(seasons).toHaveLength(1);
      expect(seasons[0].name).toBe("Season 5");
      expect(seasons[0].start).toContain("2025");
      expect(seasons[0].end).toContain("2025");
    });

    it('handles "present"/"ongoing" end dates as null', () => {
      const seasons = parseSeasons(WIKI_HTML_ONGOING);
      expect(seasons).toHaveLength(1);
      expect(seasons[0].name).toBe("Season 10");
      expect(seasons[0].start).toContain("2026");
      expect(seasons[0].end).toBeNull();
    });

    it("handles separate Start/End columns", () => {
      const seasons = parseSeasons(WIKI_HTML_SEPARATE_COLS);
      expect(seasons).toHaveLength(1);
      expect(seasons[0].name).toBe("Season 1");
      expect(seasons[0].start).toContain("2023");
      expect(seasons[0].end).toContain("2024");
    });

    it("returns empty array for HTML with no tables", () => {
      const seasons = parseSeasons(WIKI_HTML_EMPTY);
      expect(seasons).toEqual([]);
    });

    it("falls back to any table with 3+ columns", () => {
      const seasons = parseSeasons(WIKI_HTML_FALLBACK);
      expect(seasons).toHaveLength(1);
      expect(seasons[0].name).toBe("Season 1");
      expect(seasons[0].source).toBe("fallback");
    });

    it("deduplicates seasons by name+start", () => {
      // WIKI_HTML has Season 3 and Season 2 with overlapping start dates
      const seasons = parseSeasons(WIKI_HTML);
      const names = seasons.map((s) => s.name);
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });
  });

  describe("pickCurrentSeason", () => {
    it("returns the season where now is between start and end", () => {
      const seasons = [
        { name: "Season 1", start: "2023-12-07T00:00:00.000Z", end: "2024-03-14T00:00:00.000Z", source: "wikitable" },
        { name: "Season 2", start: "2024-03-14T00:00:00.000Z", end: "2024-06-20T00:00:00.000Z", source: "wikitable" },
      ];
      const now = new Date("2024-04-01T00:00:00.000Z");
      const current = pickCurrentSeason(seasons, now);
      expect(current).not.toBeNull();
      expect(current!.name).toBe("Season 2");
    });

    it("returns season with null end if start is before now", () => {
      const seasons = [
        { name: "Season 10", start: "2026-03-26T00:00:00.000Z", end: null, source: "wikitable" },
      ];
      const now = new Date("2026-04-01T00:00:00.000Z");
      const current = pickCurrentSeason(seasons, now);
      expect(current).not.toBeNull();
      expect(current!.name).toBe("Season 10");
    });

    it("returns null when no season matches", () => {
      const seasons = [
        { name: "Season 1", start: "2023-12-07T00:00:00.000Z", end: "2024-03-14T00:00:00.000Z", source: "wikitable" },
      ];
      const now = new Date("2025-01-01T00:00:00.000Z");
      const current = pickCurrentSeason(seasons, now);
      expect(current).toBeNull();
    });

    it("picks latest start when multiple seasons overlap", () => {
      const seasons = [
        { name: "Season 1", start: "2024-01-01T00:00:00.000Z", end: "2024-06-01T00:00:00.000Z", source: "wikitable" },
        { name: "Season 2", start: "2024-03-01T00:00:00.000Z", end: "2024-09-01T00:00:00.000Z", source: "wikitable" },
      ];
      const now = new Date("2024-04-01T00:00:00.000Z");
      const current = pickCurrentSeason(seasons, now);
      expect(current!.name).toBe("Season 2");
    });
  });

  describe("D1 cache operations", () => {
    let d1: D1Database;

    async function createTestD1(): Promise<D1Database> {
      const mf = new Miniflare({
        modules: true,
        script:
          "export default { fetch() { return new Response('ok'); } }",
        d1Databases: { DB: "test-db" },
      });
      const db = await mf.getD1Database("DB");

      // Apply all migrations
      const migrationsDir = path.resolve(__dirname, "../migrations");
      const files = fs.readdirSync(migrationsDir).sort();
      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        const stripped = sql.replace(/--.*$/gm, "");
        const statements = stripped
          .split(";")
          .map((s) => s.replace(/\s+/g, " ").trim())
          .filter((s) => s.length > 0);
        await db.batch(statements.map((s) => db.prepare(s)));
      }

      return db;
    }

    beforeEach(async () => {
      d1 = await createTestD1();
    });

    it("getCachedSeasons returns null when cache is empty", async () => {
      const result = await getCachedSeasons(d1);
      expect(result).toBeNull();
    });

    it("scrapeAndStore writes to D1 and returns payload", async () => {
      // Mock global fetch to return wiki HTML
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(WIKI_HTML, { status: 200 })
      );

      try {
        const result = await scrapeAndStore(d1);
        expect(result.seasons.length).toBeGreaterThan(0);
        expect(result.source).toContain("thefinals.wiki");
        expect(result.fetchedAt).toBeDefined();

        // Verify it was cached
        const cached = await getCachedSeasons(d1);
        expect(cached).not.toBeNull();
        expect(cached!.seasons.length).toBe(result.seasons.length);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("scrapeAndStore does not overwrite cache if parsing returns 0 seasons", async () => {
      // Seed cache with existing data
      const existing = JSON.stringify({
        fetchedAt: "2026-01-01T00:00:00.000Z",
        source: "test",
        seasons: [{ name: "Season 1", start: "2023-12-07T00:00:00.000Z", end: "2024-03-14T00:00:00.000Z", source: "test" }],
        currentSeason: null,
      });
      await d1
        .prepare(
          `INSERT INTO ScrapeCache ("key", "value", "updatedAt") VALUES (?, ?, datetime('now'))`
        )
        .bind("finals-seasons", existing)
        .run();

      // Mock fetch to return empty HTML
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(WIKI_HTML_EMPTY, { status: 200 })
      );

      try {
        const result = await scrapeAndStore(d1);
        // Should return existing cached data, not overwrite
        expect(result.seasons).toHaveLength(1);
        expect(result.seasons[0].name).toBe("Season 1");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
