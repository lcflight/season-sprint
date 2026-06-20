/*
 * season-watcher — Sister tool to season-tracker.
 *
 * Watches the lobby's "SEASON N ENDS IN D DAYS" block (top-left corner) with
 * XShm + the Tesseract C API, then compares the on-screen days-left against the
 * current season's end date from the Season Sprint API (/seasons). If they don't
 * line up — e.g. the scraped wiki end date has gone stale — it raises a single
 * persistent desktop notification (notify-send, urgency=critical).
 *
 * Once it has read and confirmed the block once, its job is done: it fires the
 * comparison (notify on mismatch, log on match) and exits, staying dormant for
 * the rest of the session. It also exits if its launching parent goes away, so
 * a session that never reaches the lobby doesn't leave it polling forever.
 *
 * Build:
 *   gcc -O2 -o season-watcher season-watcher.c \
 *       $(pkg-config --cflags --libs tesseract libcurl x11 xext) -lm
 *
 * Usage:
 *   ./season-watcher        # reads .env, watches, compares, exits
 */

#define _GNU_SOURCE
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <math.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/XShm.h>

#include <tesseract/capi.h>
#include <curl/curl.h>

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define MAX_LOG_LINES    500
#define LOG_PRUNE_EVERY  50
#define POLL_INTERVAL    3     /* seconds between screen polls */
#define CONFIRM_READS    2     /* identical reads before acting (OCR noise guard) */
#define DAYS_TOLERANCE   1     /* allowed |screen - db| days (rounding/timezone) */
#define RESP_BUF_SIZE    32768
#define MAX_DAYS         400   /* sanity bound on a parsed days-left value */
#define OCR_SCALE        4     /* upscale factor — banner text is tiny at 1:1 */

/* ── Globals ───────────────────────────────────────────────────────────────── */

static volatile sig_atomic_t g_exiting = 0;

typedef struct {
    char server_url[512];
    char auth_token[256];
    int  mon_w, mon_h, mon_x, mon_y;
    /* Derived region: the season banner in the top-left corner */
    int  reg_x, reg_y, reg_w, reg_h;
    /* Paths */
    char script_dir[PATH_MAX];
    char env_file[PATH_MAX];
    char log_file[PATH_MAX];
} Config;

static Config g_cfg;
static int    g_log_count = 0;

/* ── Logging (mirrors season-tracker) ──────────────────────────────────────── */

static void prune_log(void) {
    FILE *f = fopen(g_cfg.log_file, "r");
    if (!f) return;

    int count = 0, ch;
    while ((ch = fgetc(f)) != EOF)
        if (ch == '\n') count++;

    if (count <= MAX_LOG_LINES) { fclose(f); return; }

    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *buf = malloc(sz + 1);
    if (!buf) { fclose(f); return; }
    fread(buf, 1, sz, f);
    buf[sz] = '\0';
    fclose(f);

    int skip = count - MAX_LOG_LINES;
    char *p = buf;
    for (int i = 0; i < skip && p; i++) {
        p = strchr(p, '\n');
        if (p) p++;
    }

    if (p) {
        f = fopen(g_cfg.log_file, "w");
        if (f) { fputs(p, f); fclose(f); }
    }
    free(buf);
}

static void log_impl(int to_stdout, const char *fmt, va_list ap) {
    time_t now = time(NULL);
    struct tm tm;
    localtime_r(&now, &tm);
    char ts[64];
    strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%S%z", &tm);

    char msg[2048];
    vsnprintf(msg, sizeof(msg), fmt, ap);

    FILE *f = fopen(g_cfg.log_file, "a");
    if (f) { fprintf(f, "[%s] %s\n", ts, msg); fclose(f); }
    if (to_stdout) printf("[%s] %s\n", ts, msg);

    g_log_count++;
    if (g_log_count % LOG_PRUNE_EVERY == 0)
        prune_log();
}

__attribute__((format(printf, 1, 2)))
static void logmsg(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt); log_impl(1, fmt, ap); va_end(ap);
}

__attribute__((format(printf, 1, 2)))
static void logq(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt); log_impl(0, fmt, ap); va_end(ap);
}

/* ── Config ────────────────────────────────────────────────────────────────── */

