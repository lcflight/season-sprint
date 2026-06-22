# Season Sprint — Landing page

Static marketing site served at **https://www.seasonsprint.com** (apex
`seasonsprint.com` redirects here). The app lives separately at
**https://app.seasonsprint.com**.

Plain HTML/CSS/JS. The only build step bakes `releases.json` for the downloads
page (see below); everything else is static.

## Local preview

```bash
pnpm -F landing dev      # serves this folder on http://localhost:3000
pnpm -F landing build    # regenerate releases.json from the latest GitHub release
```

## Files

- `index.html` — the landing page
- `downloads.html` + `downloads.js` — the downloads page (`/downloads`)
- `install.sh` — Linux installer bootstrap served at `/install.sh`
- `generate-releases.mjs` — build-time script that bakes `releases.json`
- `releases.json` — snapshot of the latest release (regenerated on every deploy)
- `styles.css` — THE FINALS-inspired theme (mirrors `packages/web`)
- `assets/logo.svg` — brand logo (copied from `packages/web/public/logo.svg`)
- `favicon.ico`
- `robots.txt` — allows all crawlers, points to the sitemap
- `sitemap.xml` — lists `/` and `/downloads` for search engines
- `google*.html` — Google Search Console site-verification file (keep
  permanently; deleting it un-verifies the property)

All app CTAs point at `https://app.seasonsprint.com`. The "Get the apps" CTA and
the Linux/Android/Windows platform tiles point at `/downloads`.

### Downloads page

`/downloads` renders one download card per platform. Assets are classified by
extension/name, not hardcoded URLs — `.apk` → Android, `.exe`/`.msi`/`.zip` →
Windows, `.tar.gz`/`.AppImage` → Linux — so the page keeps up with releases
even when asset filenames drift. The Linux card also shows a copyable
`curl … | bash` one-liner that runs `install.sh`. iOS is shown as "coming soon".

**Data source (fast path):** at deploy time `generate-releases.mjs` fetches the
latest release **once** and bakes a trimmed `releases.json` into this folder.
The page reads it **same-origin**, so cards render instantly with no
per-visitor GitHub API call and no rate limit.

**Fallbacks:** if `releases.json` is missing, `downloads.js` falls back to the
live GitHub API (`.../releases/latest`); if that also fails it shows a GitHub
Releases link (and there is a `<noscript>` link too). So the page works whether
or not the build step ran.

**Staying current:** a new release fires
`.github/workflows/refresh-landing.yml`, which POSTs Render's deploy hook to
rebuild the static site and re-bake `releases.json`. Set this up by creating a
Deploy Hook on the landing static site (Render → Settings → Deploy Hook) and
adding its URL as the repo secret `RENDER_LANDING_DEPLOY_HOOK`. Without the
secret the workflow is a no-op and the page still refreshes on the next deploy.

> Clean URL note: links use `/downloads` (no `.html`). Render static sites and
> the `serve` dev command both resolve this to `downloads.html` automatically.

### Linux installer (`install.sh`)

Served from this folder at `/install.sh`. The one-liner
`curl -fsSL https://www.seasonsprint.com/install.sh | bash` downloads the latest
`season-sprint-linux.tar.gz` release asset (built by `.github/workflows/build-linux.yml`
from `packages/local-linux/`), extracts it, and hands off to the bundled
`season-tracker.sh`, which installs deps + EasyOCR, compiles the tracker, and
configures the Steam launch option.

---

## Deploy: split www (landing) from app (the Vue app)

The goal: landing page on `www.seasonsprint.com` + apex, the existing app on
`app.seasonsprint.com`. Hosting is **Render**; DNS is at the domain's DNS host.

The app's Render service is `season-sprint.onrender.com`. The apex
`seasonsprint.com` is an A record to `216.24.57.1` — Render's **shared** apex IP
that routes by hostname, so which service answers for the apex is decided by the
custom-domain assignment inside Render, not by the IP. Leave every `mc.*` and
`clerk`/`accounts`/`clk*`/`clkmail` DNS record untouched.

### 1. Move the existing app to `app.seasonsprint.com`

In the **Render** dashboard, open the app service (`season-sprint`, the
`packages/web` build):

- **Settings → Custom Domains**: add `app.seasonsprint.com`, then remove
  `www.seasonsprint.com` and `seasonsprint.com`.
- In **DNS**: add a `CNAME` record `app.seasonsprint.com` →
  `season-sprint.onrender.com`.

No code change is needed for the app. It reads the API base from
`VUE_APP_API_BASE_URL` (set in Render); the server uses open CORS, so serving
from the `app.` subdomain does not break API calls.

### 2. Create a Render static site for this landing page

New **Static Site** in Render, pointed at this repo:

- **Root Directory:** `packages/landing`
- **Build Command:** `pnpm -F landing build` — bakes `releases.json` from the
  latest GitHub release so the downloads page loads instantly.
- **Publish Directory:** `.`
- **Custom Domains:** add `seasonsprint.com` **and** `www.seasonsprint.com`.

Note the `*.onrender.com` hostname Render assigns this new site, then in **DNS**:

- Change `www.seasonsprint.com` `CNAME` from `season-sprint.onrender.com` to the
  new landing site's `<new-landing>.onrender.com` target.
- Leave the apex A record `seasonsprint.com → 216.24.57.1` as-is. Moving the
  `seasonsprint.com` custom domain from the app service to the landing site (in
  Render) is what re-points the apex.

### 3. Update Clerk allowed origins

In the **Clerk dashboard** (production instance for `clerk.seasonsprint.com`),
add `https://app.seasonsprint.com` to the allowed origins / redirect URLs so
sign-in keeps working after the app moves to the subdomain.

### Cutover order (avoids downtime)

1. Add `app.seasonsprint.com` to the app + its DNS record; confirm the app
   loads there.
2. Update Clerk origins; confirm sign-in works on `app.`.
3. Deploy this landing site and attach `www` + apex; flip the DNS records.
