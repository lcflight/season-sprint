const WIKI_URL = "https://www.thefinals.wiki/wiki/Seasons";

export interface Season {
  name: string;
  start: string | null;
  end: string | null;
  source: string;
}

export interface SeasonsPayload {
  fetchedAt: string;
  source: string;
  seasons: Season[];
  currentSeason: { name: string; start: string | null; end: string | null } | null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function stripFootnotes(text: string): string {
  return text.replace(/\[[^\]]*\]/g, "").trim();
}

function parseDate(raw: string): string | null {
  const s = stripFootnotes(raw).trim();
  if (!s || /^(present|ongoing|tbd)$/i.test(s)) return null;

  // Try parsing with Date constructor
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();

  // Try "Month DD YYYY" without comma
  const match = s.match(
    /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/
  );
  if (match) {
    const d2 = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
    if (!isNaN(d2.getTime())) return d2.toISOString();
  }

  return null;
}

function extractRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const cells: string[] = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(stripHtml(cellMatch[1]));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function extractFromWikitable(tableHtml: string): Season[] {
  const rows = extractRows(tableHtml);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase());
  const idxName = headers.findIndex(
    (h) => h.includes("season") || h.includes("name")
  );
  const idxDuration = headers.findIndex((h) => h.includes("duration"));
  const idxStart = headers.findIndex((h) => h.includes("start"));
  const idxEnd = headers.findIndex((h) => h.includes("end"));

  const hasDateCols = idxStart >= 0 && idxEnd >= 0;
  const hasDuration = idxDuration >= 0;

  if (idxName < 0 || (!hasDateCols && !hasDuration)) return [];

  const seasons: Season[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const name = stripFootnotes(cells[idxName] || "");
    if (!name) continue;

    let start: string | null = null;
    let end: string | null = null;

    if (hasDuration && cells[idxDuration]) {
      const dur = stripFootnotes(cells[idxDuration]);
      const parts = dur.split(/\s*[–\-]\s*/);
      if (parts.length >= 1) start = parseDate(parts[0]);
      if (parts.length >= 2) {
        const endRaw = parts[parts.length - 1];
        end = /^(present|ongoing|tbd)$/i.test(endRaw.trim())
          ? null
          : parseDate(endRaw);
      }
    } else if (hasDateCols) {
      start = parseDate(stripFootnotes(cells[idxStart] || ""));
      end = parseDate(stripFootnotes(cells[idxEnd] || ""));
    }

    if (start) {
      seasons.push({ name, start, end, source: "wikitable" });
    }
  }

  return seasons;
}

function extractFallback(tableHtml: string): Season[] {
  const rows = extractRows(tableHtml);
  const seasons: Season[] = [];

  for (const cells of rows) {
    if (cells.length >= 3) {
      const name = stripFootnotes(cells[0]);
      const start = parseDate(stripFootnotes(cells[1]));
      const end = parseDate(stripFootnotes(cells[2]));
      if (name && start) {
        seasons.push({ name, start, end, source: "fallback" });
      }
    }
  }

  return seasons;
}

export function parseSeasons(html: string): Season[] {
  let seasons: Season[] = [];

  // Try wikitable(s) first
  const wikitableRegex =
    /<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let match;
  while ((match = wikitableRegex.exec(html)) !== null) {
    const extracted = extractFromWikitable(match[0]);
    seasons.push(...extracted);
  }

  // Fallback: try any table with 3+ column rows
  if (seasons.length === 0) {
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tMatch;
    while ((tMatch = tableRegex.exec(html)) !== null) {
      const extracted = extractFallback(tMatch[0]);
      seasons.push(...extracted);
    }
  }

  // Deduplicate by name+start
  const seen = new Set<string>();
  const unique: Season[] = [];
  for (const s of seasons) {
    const key = `${s.name}|${s.start}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }

  // Sort by start date
  unique.sort((a, b) => {
    if (!a.start || !b.start) return 0;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  return unique;
}

export function pickCurrentSeason(
  seasons: Season[],
  now: Date = new Date()
): Season | null {
  const nowMs = now.getTime();
  const matching = seasons.filter((s) => {
    if (!s.start) return false;
    const startMs = new Date(s.start).getTime();
    if (startMs > nowMs) return false;
    if (s.end) {
      const endMs = new Date(s.end).getTime();
      return nowMs <= endMs;
    }
    return true; // null end = ongoing
  });

  if (matching.length === 0) return null;

  // Pick the one with the latest start
  matching.sort(
    (a, b) => new Date(b.start!).getTime() - new Date(a.start!).getTime()
  );
  return matching[0];
}

export async function getCachedSeasons(
  d1: D1Database
): Promise<SeasonsPayload | null> {
  const row = await d1
    .prepare(`SELECT "value" FROM "ScrapeCache" WHERE "key" = ?`)
    .bind("finals-seasons")
    .first<{ value: string }>();

  if (!row) return null;

  try {
    return JSON.parse(row.value) as SeasonsPayload;
  } catch {
    return null;
  }
}

export async function scrapeAndStore(
  d1: D1Database
): Promise<SeasonsPayload> {
  let html: string;
  try {
    const res = await fetch(WIKI_URL, {
      headers: {
        "User-Agent": "season-sprint-bot/1.0 (+https://seasonsprint.com)",
      },
    });
    html = await res.text();
  } catch (e) {
    // Fetch failed — return cached if available
    const cached = await getCachedSeasons(d1);
    if (cached) return cached;
    throw new Error(`Failed to fetch wiki and no cache available: ${e}`);
  }

  const seasons = parseSeasons(html);

  // Don't overwrite cache with empty results
  if (seasons.length === 0) {
    const cached = await getCachedSeasons(d1);
    if (cached) return cached;
    // No cache and no results — return empty payload
    return {
      fetchedAt: new Date().toISOString(),
      source: WIKI_URL,
      seasons: [],
      currentSeason: null,
    };
  }

  const currentSeason = pickCurrentSeason(seasons);

  const payload: SeasonsPayload = {
    fetchedAt: new Date().toISOString(),
    source: WIKI_URL,
    seasons,
    currentSeason: currentSeason
      ? { name: currentSeason.name, start: currentSeason.start, end: currentSeason.end }
      : null,
  };

  // Write to D1 cache
  await d1
    .prepare(
      `INSERT INTO "ScrapeCache" ("key", "value", "updatedAt")
       VALUES (?, ?, datetime('now'))
       ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = datetime('now')`
    )
    .bind("finals-seasons", JSON.stringify(payload))
    .run();

  return payload;
}