static int load_env(Config *cfg) {
    ssize_t len = readlink("/proc/self/exe", cfg->script_dir, PATH_MAX - 1);
    if (len <= 0) {
        if (!getcwd(cfg->script_dir, PATH_MAX)) return -1;
    } else {
        cfg->script_dir[len] = '\0';
        char *slash = strrchr(cfg->script_dir, '/');
        if (slash) *slash = '\0';
    }

    snprintf(cfg->env_file, PATH_MAX, "%s/.env",         cfg->script_dir);
    snprintf(cfg->log_file, PATH_MAX, "%s/watcher.log",  cfg->script_dir);

    FILE *f = fopen(cfg->env_file, "r");
    if (!f) return -1;

    char line[1024];
    char geometry[128] = {0};

    while (fgets(line, sizeof(line), f)) {
        char *nl = strchr(line, '\n');
        if (nl) *nl = '\0';
        if (line[0] == '#' || line[0] == '\0') continue;

        char *eq = strchr(line, '=');
        if (!eq) continue;
        *eq = '\0';
        char *key = line, *val = eq + 1;

        if (strcmp(key, "SERVER_URL") == 0)
            snprintf(cfg->server_url, sizeof(cfg->server_url), "%s", val);
        else if (strcmp(key, "AUTH_TOKEN") == 0)
            snprintf(cfg->auth_token, sizeof(cfg->auth_token), "%s", val);
        else if (strcmp(key, "SHOT_GEOMETRY") == 0)
            snprintf(geometry, sizeof(geometry), "%s", val);
    }
    fclose(f);

    /* /seasons is public, so AUTH_TOKEN is optional here. */
    if (!cfg->server_url[0] || !geometry[0])
        return -1;

    if (sscanf(geometry, "%dx%d%d%d", &cfg->mon_w, &cfg->mon_h,
               &cfg->mon_x, &cfg->mon_y) != 4) {
        if (sscanf(geometry, "%dx%d", &cfg->mon_w, &cfg->mon_h) != 2)
            return -1;
        cfg->mon_x = cfg->mon_y = 0;
    }

    /* Season banner region: top-left quarter width, top tenth height — the same
     * corner season-tracker uses for its gate, where "SEASON N ENDS IN D DAYS"
     * is drawn. */
    cfg->reg_w = cfg->mon_w / 4;
    cfg->reg_h = cfg->mon_h / 10;
    cfg->reg_x = cfg->mon_x;
    cfg->reg_y = cfg->mon_y;

    return 0;
}

/* ── X11 / XShm (mirrors season-tracker) ───────────────────────────────────── */

typedef struct {
    Display        *dpy;
    XImage         *ximg;
    XShmSegmentInfo shminfo;
    int             width, height;
} XCapture;

static int xcap_init(XCapture *xc, int w, int h) {
    xc->dpy = XOpenDisplay(NULL);
    if (!xc->dpy) { fprintf(stderr, "Cannot open X display\n"); return -1; }

    int screen = DefaultScreen(xc->dpy);

    if (!XShmQueryExtension(xc->dpy)) {
        fprintf(stderr, "XShm extension not available\n");
        XCloseDisplay(xc->dpy);
        return -1;
    }

    xc->width  = w;
    xc->height = h;

    xc->ximg = XShmCreateImage(xc->dpy,
        DefaultVisual(xc->dpy, screen),
        DefaultDepth(xc->dpy, screen),
        ZPixmap, NULL, &xc->shminfo, w, h);

    if (!xc->ximg) {
        fprintf(stderr, "XShmCreateImage failed\n");
        XCloseDisplay(xc->dpy);
        return -1;
    }

    xc->shminfo.shmid = shmget(IPC_PRIVATE,
        xc->ximg->bytes_per_line * xc->ximg->height,
        IPC_CREAT | 0600);
    if (xc->shminfo.shmid < 0) {
        fprintf(stderr, "shmget failed: %s\n", strerror(errno));
        XDestroyImage(xc->ximg);
        XCloseDisplay(xc->dpy);
        return -1;
    }

    xc->shminfo.shmaddr = xc->ximg->data = shmat(xc->shminfo.shmid, 0, 0);
    xc->shminfo.readOnly = False;
    XShmAttach(xc->dpy, &xc->shminfo);
    XSync(xc->dpy, False);

    shmctl(xc->shminfo.shmid, IPC_RMID, 0);
    return 0;
}

