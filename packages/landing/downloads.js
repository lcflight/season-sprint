/* Downloads page.
 *
 * Primary source is /releases.json — a trimmed snapshot of the latest GitHub
 * release baked at deploy time (see generate-releases.mjs). Reading it
 * same-origin means the cards render instantly, with no per-visitor GitHub API
 * call and no rate limit.
 *
 * If the snapshot is missing (e.g. the build step didn't run, or local preview
 * without a build), we fall back to the live GitHub API so the page still works
 * everywhere.
 *
 * Asset names drift between releases (e.g. season-sprint-android.apk vs
 * season-sprint-android-debug.apk), so assets are classified by extension/name
 * rather than hardcoded URLs.
 */
(function () {
  "use strict";

  var REPO = "lcflight/season-sprint";
  var SNAPSHOT = "/releases.json";
  var API = "https://api.github.com/repos/" + REPO + "/releases/latest";
  var RELEASES_URL = "https://github.com/" + REPO + "/releases";

  var elList = document.getElementById("downloads");
  var elMeta = document.getElementById("release-meta");

  // Platform definitions, in display order. `match` decides which assets land
  // on this card; the first definition that matches wins.
  var PLATFORMS = [
    {
      key: "windows",
      name: "Windows",
      desc: "Desktop tracker with auto-capture — reads your points off-screen while you play.",
      match: function (n) {
        return /\.exe$/i.test(n) || /\.msi$/i.test(n) || /\.zip$/i.test(n);
      },
      // Prefer the installer over the zip when both exist.
      rank: function (n) {
        return /\.exe$/i.test(n) ? 0 : /\.msi$/i.test(n) ? 1 : 2;
      },
    },
    {
      key: "android",
      name: "Android",
      desc: "Install the APK to log and sync your runs from your phone.",
      match: function (n) {
        return /\.apk$/i.test(n);
      },
      rank: function () {
        return 0;
      },
    },
  ];

  // Normalise both the baked snapshot shape (tag/download_url) and the live
  // GitHub API shape (tag_name/browser_download_url) into one structure.
  function normalize(raw) {
    if (!raw) return null;
    return {
      tag: raw.tag || raw.tag_name || raw.name || "",
      published_at: raw.published_at || "",
      assets: (raw.assets || []).map(function (a) {
        return {
          name: a.name,
          size: a.size,
          url: a.download_url || a.browser_download_url,
        };
      }),
    };
  }

  function classify(assetName) {
    for (var i = 0; i < PLATFORMS.length; i++) {
      if (PLATFORMS[i].match(assetName)) return PLATFORMS[i];
    }
    return null;
  }

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    var mb = bytes / (1024 * 1024);
    if (mb >= 1) return mb.toFixed(1) + " MB";
    var kb = bytes / 1024;
    return Math.max(1, Math.round(kb)) + " KB";
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderFallback(message) {
    elList.innerHTML = "";
    var card = el("div", "download-card");
    var body = el("div", "dl-body");
    body.appendChild(el("h2", "dl-name", "Get the latest build"));
    body.appendChild(
      el(
        "p",
        "dl-desc",
        message ||
          "We couldn't load releases right now. Grab the latest build straight from GitHub."
      )
    );
    card.appendChild(body);
    var link = el("a", "button button-primary", "View releases on GitHub");
    link.href = RELEASES_URL + "/latest";
    link.rel = "noopener";
    card.appendChild(link);
    elList.appendChild(card);
  }

  function renderCard(platform, asset, tag) {
    var card = el("div", "download-card");

    var body = el("div", "dl-body");
    body.appendChild(el("h2", "dl-name", platform.name));
    body.appendChild(el("p", "dl-desc", platform.desc));

    var meta = el("p", "dl-meta");
    var bits = [];
    if (tag) bits.push(tag);
    if (asset.size) bits.push(fmtSize(asset.size));
    meta.textContent = bits.join(" · ");
    if (bits.length) body.appendChild(meta);

    card.appendChild(body);

    var actions = el("div", "dl-actions");
    var dl = el("a", "button button-primary", "Download");
    dl.href = asset.url;
    dl.setAttribute("download", "");
    dl.rel = "noopener";
    dl.setAttribute(
      "aria-label",
      "Download " + platform.name + " — " + asset.name
    );
    actions.appendChild(dl);

    var fileName = el("span", "dl-filename", asset.name);
    actions.appendChild(fileName);

    card.appendChild(actions);
    return card;
  }

  function renderSoon() {
    var card = el("div", "download-card download-card-soon");
    var body = el("div", "dl-body");
    body.appendChild(el("h2", "dl-name", "iOS"));
    body.appendChild(
      el(
        "p",
        "dl-desc",
        "An iOS build is in the works. For now, use the web app on your iPhone."
      )
    );
    card.appendChild(body);
    var note = el("span", "dl-soon-note", "Coming soon");
    card.appendChild(note);
    return card;
  }

  function render(release) {
    var assets = (release && release.assets) || [];
    var tag = release && release.tag;

    // Bucket assets by platform, then pick the best-ranked asset per platform.
    var buckets = {};
    assets.forEach(function (a) {
      if (!a.url) return;
      var p = classify(a.name);
      if (!p) return;
      (buckets[p.key] = buckets[p.key] || []).push(a);
    });

    elList.innerHTML = "";
    var rendered = 0;

    PLATFORMS.forEach(function (p) {
      var list = buckets[p.key];
      if (!list || !list.length) return;
      list.sort(function (a, b) {
        return p.rank(a.name) - p.rank(b.name);
      });
      elList.appendChild(renderCard(p, list[0], tag));
      rendered++;
    });

    // Always show iOS as coming-soon so the platform story stays consistent
    // with the landing page.
    elList.appendChild(renderSoon());

    if (!rendered) {
      renderFallback(
        "This release has no desktop or mobile installers yet. Check GitHub for all assets."
      );
    }

    if (elMeta) {
      var when = fmtDate(release && release.published_at);
      var parts = [];
      if (tag) parts.push("Latest release " + tag);
      if (when) parts.push("published " + when);
      elMeta.textContent = parts.length ? parts.join(" · ") : "Latest release";
    }
  }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (res) {
      if (!res.ok) throw new Error(url + " -> " + res.status);
      return res.json();
    });
  }

  function load() {
    // Same-origin baked snapshot first (instant), then live API, then fallback.
    fetchJson(SNAPSHOT, { cache: "no-cache" })
      .catch(function () {
        return fetchJson(API, {
          headers: { Accept: "application/vnd.github+json" },
        });
      })
      .then(function (raw) {
        render(normalize(raw));
      })
      .catch(function () {
        if (elMeta) {
          elMeta.textContent =
            "Couldn't reach GitHub — open the releases page directly.";
        }
        renderFallback();
      });
  }

  load();
})();
