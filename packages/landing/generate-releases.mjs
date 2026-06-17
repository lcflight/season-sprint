/* Build-time generator for releases.json.
 *
 * Run during the Render static-site build (`pnpm -F landing build`). It fetches
 * the latest GitHub release once, at deploy time, and bakes a trimmed snapshot
 * into releases.json so the downloads page can read it same-origin — instant,
 * no per-visitor GitHub API call, no rate limit.
 *
 * Freshness: a new release triggers a Render redeploy via a deploy hook (see
 * .github/workflows/refresh-landing.yml), which re-runs this script.
 *
 * This never fails the build: if GitHub is unreachable it leaves any existing
 * releases.json in place and exits 0. The page also falls back to the live
 * GitHub API at runtime if releases.json is missing or stale.
 */
import { writeFile } from "node:fs/promises";

const REPO = "lcflight/season-sprint";
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const OUT = new URL("./releases.json", import.meta.url);

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "season-sprint-landing-build",
};
// GitHub raises the rate limit a lot when a token is present (Render exposes
// none by default, but honour one if provided).
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

try {
  const res = await fetch(API, { headers });
  if (!res.ok) {
    console.warn(`[releases] GitHub API ${res.status}; keeping existing releases.json`);
    process.exit(0);
  }
  const r = await res.json();
  const snapshot = {
    tag: r.tag_name,
    name: r.name,
    published_at: r.published_at,
    html_url: r.html_url,
    assets: (r.assets || []).map((a) => ({
      name: a.name,
      size: a.size,
      download_url: a.browser_download_url,
      content_type: a.content_type,
    })),
    generated_at: new Date().toISOString(),
  };
  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(
    `[releases] wrote releases.json — ${snapshot.tag}, ${snapshot.assets.length} asset(s)`
  );
} catch (err) {
  console.warn(`[releases] generation failed (${err.message}); keeping existing releases.json`);
  process.exit(0);
}