static int xcap_grab(XCapture *xc, int src_x, int src_y) {
    Window root = DefaultRootWindow(xc->dpy);
    return XShmGetImage(xc->dpy, root, xc->ximg, src_x, src_y, AllPlanes)
        ? 0 : -1;
}

static void xcap_cleanup(XCapture *xc) {
    if (!xc->dpy) return;
    XShmDetach(xc->dpy, &xc->shminfo);
    xc->ximg->data = NULL;
    XDestroyImage(xc->ximg);
    shmdt(xc->shminfo.shmaddr);
    XCloseDisplay(xc->dpy);
    xc->dpy = NULL;
}

/* Grayscale + nearest-neighbour upscale the grabbed image (it already covers
 * exactly the region, grabbed at reg_x,reg_y) by `scale`. The banner text is
 * only ~12px tall at native resolution — too small for Tesseract — so we feed
 * it an enlarged 8-bit grayscale image (no thresholding; the soft gray-on-red
 * banner reads far better as continuous tone than as a hard 1-bit mask).
 * Output: (w*scale)*(h*scale) bytes. */
static void gray_upscale(XImage *ximg, int w, int h, int scale,
                         unsigned char *out) {
    int bpp = ximg->bits_per_pixel / 8;
    int ow = w * scale;
    int oh = h * scale;
    for (int oy = 0; oy < oh; oy++) {
        int sy = oy / scale;
        unsigned char *srow = (unsigned char *)ximg->data
            + sy * ximg->bytes_per_line;
        unsigned char *drow = out + (size_t)oy * ow;
        for (int ox = 0; ox < ow; ox++) {
            int sx = ox / scale;
            int b = srow[sx * bpp + 0];
            int g = srow[sx * bpp + 1];
            int r = srow[sx * bpp + 2];
            drow[ox] = (unsigned char)((r * 77 + g * 150 + b * 29) >> 8);
        }
    }
}

/* ── Screen parsing ────────────────────────────────────────────────────────── */

/* Parse "SEASON N ENDS IN D DAYS" from OCR text.
 * The banner spans two lines ("SEASON 10" / "ENDS IN 19 DAYS"), so we OCR in
 * sparse-text mode and scan the combined output. Returns days-left (>=0) and,
 * via *season_out, the season number (or -1 if not found). Returns -1 if the
 * banner isn't recognizably on screen. */
static int parse_days_left(const char *text, int *season_out) {
    *season_out = -1;

    /* Uppercase copy for case-insensitive scanning. */
    char up[RESP_BUF_SIZE];
    size_t i = 0;
    for (const char *p = text; *p && i + 1 < sizeof(up); p++)
        up[i++] = (char)toupper((unsigned char)*p);
    up[i] = '\0';

    /* Gate: only act on the season banner. Require a banner cue ("SEASON" or
     * "ENDS" — either reads reliably, so a misread of one still passes on the
     * other) plus a "DAY" token, so stray lobby text can't masquerade as a
     * countdown. */
    int has_cue = strstr(up, "SEASON") || strstr(up, "ENDS") || strstr(up, "END ");
    char *day = strstr(up, "DAY");
    if (!has_cue || !day)
        return -1;

    /* Days-left: the integer immediately preceding "DAY[S]". Scan left over
     * spaces, then collect a run of digits. */
    char *q = day;
    while (q > up && isspace((unsigned char)q[-1])) q--;
    char *digit_end = q;
    while (q > up && isdigit((unsigned char)q[-1])) q--;
    if (q == digit_end)
        return -1;  /* no number before DAY */

    char numbuf[16];
    size_t nl = (size_t)(digit_end - q);
    if (nl >= sizeof(numbuf)) nl = sizeof(numbuf) - 1;
    memcpy(numbuf, q, nl);
    numbuf[nl] = '\0';
    int days = atoi(numbuf);
    if (days < 0 || days > MAX_DAYS)
        return -1;

    /* Season number: first integer after "SEASON" (best-effort, not required). */
    char *s = strstr(up, "SEASON");
    if (s) {
        s += 6;
        while (*s && !isdigit((unsigned char)*s)) {
            /* stop scanning if we run into the countdown line */
            if (strncmp(s, "ENDS", 4) == 0) break;
            s++;
        }
        if (isdigit((unsigned char)*s))
            *season_out = atoi(s);
    }

    return days;
}

