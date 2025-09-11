#!/usr/bin/env node

import axios from "axios";
import { load as cheerioLoad } from "cheerio";
import dayjs from "dayjs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const URL = "https://www.thefinals.wiki/wiki/Seasons";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "../public/data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "finals-seasons.json");

function parseDate(raw) {
  const s = raw.replace(/\[[^\]]*\]/g, "").trim(); // strip footnote refs
  const d = dayjs(s);
  return d.isValid() ? d.toDate() : null;
}

function normalizeText($el) {
  return $el.text().replace(/\s+/g, " ").trim();
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    headers: {
      "User-Agent": "season-sprint-bot/1.0 (+https://example.local)"
    },
    timeout: 15000,
    // Follow redirects by default
    maxRedirects: 5,
    // Avoid compressed streams issues
    decompress: true
  });
  return res.data;
}

function extractSeasons($, { debug = false } = {}) {
  const seasons = [];

  const allTables = $("table");
  if (debug) {
    console.error(`Debug: found ${allTables.length} tables, ${$(`table.wikitable`).length} with class 'wikitable'`);
  }

  $("table.wikitable").each((ti, table) => {
    const headers = $(table)
      .find("thead th, > tbody > tr:first-child th")
      .map((_, th) => normalizeText($(th)))
      .get();

    if (debug) {
      const sampleFirstRow = $(table).find("tbody tr").eq(headers.length ? 1 : 0).find("td").map((_, td) => normalizeText($(td))).get();
      console.error(`Debug: table #${ti} headers=`, headers, " sampleFirstRow=", sampleFirstRow);
    }

    const lower = headers.map((h) => h.toLowerCase());
    const hasSeasonCol = lower.some((h) => h.includes("season") || h.includes("name"));
    const hasDateCols = lower.some((h) => h.includes("start")) && lower.some((h) => h.includes("end"));
    const hasDurationCol = lower.some((h) => h.includes("duration"));
    if (!hasSeasonCol || (!hasDateCols && !hasDurationCol)) return;

    // Determine column indices
    const idxName = lower.findIndex((h) => h.includes("season") || h.includes("name"));
    const idxStart = lower.findIndex((h) => h.includes("start"));
    const idxEnd = lower.findIndex((h) => h.includes("end"));
    const idxDuration = lower.findIndex((h) => h.includes("duration"));

    $(table)
      .find("tbody tr")
      .slice(headers.length ? 1 : 0) // skip header row if present in tbody
      .each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length < 1) return;
        const name = idxName >= 0 ? normalizeText($(tds[idxName])) : normalizeText($(tds[0]));

        let start = null;
        let end = null;
        if (hasDurationCol && idxDuration >= 0 && tds[idxDuration]) {
          const dur = normalizeText($(tds[idxDuration]));
          const parts = dur.split(/\s*[–-]\s*/); // split on hyphen or en dash
          if (parts.length >= 1) start = parseDate(parts[0]);
          if (parts.length >= 2) end = parseDate(parts[1].replace(/present|ongoing|tbd/i, ""));
        } else if (hasDateCols) {
          const startText = idxStart >= 0 ? normalizeText($(tds[idxStart])) : "";
          const endText = idxEnd >= 0 ? normalizeText($(tds[idxEnd])) : "";
          start = parseDate(startText);
          end = parseDate(endText);
        }

        if (name && start) {
          seasons.push({ name, start, end, source: "wikitable" });
        }
      });
  });

  return seasons;
}

function pickCurrentSeason(seasons, now = new Date()) {
  // Normalize to ensure end is after start; filter invalid
  const valid = seasons.filter((s) => s.start instanceof Date && (!s.end || s.end instanceof Date));

  // If multiple overlapping, pick the one with latest start not after now
  const current = valid
    .filter((s) => s.start <= now && (s.end ? now <= s.end : true))
    .sort((a, b) => b.start - a.start)[0];

  return current || null;
}

(async () => {
  try {
    const html = await fetchHtml(URL);
    const $ = cheerioLoad(html);

    const seasons = extractSeasons($, { debug: Boolean(process.env.DEBUG) });

    // Fallback: try any table with three columns if nothing found
    if (seasons.length === 0) {
      $("table").each((_, table) => {
        const rows = $(table).find("tbody tr");
        rows.each((i, tr) => {
          const tds = $(tr).find("td");
          if (tds.length >= 3) {
            const name = normalizeText($(tds[0]));
            const start = parseDate(normalizeText($(tds[1])));
            const end = parseDate(normalizeText($(tds[2])));
            if (name && start) {
              seasons.push({ name, start, end, source: "fallback" });
            }
          }
        });
      });
    }

    // Deduplicate by name+start
    const unique = [];
    const seen = new Set();
    for (const s of seasons) {
      const key = `${s.name}|${s.start?.toISOString?.()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }

    const current = pickCurrentSeason(unique);

    const out = {
      fetchedAt: new Date().toISOString(),
      source: URL,
      seasons: unique
        .sort((a, b) => (a.start && b.start ? a.start - b.start : 0))
        .map((s) => ({
          name: s.name,
          start: s.start?.toISOString?.() || null,
          end: s.end?.toISOString?.() || null,
          source: s.source
        })),
      currentSeason: current
        ? {
            name: current.name,
            start: current.start?.toISOString?.() || null,
            end: current.end?.toISOString?.() || null
          }
        : null
    };

    // Ensure output directory exists and write JSON for the frontend to consume
    try {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      await fs.writeFile(OUTPUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
    } catch (ioErr) {
      console.error("Failed to write output JSON:", ioErr?.message || ioErr);
    }

    // Still print to stdout for CLI usage
    console.log(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error("Scrape failed:", err?.message || err);
    process.exit(1);
  }
})();