/* ── Season API (/seasons) ─────────────────────────────────────────────────── */

typedef struct { char *buf; size_t len; size_t cap; } MemBuf;

static size_t curl_collect(void *ptr, size_t size, size_t nmemb, void *ud) {
    MemBuf *m = ud;
    size_t total = size * nmemb;
    size_t copy = total;
    if (m->len + copy >= m->cap) copy = m->cap - 1 - m->len;
    if (copy > 0) {
        memcpy(m->buf + m->len, ptr, copy);
        m->len += copy;
        m->buf[m->len] = '\0';
    }
    /* Claim full consumption so libcurl doesn't abort on our truncation. */
    return total;
}

/* Extract a JSON string field's value following `start`. Returns 0 and fills
 * out on a string value, 1 if the value is null, -1 if the key is absent. */
static int json_str_field(const char *start, const char *key,
                          char *out, size_t outsz) {
    char pat[64];
    snprintf(pat, sizeof(pat), "\"%s\"", key);
    const char *p = strstr(start, pat);
    if (!p) return -1;
    p += strlen(pat);
    while (*p && *p != ':') p++;
    if (*p != ':') return -1;
    p++;
    while (*p == ' ' || *p == '\t') p++;
    if (strncmp(p, "null", 4) == 0) { out[0] = '\0'; return 1; }
    if (*p != '"') return -1;
    p++;
    size_t i = 0;
    while (*p && *p != '"' && i + 1 < outsz) out[i++] = *p++;
    out[i] = '\0';
    return 0;
}

/* Fetch /seasons and return the current season's end date (ISO) and name.
 * end_out is empty if the season is ongoing (null end). Returns 0 on success. */
static int fetch_current_season(const Config *cfg,
                                char *end_out, size_t end_sz,
                                char *name_out, size_t name_sz) {
    char url[700];
    /* Prepend https:// when the configured URL omits a scheme. */
    if (strstr(cfg->server_url, "://"))
        snprintf(url, sizeof(url), "%s/seasons", cfg->server_url);
    else
        snprintf(url, sizeof(url), "https://%s/seasons", cfg->server_url);

    char *body = malloc(RESP_BUF_SIZE);
    if (!body) return -1;
    body[0] = '\0';
    MemBuf mem = { body, 0, RESP_BUF_SIZE };

    CURL *curl = curl_easy_init();
    if (!curl) { free(body); return -1; }

    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_collect);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &mem);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);
    curl_easy_setopt(curl, CURLOPT_USERAGENT, "season-watcher/1.0");

    CURLcode res = curl_easy_perform(curl);
    long http_code = 0;
    if (res == CURLE_OK)
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) {
        logmsg("ERROR: /seasons fetch failed: %s", curl_easy_strerror(res));
        free(body);
        return -1;
    }
    if (http_code != 200) {
        logmsg("ERROR: /seasons returned HTTP %ld", http_code);
        free(body);
        return -1;
    }

    const char *cs = strstr(mem.buf, "\"currentSeason\"");
    if (!cs) {
        logmsg("ERROR: /seasons has no currentSeason");
        free(body);
        return -1;
    }

    if (json_str_field(cs, "name", name_out, name_sz) < 0)
        name_out[0] = '\0';

    int er = json_str_field(cs, "end", end_out, end_sz);
    free(body);
    if (er < 0) {
        logmsg("ERROR: currentSeason has no end field");
        return -1;
    }
    return 0;  /* er == 1 (null end) leaves end_out empty: ongoing season */
}

/* Parse an ISO-8601 timestamp (date or date-time, UTC) to epoch seconds. */
static int iso_to_epoch(const char *iso, time_t *out) {
    struct tm tm = {0};
    if (strptime(iso, "%Y-%m-%dT%H:%M:%S", &tm) ||
        strptime(iso, "%Y-%m-%d", &tm)) {
        *out = timegm(&tm);
        return 0;
    }
    return -1;
}

/* Extract the leading season number from a name like "Season 10". -1 if none. */
static int season_num_from_name(const char *name) {
    for (const char *p = name; *p; p++)
        if (isdigit((unsigned char)*p))
            return atoi(p);
    return -1;
}

/* Format an epoch as a UTC YYYY-MM-DD date, matching the DB's date convention
 * (season end dates are stored at UTC midnight). */
static void fmt_day_utc(time_t t, char *out, size_t sz) {
    struct tm tm;
    gmtime_r(&t, &tm);
    strftime(out, sz, "%Y-%m-%d", &tm);
}

/* ── Notification ──────────────────────────────────────────────────────────── */

/* Raise a persistent desktop notification (critical urgency, no expiry). */
static void notify(const char *title, const char *body) {
    pid_t p = fork();
    if (p == 0) {
        execlp("notify-send", "notify-send",
               "-u", "critical", "-t", "0",
               "-a", "Season Sprint", "-i", "dialog-warning",
               title, body, (char *)NULL);
        _exit(127);
    }
    if (p > 0) {
        int status;
        waitpid(p, &status, 0);
        if (WIFEXITED(status) && WEXITSTATUS(status) == 127)
            logmsg("WARNING: notify-send not found — install libnotify "
                   "for desktop alerts");
    }
}

/* ── Compare + alert ───────────────────────────────────────────────────────── */

/* Compare on-screen days-left against the DB season end. Fire a persistent
 * notification on mismatch; log on match. Returns 0 on success (compared). */
static int compare_and_alert(const Config *cfg, int screen_days, int screen_season) {
    char end_iso[64] = {0};
    char db_name[128] = {0};
    if (fetch_current_season(cfg, end_iso, sizeof(end_iso),
                             db_name, sizeof(db_name)) != 0)
        return -1;

    int db_season = season_num_from_name(db_name);
    time_t now = time(NULL);

    /* The end date the in-game countdown implies: today + days-left. */
    char want_day[16] = {0};
    fmt_day_utc(now + (time_t)screen_days * 86400, want_day, sizeof(want_day));

    /* Ongoing season (no end date) — can't verify the countdown. */
    if (!end_iso[0]) {
        logmsg("Screen: Season %d ends in %d days (~%s). DB '%s' has no end date "
               "(ongoing) — cannot verify.",
               screen_season, screen_days, want_day, db_name);
        char body[512];
        snprintf(body, sizeof(body),
                 "Database: no end date for %s.\n"
                 "In-game: ends in %d day%s (around %s).\n"
                 "The season data may be stale.",
                 db_name[0] ? db_name : "the current season",
                 screen_days, screen_days == 1 ? "" : "s", want_day);
        notify("Season end date missing", body);
        return 0;
    }

    time_t end_epoch;
    if (iso_to_epoch(end_iso, &end_epoch) != 0) {
        logmsg("ERROR: could not parse DB end date '%s'", end_iso);
        return -1;
    }

    double secs = difftime(end_epoch, now);
    int db_floor = (int)floor(secs / 86400.0);
    int db_ceil  = (int)ceil(secs / 86400.0);

    /* A YYYY-MM-DD slice of the DB end date for human-readable messages. */
    char db_day[16] = {0};
    snprintf(db_day, sizeof(db_day), "%.10s", end_iso);

    int days_match  = (abs(screen_days - db_floor) <= DAYS_TOLERANCE) ||
                      (abs(screen_days - db_ceil)  <= DAYS_TOLERANCE);
    int season_match = (screen_season < 0 || db_season < 0 ||
                        screen_season == db_season);

    if (days_match && season_match) {
        logmsg("MATCH: screen Season %d ends in %d days (~%s); DB '%s' ends %s. "
               "All good.",
               screen_season, screen_days, want_day, db_name, db_day);
        return 0;
    }

    /* Mismatch — build a specific message and alert. */
    logmsg("MISMATCH: screen Season %d ends in %d days (~%s); DB '%s' ends %s "
           "(~%d-%d days). Notifying.",
           screen_season, screen_days, want_day, db_name, db_day,
           db_floor, db_ceil);

    char body[640];
    if (!season_match) {
        snprintf(body, sizeof(body),
                 "The game is on Season %d, but the database's current season "
                 "is %s.\nDatabase end date: %s\nThe season data is out of date.",
                 screen_season, db_name[0] ? db_name : "unknown", db_day);
    } else {
        snprintf(body, sizeof(body),
                 "%s end date doesn't match.\n"
                 "Database says: %s\n"
                 "Should be: %s (in-game shows %d day%s left)\n"
                 "The season data may be stale.",
                 db_name[0] ? db_name : "Season",
                 db_day, want_day,
                 screen_days, screen_days == 1 ? "" : "s");
    }
    notify("Season dates don't match", body);
    return 0;
}

/* ── Signal handler ────────────────────────────────────────────────────────── */

static void sig_handler(int sig) {
    (void)sig;
    g_exiting = 1;
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

int main(void) {
    if (load_env(&g_cfg) != 0) {
        fprintf(stderr, "ERROR: Failed to load .env "
                        "(run season-tracker.sh for setup)\n");
        return 1;
    }

    signal(SIGINT,  sig_handler);
    signal(SIGTERM, sig_handler);

    /* Tie our lifetime to whoever launched us: if that process exits (game
     * session over), getppid() changes and we stop polling. */
    pid_t orig_ppid = getppid();

    XCapture xc = {0};
    if (xcap_init(&xc, g_cfg.reg_w, g_cfg.reg_h) != 0) {
        logmsg("ERROR: X11 SHM init failed");
        return 1;
    }

    TessBaseAPI *tess = TessBaseAPICreate();
    TessBaseAPISetVariable(tess, "debug_file", "/dev/null");
    if (TessBaseAPIInit3(tess, NULL, "eng") != 0) {
        logmsg("ERROR: Tesseract init failed");
        xcap_cleanup(&xc);
        return 1;
    }

    curl_global_init(CURL_GLOBAL_DEFAULT);

    int ocr_w = g_cfg.reg_w * OCR_SCALE;
    int ocr_h = g_cfg.reg_h * OCR_SCALE;
    unsigned char *gray = malloc((size_t)ocr_w * ocr_h);
    if (!gray) {
        logmsg("ERROR: malloc");
        TessBaseAPIEnd(tess); TessBaseAPIDelete(tess);
        xcap_cleanup(&xc);
        curl_global_cleanup();
        return 1;
    }

    logmsg("Watcher started: region=%dx%d+%d+%d server=%s",
           g_cfg.reg_w, g_cfg.reg_h, g_cfg.reg_x, g_cfg.reg_y, g_cfg.server_url);

    int last_days   = -1;
    int last_season = -1;
    int confirms    = 0;

    while (!g_exiting) {
        /* Parent gone → session ended without ever showing the banner. */
        if (getppid() != orig_ppid) {
            logmsg("Launcher exited before season banner seen. Stopping.");
            break;
        }

        if (xcap_grab(&xc, g_cfg.reg_x, g_cfg.reg_y) != 0) {
            logq("Capture failed");
            if (!g_exiting) sleep(POLL_INTERVAL);
            continue;
        }

        gray_upscale(xc.ximg, g_cfg.reg_w, g_cfg.reg_h, OCR_SCALE, gray);

        /* PSM_AUTO copes with the logo + multi-line banner in this corner. */
        TessBaseAPISetPageSegMode(tess, PSM_AUTO);
        TessBaseAPISetImage(tess, gray, ocr_w, ocr_h, 1, ocr_w);
        char *text = TessBaseAPIGetUTF8Text(tess);

        int season = -1;
        int days = text ? parse_days_left(text, &season) : -1;
        if (text) TessDeleteText(text);

        if (days < 0) {
            confirms = 0;
            last_days = -1;
            logq("Season banner not on screen");
            if (!g_exiting) sleep(POLL_INTERVAL);
            continue;
        }

        /* Require consecutive identical reads before trusting the OCR. */
        if (days == last_days && season == last_season) {
            confirms++;
        } else {
            last_days = days;
            last_season = season;
            confirms = 1;
        }
        logq("Read: Season %d ends in %d days (confirm %d/%d)",
             season, days, confirms, CONFIRM_READS);

        if (confirms >= CONFIRM_READS) {
            logmsg("Confirmed: Season %d ends in %d days. Checking DB...",
                   season, days);
            compare_and_alert(&g_cfg, days, season);
            logmsg("Check complete. Watcher dormant for the rest of the session.");
            break;  /* job done — go dormant by exiting */
        }

        if (!g_exiting) sleep(POLL_INTERVAL);
    }

    free(gray);
    TessBaseAPIEnd(tess);
    TessBaseAPIDelete(tess);
    xcap_cleanup(&xc);
    curl_global_cleanup();
    return 0;
}
