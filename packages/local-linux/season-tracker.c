/*
 * season-tracker — World Tour / Ranked score tracker for THE FINALS (Linux).
 *
 * Grabs the game monitor via X11 shared memory (XShmGetImage, sub-ms) and
 * reads the World Tour / Ranked score by template matching — no OCR engine —
 * from two screens: the lobby's MODES tab (bottom-centre panel) and the
 * post-match "WORLD TOUR SCORE" panel shown after every match. Changes are
 * POSTed to the Season Sprint server.
 *
 * The reader is a C port of packages/local-win/screen_reader.py; keep the
 * two in step (same masks, thresholds and geometry). Templates are the PGM
 * files in packages/tracker-templates (shipped as ./templates).
 *
 * Build:
 *   make season-tracker
 *
 * Usage:
 *   ./season-tracker                   # run tracker (reads .env)
 *   ./season-tracker game_cmd args...  # launch game, then track
 *   ./season-tracker --read shot.ppm   # read one screenshot (P6 PPM), print result
 */

#define _GNU_SOURCE
#include <dirent.h>
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

#include <curl/curl.h>

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define MAX_LOG_LINES    500
#define LOG_PRUNE_EVERY  50

#define POLL_SECS        1    /* seconds between frames */
#define FAST_POLL_USEC   200000 /* while the post-match panel is up (~2s) */
#define COOLDOWN_SECS    300  /* MODES: per-mode rest after a confirmed read */
#define CONFIRM_READS    2    /* MODES: identical reads in a row before pushing */
#define POST_CONFIRM_READS 3  /* post-match: more, so a count-up never confirms */
#define POST_REST_SECS   10   /* post-match: ignore the panel once confirmed */

/* Reader constants — must match screen_reader.py */
#define REF_H            1440
#define GATE_MIN         0.60
#define GATE_MIN_YELLOW  0.5   /* pre-check: share of the tab's yellow needed */
#define HEADER_MIN       0.60
#define DIGIT_MIN        0.70
#define DIGIT_MARGIN     0.04
#define DIGIT_H          24
#define DIGIT_W          20
#define MAX_COMPS        512
#define MAX_DIGITS       9
#define MIN_SCALE        0.6  /* below ~900p digits are too small to trust */
#define RUN_GAP          0.7  /* glyph gap (x height) that ends a run; see read_glyphs */
#define SLASH_GAP_MAX    0.8  /* MODES: max gap value -> "/" (x height); see grouping_ok */
#define MAX_DIGIT_TMPL   32   /* 0-9 plus variants (digit_<d>_<name>.pgm) */
#define POST_MIN_WHITE   0.5  /* post-match pre-check: share of header white */

/* Ranked badge tier number (mirrors TIER_* in screen_reader.py): a small
 * badge-coloured digit at the bottom of the badges either side of the
 * "RANK SCORE" header, TIER_DX left/right of its centre and TIER_DY below its
 * top (1440p px), found by brightness within TIER_ZONE of that point. */
#define TIER_DX          267
#define TIER_DY          130
#define TIER_ZONE        30
#define TIER_LUMA_MIN    90
#define TIER_INK_LO      50
#define TIER_INK_SPAN    100
#define TIER_MIN         0.75
#define TIER_MARGIN      0.10

/* Ranked (Season 12+): leagues of RANKED_LEAGUE RS in four tiers of
 * RANKED_TIER, Tier 4 lowest; MODES shows RS within the tier ("X / 2,499").
 * See ranked_total for the step limits. */
#define RANKED_TIER      2500
#define RANKED_LEAGUE    (4 * RANKED_TIER)
#define RANKED_LEAGUES   5
#define RANKED_MAX_STEP  2000
#define RANKED_MAX_STEP_NO_TIER 1000
#define ANCHOR_REFRESH_SECS 60  /* re-fetch the saved ranked score at most this often */

/* ── Globals ───────────────────────────────────────────────────────────────── */

static volatile sig_atomic_t g_exiting = 0;

typedef struct {
    char server_url[512];
    char auth_token[256];
    int  mon_w, mon_h, mon_x, mon_y;
    char script_dir[PATH_MAX];
    char env_file[PATH_MAX];
    char state_file_wt[PATH_MAX];
    char state_file_rank[PATH_MAX];
    char log_file[PATH_MAX];
} Config;

static Config g_cfg;
static int    g_log_count = 0;

static double now_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec * 1000.0 + tv.tv_usec / 1000.0;
}

/* ── Logging ───────────────────────────────────────────────────────────────── */

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
    size_t got = fread(buf, 1, sz, f);
    buf[got] = '\0';
    fclose(f);

    /* Keep the last MAX_LOG_LINES lines */
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

    if (g_cfg.log_file[0]) {
        FILE *f = fopen(g_cfg.log_file, "a");
        if (f) { fprintf(f, "[%s] %s\n", ts, msg); fclose(f); }
    }
    if (to_stdout) printf("[%s] %s\n", ts, msg);

    g_log_count++;
    if (g_cfg.log_file[0] && g_log_count % LOG_PRUNE_EVERY == 0)
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

static int init_paths(Config *cfg) {
    /* script_dir = directory of this binary (/proc/self/exe), else cwd */
    ssize_t len = readlink("/proc/self/exe", cfg->script_dir, PATH_MAX - 1);
    if (len <= 0) {
        if (!getcwd(cfg->script_dir, PATH_MAX)) return -1;
    } else {
        cfg->script_dir[len] = '\0';
        char *slash = strrchr(cfg->script_dir, '/');
        if (slash) *slash = '\0';
    }

    snprintf(cfg->env_file,        PATH_MAX, "%s/.env",        cfg->script_dir);
    snprintf(cfg->state_file_wt,   PATH_MAX, "%s/.last-wtp",   cfg->script_dir);
    snprintf(cfg->state_file_rank, PATH_MAX, "%s/.last-rank",  cfg->script_dir);
    snprintf(cfg->log_file,        PATH_MAX, "%s/tracker.log", cfg->script_dir);
    return 0;
}

static int load_env(Config *cfg) {
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

    if (!cfg->server_url[0] || !cfg->auth_token[0] || !geometry[0])
        return -1;

    /* Parse WxH+X+Y (offsets can be negative, e.g. 2560x1440+-1920+0) */
    if (sscanf(geometry, "%dx%d%d%d", &cfg->mon_w, &cfg->mon_h,
               &cfg->mon_x, &cfg->mon_y) != 4) {
        if (sscanf(geometry, "%dx%d", &cfg->mon_w, &cfg->mon_h) != 2)
            return -1;
        cfg->mon_x = cfg->mon_y = 0;
    }
    return 0;
}

/* ── X11 / XShm ────────────────────────────────────────────────────────────── */

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

    /* Mark for deletion so it's cleaned up even on crash */
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
    /* Prevent XDestroyImage from free()ing the shm pointer — shmdt does. */
    xc->ximg->data = NULL;
    XDestroyImage(xc->ximg);
    shmdt(xc->shminfo.shmaddr);
    XCloseDisplay(xc->dpy);
    xc->dpy = NULL;
}

/* ── Images ────────────────────────────────────────────────────────────────── */

/* A view of a full-monitor frame: XImage (BGRA) or a loaded PPM (RGB). */
typedef struct {
    const unsigned char *data;
    int w, h, stride, bpp;
    int ro, go, bo;  /* byte offsets of R, G, B within a pixel */
} Frame;

typedef struct { int w, h; unsigned char *px; } BitMask;  /* 0/1 */
typedef struct { int w, h; float *px; } FImg;          /* 0..1 */

static inline const unsigned char *frame_px(const Frame *f, int x, int y) {
    return f->data + (size_t)y * f->stride + (size_t)x * f->bpp;
}

/* INK_WHITE_POST: the post-match value is small, thin upright text on a
 * saturated background, so it's masked at a lower brightness (150 vs 200) —
 * at 200 its strokes break apart at 1080p. Mirrors POST_WHITE_MIN etc. */
enum { INK_YELLOW, INK_WHITE, INK_WHITE_POST, INK_LUMA };

/* Rec. 601 brightness (mirrors luma in screen_reader.py). */
static inline double px_luma(int r, int g, int b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

/* Binary colour mask of a frame rect (mirrors yellow_mask / white_mask). */
static void make_mask(const Frame *f, int x0, int y0, int w, int h,
                      int which, BitMask *out) {
    out->w = w; out->h = h;
    out->px = malloc((size_t)w * h);
    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            const unsigned char *p = frame_px(f, x0 + x, y0 + y);
            int r = p[f->ro], g = p[f->go], b = p[f->bo];
            int on;
            if (which == INK_YELLOW) {
                on = r > 190 && g > 130 && b < 110 && r - b > 110;
            } else if (which == INK_LUMA) {
                on = px_luma(r, g, b) > TIER_LUMA_MIN;
            } else {
                int mn = r < g ? r : g;
                if (b < mn) mn = b;
                on = mn > (which == INK_WHITE_POST ? 150 : 200);
            }
            out->px[y * w + x] = (unsigned char)on;
        }
    }
}

static inline float clamp01(float v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* Soft ink of a frame rect (mirrors yellow_ink / white_ink). */
static void make_ink(const Frame *f, int x0, int y0, int w, int h,
                     int which, FImg *out) {
    out->w = w; out->h = h;
    out->px = malloc(sizeof(float) * (size_t)w * h);
    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            const unsigned char *p = frame_px(f, x0 + x, y0 + y);
            int r = p[f->ro], g = p[f->go], b = p[f->bo];
            float v;
            if (which == INK_YELLOW) {
                v = (float)(r - b - 60) / 120.0f;
            } else if (which == INK_LUMA) {
                v = (float)((px_luma(r, g, b) - TIER_INK_LO) / TIER_INK_SPAN);
            } else {
                int mn = r < g ? r : g;
                if (b < mn) mn = b;
                v = which == INK_WHITE_POST ? (float)(mn - 100) / 110.0f
                                            : (float)(mn - 130) / 90.0f;
            }
            out->px[y * w + x] = clamp01(v);
        }
    }
}

/* Read a binary PGM (P5) or PPM (P6) with maxval 255. Returns malloc'd
 * pixels or NULL. */
static unsigned char *read_pnm(const char *path, const char *magic,
                               int channels, int *w, int *h) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    char m[3] = {0};
    int maxval = 0;
    if (fscanf(f, "%2s", m) != 1 || strcmp(m, magic) != 0) { fclose(f); return NULL; }
    int vals[3], n = 0;
    while (n < 3) {
        int c = fgetc(f);
        if (c == EOF) { fclose(f); return NULL; }
        if (c == '#') { while (c != '\n' && c != EOF) c = fgetc(f); continue; }
        if (c >= '0' && c <= '9') {
            ungetc(c, f);
            if (fscanf(f, "%d", &vals[n]) != 1) { fclose(f); return NULL; }
            n++;
        }
    }
    *w = vals[0]; *h = vals[1]; maxval = vals[2];
    fgetc(f);  /* single whitespace after maxval */
    if (maxval != 255 || *w <= 0 || *h <= 0) { fclose(f); return NULL; }
    size_t sz = (size_t)*w * *h * channels;
    unsigned char *buf = malloc(sz);
    if (!buf || fread(buf, 1, sz, f) != sz) { free(buf); fclose(f); return NULL; }
    fclose(f);
    return buf;
}

/* ── Templates ─────────────────────────────────────────────────────────────── */

#define N_HEADERS 3
#define N_POST_HEADERS 2
#define N_POST_GLYPHS 11  /* 0-9 and "/" */

typedef struct {
    const char *name;   /* header_<name>.pgm / post_header_<name>.pgm */
    const char *mode;   /* server mode, NULL = nothing to push */
    int         loaded;
    BitMask     m;
} HeaderTmpl;

typedef struct {
    BitMask modes;
    HeaderTmpl headers[N_HEADERS];
    /* digits[i] is a template for character digit_chars[i]: 0-9 first, then
     * variants such as digit_8_yellow.pgm. A glyph scores the best variant
     * of each digit. */
    float digits[MAX_DIGIT_TMPL][DIGIT_H * DIGIT_W];
    char  digit_chars[MAX_DIGIT_TMPL];
    int   n_digits;
    /* Post-match panel; post_ok = 0 if its templates aren't installed. */
    int        post_ok;
    HeaderTmpl post_headers[N_POST_HEADERS];
    float      post_glyphs[N_POST_GLYPHS][DIGIT_H * DIGIT_W];
    /* Ranked badge tier numbers (badge_tier_<n>.pgm); fewer than two switch
     * tier reading off. */
    float tiers[4][DIGIT_H * DIGIT_W];
    char  tier_chars[4];
    int   n_tiers;
} Templates;

static const char POST_CHARS[N_POST_GLYPHS + 1] = "0123456789/";

static int load_mask(const char *path, BitMask *m) {
    int w, h;
    unsigned char *px = read_pnm(path, "P5", 1, &w, &h);
    if (!px) return -1;
    for (int i = 0; i < w * h; i++) px[i] = px[i] > 127;
    m->w = w; m->h = h; m->px = px;
    return 0;
}

static int dir_has_templates(const char *dir) {
    char p[PATH_MAX];
    snprintf(p, sizeof(p), "%s/modes_tab.pgm", dir);
    return access(p, R_OK) == 0;
}

/* Installed builds ship ./templates; a repo checkout keeps them in
 * packages/tracker-templates. */
static int find_templates_dir(const char *script_dir, char *out) {
    snprintf(out, PATH_MAX, "%s/templates", script_dir);
    if (dir_has_templates(out)) return 0;
    snprintf(out, PATH_MAX, "%s/../tracker-templates", script_dir);
    if (dir_has_templates(out)) return 0;
    return -1;
}

static void templates_free(Templates *t) {
    free(t->modes.px);
    for (int i = 0; i < N_HEADERS; i++)
        if (t->headers[i].loaded) free(t->headers[i].m.px);
    for (int i = 0; i < N_POST_HEADERS; i++)
        if (t->post_headers[i].loaded) free(t->post_headers[i].m.px);
}

/* Load one DIGIT_H x DIGIT_W glyph template into out. */
static int load_glyph(const char *path, float *out) {
    int w, h;
    unsigned char *px = read_pnm(path, "P5", 1, &w, &h);
    if (!px || w != DIGIT_W || h != DIGIT_H) { free(px); return -1; }
    for (int i = 0; i < DIGIT_W * DIGIT_H; i++) out[i] = px[i] / 255.0f;
    free(px);
    return 0;
}

/* Optional post-match templates; disables that screen if any are missing. */
static void load_post_templates(Templates *t, const char *dir) {
    static const char *names[N_POST_HEADERS] = { "world_tour", "ranked" };
    static const char *modes[N_POST_HEADERS] = { "world-tour", "ranked" };
    char p[PATH_MAX];
    int any = 0;
    for (int i = 0; i < N_POST_HEADERS; i++) {
        t->post_headers[i].name = names[i];
        t->post_headers[i].mode = modes[i];
        snprintf(p, sizeof(p), "%s/post_header_%s.pgm", dir, names[i]);
        t->post_headers[i].loaded = load_mask(p, &t->post_headers[i].m) == 0;
        any |= t->post_headers[i].loaded;
    }
    int glyphs_ok = 1;
    for (int g = 0; g < N_POST_GLYPHS; g++) {
        if (g < 10) snprintf(p, sizeof(p), "%s/post_digit_%d.pgm", dir, g);
        else        snprintf(p, sizeof(p), "%s/post_digit_slash.pgm", dir);
        if (load_glyph(p, t->post_glyphs[g]) != 0) glyphs_ok = 0;
    }
    t->post_ok = any && glyphs_ok;
}

static int templates_load(Templates *t, const char *dir) {
    static const char *names[N_HEADERS] = { "world_tour", "ranked", "placement" };
    static const char *modes[N_HEADERS] = { "world-tour", "ranked", NULL };
    char p[PATH_MAX];

    memset(t, 0, sizeof(*t));
    snprintf(p, sizeof(p), "%s/modes_tab.pgm", dir);
    if (load_mask(p, &t->modes) != 0) {
        logmsg("ERROR: cannot load %s", p);
        return -1;
    }
    for (int i = 0; i < N_HEADERS; i++) {
        t->headers[i].name = names[i];
        t->headers[i].mode = modes[i];
        snprintf(p, sizeof(p), "%s/header_%s.pgm", dir, names[i]);
        t->headers[i].loaded = load_mask(p, &t->headers[i].m) == 0;
    }
    for (int d = 0; d < 10; d++) {
        snprintf(p, sizeof(p), "%s/digit_%d.pgm", dir, d);
        if (load_glyph(p, t->digits[d]) != 0) {
            logmsg("ERROR: cannot load %s", p);
            return -1;
        }
        t->digit_chars[d] = (char)('0' + d);
    }
    t->n_digits = 10;
    /* Variants: digit_<d>_<name>.pgm */
    DIR *dh = opendir(dir);
    if (dh) {
        struct dirent *e;
        while ((e = readdir(dh)) && t->n_digits < MAX_DIGIT_TMPL) {
            const char *nm = e->d_name;
            size_t len = strlen(nm);
            if (strncmp(nm, "digit_", 6) != 0 || len < 13 || nm[6] < '0' || nm[6] > '9' ||
                nm[7] != '_' || strcmp(nm + len - 4, ".pgm") != 0)
                continue;
            snprintf(p, sizeof(p), "%s/%s", dir, nm);
            if (load_glyph(p, t->digits[t->n_digits]) == 0)
                t->digit_chars[t->n_digits++] = nm[6];
        }
        closedir(dh);
    }
    load_post_templates(t, dir);
    for (int n = 1; n <= 4; n++) {
        snprintf(p, sizeof(p), "%s/badge_tier_%d.pgm", dir, n);
        if (load_glyph(p, t->tiers[t->n_tiers]) == 0)
            t->tier_chars[t->n_tiers++] = (char)('0' + n);
    }
    return 0;
}

/* ── Template matching ─────────────────────────────────────────────────────── */

/* Nearest-neighbour resize of a 0/1 mask by factor s (mirrors scale_mask). */
static void scale_mask(const BitMask *src, double s, BitMask *dst) {
    int nh = (int)(src->h * s + 0.5), nw = (int)(src->w * s + 0.5);
    if (nh < 1) nh = 1;
    if (nw < 1) nw = 1;
    dst->w = nw; dst->h = nh;
    dst->px = malloc((size_t)nw * nh);
    for (int y = 0; y < nh; y++) {
        int sy = (int)((y + 0.5) / s);
        if (sy > src->h - 1) sy = src->h - 1;
        for (int x = 0; x < nw; x++) {
            int sx = (int)((x + 0.5) / s);
            if (sx > src->w - 1) sx = src->w - 1;
            dst->px[y * nw + x] = src->px[sy * src->w + sx];
        }
    }
}

/* d x d block mean of a 0/1 mask, floor-cropped. */
static double *block_mean(const BitMask *m, int d, int *ow, int *oh) {
    *ow = m->w / d; *oh = m->h / d;
    if (*ow < 1 || *oh < 1) return NULL;
    double *out = calloc((size_t)*ow * *oh, sizeof(double));
    for (int y = 0; y < *oh * d; y++)
        for (int x = 0; x < *ow * d; x++)
            out[(y / d) * *ow + x / d] += m->px[y * m->w + x];
    for (int i = 0; i < *ow * *oh; i++) out[i] /= (double)(d * d);
    return out;
}

/* Exact NCC of tmpl at (x, y) in a 0/1 mask. */
static double ncc_at(const BitMask *img, const BitMask *t, int x, int y) {
    double n = (double)t->w * t->h, sa = 0, sb = 0;
    for (int j = 0; j < t->h; j++)
        for (int i = 0; i < t->w; i++) {
            sa += img->px[(y + j) * img->w + x + i];
            sb += t->px[j * t->w + i];
        }
    double ma = sa / n, mb = sb / n, num = 0, va = 0, vb = 0;
    for (int j = 0; j < t->h; j++)
        for (int i = 0; i < t->w; i++) {
            double a = img->px[(y + j) * img->w + x + i] - ma;
            double b = t->px[j * t->w + i] - mb;
            num += a * b; va += a * a; vb += b * b;
        }
    double den = sqrt(va * vb);
    return den > 1e-9 ? num / den : 0.0;
}

/* Best (x, y, score) of a 0/1 template in a 0/1 mask: coarse NCC search on
 * d-times downsampled copies, then exact refine within ±d px. */
static double match_template(const BitMask *img, const BitMask *t, int d,
                             int *bx, int *by) {
    *bx = *by = 0;
    if (t->h > img->h || t->w > img->w) return 0.0;

    int cw, ch, tw, th, cx = 0, cy = 0;
    double *cm = block_mean(img, d, &cw, &ch);
    double *ct = block_mean(t, d, &tw, &th);
    if (cm && ct && th <= ch && tw <= cw) {
        int n = tw * th;
        double tmean = 0, tnorm = 0;
        for (int i = 0; i < n; i++) tmean += ct[i];
        tmean /= n;
        for (int i = 0; i < n; i++) ct[i] -= tmean, tnorm += ct[i] * ct[i];
        tnorm = sqrt(tnorm);
        double best = -INFINITY;
        for (int oy = 0; oy + th <= ch; oy++) {
            for (int ox = 0; ox + tw <= cw; ox++) {
                double num = 0, s1 = 0, s2 = 0;
                for (int j = 0; j < th; j++) {
                    const double *row = cm + (oy + j) * cw + ox;
                    const double *trow = ct + j * tw;
                    for (int i = 0; i < tw; i++) {
                        num += trow[i] * row[i];
                        s1 += row[i];
                        s2 += row[i] * row[i];
                    }
                }
                double var = s2 - s1 * s1 / n;
                if (var < 0) var = 0;
                double den = sqrt(var) * tnorm;
                double sc = den > 1e-9 ? num / den : 0.0;
                if (sc > best) { best = sc; cx = ox; cy = oy; }
            }
        }
    }
    free(cm);
    free(ct);

    double best = -1.0;
    int ylo = cy * d - d < 0 ? 0 : cy * d - d;
    int yhi = cy * d + d < img->h - t->h ? cy * d + d : img->h - t->h;
    int xlo = cx * d - d < 0 ? 0 : cx * d - d;
    int xhi = cx * d + d < img->w - t->w ? cx * d + d : img->w - t->w;
    for (int y = ylo; y <= yhi; y++)
        for (int x = xlo; x <= xhi; x++) {
            double sc = ncc_at(img, t, x, y);
            if (sc > best) { best = sc; *bx = x; *by = y; }
        }
    return best;
}

/* ── Glyphs ────────────────────────────────────────────────────────────────── */

typedef struct { int x0, y0, x1, y1, id; } Comp;  /* x1/y1 exclusive */

/* 8-connected components of a 0/1 mask, sorted left to right (stable).
 * labels[] receives component ids (0 = background). Returns the count. */
static int components(const BitMask *m, int *labels, Comp *out, int max_out) {
    int w = m->w, h = m->h, n = 0;
    memset(labels, 0, sizeof(int) * (size_t)w * h);
    int *stack = malloc(sizeof(int) * (size_t)w * h);
    for (int sy = 0; sy < h; sy++) {
        for (int sx = 0; sx < w; sx++) {
            if (!m->px[sy * w + sx] || labels[sy * w + sx]) continue;
            if (n >= max_out) { free(stack); goto sorted; }
            int id = n + 1, top = 0;
            Comp c = { sx, sy, sx + 1, sy + 1, id };
            labels[sy * w + sx] = id;
            stack[top++] = sy * w + sx;
            while (top) {
                int p = stack[--top], y = p / w, x = p % w;
                if (x < c.x0) c.x0 = x;
                if (x + 1 > c.x1) c.x1 = x + 1;
                if (y < c.y0) c.y0 = y;
                if (y + 1 > c.y1) c.y1 = y + 1;
                for (int ny = y - 1; ny <= y + 1; ny++) {
                    if (ny < 0 || ny >= h) continue;
                    for (int nx = x - 1; nx <= x + 1; nx++) {
                        if (nx < 0 || nx >= w) continue;
                        int q = ny * w + nx;
                        if (m->px[q] && !labels[q]) {
                            labels[q] = id;
                            stack[top++] = q;
                        }
                    }
                }
            }
            out[n++] = c;
        }
    }
    free(stack);
sorted:
    /* Stable insertion sort by x0 */
    for (int i = 1; i < n; i++) {
        Comp c = out[i];
        int j = i - 1;
        while (j >= 0 && out[j].x0 > c.x0) { out[j + 1] = out[j]; j--; }
        out[j + 1] = c;
    }
    return n;
}

/* Soft ink inside a component's bbox, limited to the component grown by one
 * pixel (mirrors glyph_image). Writes into g (bbox-sized). */
static void glyph_image(const FImg *ink, const int *labels, const Comp *c,
                        float *g) {
    int gw = c->x1 - c->x0, gh = c->y1 - c->y0;
    for (int y = 0; y < gh; y++) {
        for (int x = 0; x < gw; x++) {
            int grown = 0;
            for (int dy = -1; dy <= 1 && !grown; dy++) {
                int yy = y + dy;
                if (yy < 0 || yy >= gh) continue;
                for (int dx = -1; dx <= 1; dx++) {
                    int xx = x + dx;
                    if (xx < 0 || xx >= gw) continue;
                    if (labels[(c->y0 + yy) * ink->w + c->x0 + xx] == c->id) {
                        grown = 1;
                        break;
                    }
                }
            }
            g[y * gw + x] = grown ? ink->px[(c->y0 + y) * ink->w + c->x0 + x] : 0.0f;
        }
    }
}

/* Scale a glyph image to DIGIT_H tall on a DIGIT_H x DIGIT_W canvas (mirrors
 * normalize_glyph: 4x4 nearest-neighbour supersampling per output pixel). */
static void normalize_glyph(const float *g, int w, int h, float *out) {
    int nw = (int)(w * (double)DIGIT_H / h + 0.5);
    if (nw < 1) nw = 1;
    if (nw > DIGIT_W) nw = DIGIT_W;
    int off = (DIGIT_W - nw) / 2;
    memset(out, 0, sizeof(float) * DIGIT_H * DIGIT_W);
    for (int oy = 0; oy < DIGIT_H; oy++) {
        int sy[4];
        for (int k = 0; k < 4; k++) {
            sy[k] = (int)((oy + (k + 0.5) / 4.0) * h / DIGIT_H);
            if (sy[k] > h - 1) sy[k] = h - 1;
        }
        for (int ox = 0; ox < nw; ox++) {
            int sx[4];
            for (int k = 0; k < 4; k++) {
                sx[k] = (int)((ox + (k + 0.5) / 4.0) * w / nw);
                if (sx[k] > w - 1) sx[k] = w - 1;
            }
            float sum = 0;
            for (int a = 0; a < 4; a++)
                for (int b = 0; b < 4; b++)
                    sum += g[sy[a] * w + sx[b]];
            out[oy * DIGIT_W + ox + off] = sum / 16.0f;
        }
    }
}

static double ncc_f(const float *a, const float *b, int n) {
    double ma = 0, mb = 0;
    for (int i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    double num = 0, va = 0, vb = 0;
    for (int i = 0; i < n; i++) {
        double x = a[i] - ma, y = b[i] - mb;
        num += x * y; va += x * x; vb += y * y;
    }
    double den = sqrt(va * vb);
    return den > 1e-9 ? num / den : 0.0;
}

/* Classify one glyph against a template set whose entry i is a template for
 * character chars[i] (a character may have several variants). Each character
 * scores its best variant; the margin is against other characters. Returns
 * the character, or -1 if not confident (mirrors classify_digit). */
static int classify_glyph(const float (*set)[DIGIT_H * DIGIT_W], const char *chars,
                          int nset, double min_score, double margin,
                          const FImg *ink, const int *labels,
                          const Comp *c, double *best_out, double *second_out) {
    int gw = c->x1 - c->x0, gh = c->y1 - c->y0;
    float *g = malloc(sizeof(float) * (size_t)gw * gh);
    float norm[DIGIT_H * DIGIT_W];
    glyph_image(ink, labels, c, g);
    normalize_glyph(g, gw, gh, norm);
    free(g);

    double per[256];
    for (int i = 0; i < 256; i++) per[i] = -2;
    for (int d = 0; d < nset; d++) {
        double sc = ncc_f(norm, set[d], DIGIT_H * DIGIT_W);
        unsigned char ch = (unsigned char)chars[d];
        if (sc > per[ch]) per[ch] = sc;
    }
    double best = -2, second = -2;
    int bc = -1;
    for (int ch = 0; ch < 256; ch++) {
        if (per[ch] <= -2) continue;
        if (per[ch] > best) { second = best; best = per[ch]; bc = ch; }
        else if (per[ch] > second) second = per[ch];
    }
    *best_out = best; *second_out = second;
    if (best < min_score || best - second < margin) return -1;
    return bc;
}

static int digit_like(const Comp *c, double s) {
    int w = c->x1 - c->x0, h = c->y1 - c->y0;
    return h >= 14 * s && h <= 32 * s && w <= h;
}

/* Classify a left-to-right run of glyphs into text (mirrors read_glyphs):
 * stops at a gap wider than RUN_GAP glyph heights or a glyph of a different
 * height. With require_all, a run that stops before the last component is
 * rejected (a missed glyph mid-number would read as a shorter number).
 * Returns the length, or -1 with a reason in info. */
#define MAX_TEXT 24
static int read_glyphs(const float (*set)[DIGIT_H * DIGIT_W], const char *chars,
                       int nset, const Comp *comps, int n,
                       const FImg *ink, const int *labels, int require_all,
                       char *out, char *info, size_t info_sz) {
    int len = 0, prev_x1 = -1;
    int first_h = n > 0 ? comps[0].y1 - comps[0].y0 : 0;
    for (int i = 0; i < n; i++) {
        const Comp *c = &comps[i];
        int h = c->y1 - c->y0;
        if (prev_x1 >= 0 && c->x0 - prev_x1 > h * RUN_GAP) break;
        if (abs(h - first_h) > first_h * 0.15) break;  /* e.g. heart icon */
        double best, second;
        int d = classify_glyph(set, chars, nset, DIGIT_MIN, DIGIT_MARGIN,
                               ink, labels, c, &best, &second);
        if (d < 0) {
            snprintf(info, info_sz, "unrecognised glyph #%d (best %.2f, next %.2f)",
                     len + 1, best, second);
            return -1;
        }
        if (len >= MAX_TEXT) {
            snprintf(info, info_sz, "too many glyphs");
            return -1;
        }
        out[len++] = (char)d;
        prev_x1 = c->x1;
    }
    if (!len) { snprintf(info, info_sz, "no digits"); return -1; }
    out[len] = '\0';
    if (require_all && len < n) {
        snprintf(info, info_sz, "gap after '%s' — a glyph may be missing", out);
        return -1;
    }
    snprintf(info, info_sz, "%s", out);
    return len;
}

/* A run of MODES digits as one number; info receives the digits read.
 * Returns the value or -1. */
static long read_number(const Templates *t, const Comp *comps, int n,
                        const FImg *ink, const int *labels, int require_all,
                        char *info, size_t info_sz) {
    char out[MAX_TEXT + 1];
    int len = read_glyphs((const float (*)[DIGIT_H * DIGIT_W])t->digits, t->digit_chars,
                          t->n_digits, comps, n, ink, labels, require_all,
                          out, info, info_sz);
    if (len < 0) return -1;
    if (len > MAX_DIGITS) { snprintf(info, info_sz, "too many digits"); return -1; }
    return strtol(out, NULL, 10);
}

/* True if `text` (digits read from dig[0..nd-1], left to right) fits the
 * commas among all[0..nall-1] (every component of that colour in the row):
 * the game groups thousands with commas, so the commas fix the digit count,
 * and a multi-digit number never starts with 0. Catches a missed first/last
 * digit, which leaves no gap to notice (mirrors grouping_ok). */
static int grouping_ok(const char *text, const Comp *dig, int nd,
                       const Comp *all, int nall) {
    int len = (int)strlen(text);
    if (len == 0 || len != nd) return 0;
    for (int i = 0; i < len; i++) if (text[i] < '0' || text[i] > '9') return 0;
    if (len > 1 && text[0] == '0') return 0;
    int h = 0, base = 0;
    for (int i = 0; i < nd; i++) {
        if (dig[i].y1 - dig[i].y0 > h) h = dig[i].y1 - dig[i].y0;
        if (dig[i].y1 > base) base = dig[i].y1;
    }
    /* Include a stray comma just before the first digit (a missed leading
     * digit leaves one behind). */
    double lo = dig[0].x0 - h, hi = dig[nd - 1].x0 + 3;
    int right[16], nc = 0;
    for (int i = 0; i < nall; i++) {
        const Comp *c = &all[i];
        double cx = (c->x0 + c->x1) / 2.0;
        int ch = c->y1 - c->y0;
        if (ch < 0.6 * h && fabs((double)(c->y1 - base)) < 0.4 * h && cx >= lo && cx <= hi) {
            if (nc >= 16) return 0;
            int k = 0;
            for (int d = 0; d < nd; d++) if ((dig[d].x0 + dig[d].x1) / 2.0 > cx) k++;
            right[nc++] = k;
        }
    }
    if (nc != (len - 1) / 3) return 0;
    /* Digits right of each comma must be 3, 6, 9, ... */
    for (int i = 1; i < nc; i++)
        for (int j = i; j > 0 && right[j - 1] > right[j]; j--) {
            int tmp = right[j]; right[j] = right[j - 1]; right[j - 1] = tmp;
        }
    for (int i = 0; i < nc; i++) if (right[i] != 3 * (i + 1)) return 0;
    return 1;
}

/* ── Screen read ───────────────────────────────────────────────────────────── */

typedef struct {
    int    post;                        /* 1 = read from the post-match panel */
    int    on_modes;
    double gate_score;
    int    header;                      /* index into headers (or post_headers), -1 */
    double header_scores[N_HEADERS];    /* -2 = template not loaded */
    long   value, max_value;            /* -1 = none; World Tour = fans in this badge */
    long   total;                       /* what to push: the season total, -1 = none */
    int    tier;                        /* ranked: badge tier 1-4 if both badges agree, -1 */
    char   verdict[400];
} Reading;

static int imin(int a, int b) { return a < b ? a : b; }
static int imax(int a, int b) { return a > b ? a : b; }

/* Collect digit-like comps; if min_x0 >= 0 also require x0 >= min_x0. */
static int filter_digits(const Comp *in, int n, double s, int min_x0, Comp *out) {
    int k = 0;
    for (int i = 0; i < n; i++)
        if (digit_like(&in[i], s) && (min_x0 < 0 || in[i].x0 >= min_x0))
            out[k++] = in[i];
    return k;
}

/* Top-left zone the MODES tab is searched in (mirrors gate_zone). The tab
 * sits at x~270-413, y 0-85 at 1440p; the extra width allows for a shifted
 * nav bar (e.g. ultrawide). ~3% of the screen, so the main loop grabs just
 * this zone each poll and the full frame only on a hit. */
static void gate_zone(int screen_w, int screen_h, int *zw, int *zh) {
    double s = (double)screen_h / REF_H;
    *zw = imin(screen_w, (int)(960 * s));
    *zh = imin(screen_h, (int)(130 * s));
}

/* MODES-tab match score. f is the full monitor or just its gate zone;
 * screen_h is the monitor height (sets the template scale). */
static double check_gate(const Frame *f, const Templates *t, int screen_h) {
    double s = (double)screen_h / REF_H;
    int zw, zh, bx, by;
    gate_zone(f->w, screen_h, &zw, &zh);
    zh = imin(zh, f->h);
    BitMask region, tm;
    make_mask(f, 0, 0, zw, zh, INK_YELLOW, &region);

    /* Pre-check: without roughly a tab's worth of yellow in the zone (e.g.
     * mid-match) skip the template match entirely. */
    long have = 0, tab = 0;
    for (int i = 0; i < zw * zh; i++) have += region.px[i];
    for (int i = 0; i < t->modes.w * t->modes.h; i++) tab += t->modes.px[i];
    if (have < GATE_MIN_YELLOW * tab * s * s) {
        free(region.px);
        return 0.0;
    }

    scale_mask(&t->modes, s, &tm);
    double score = match_template(&region, &tm, imax(1, (int)(4 * s)), &bx, &by);
    free(region.px);
    free(tm.px);
    return score;
}

/* ── Post-match panel ──────────────────────────────────────────────────────── */

/* Centre zone holding the post-match "WORLD TOUR SCORE" header and value
 * (mirrors post_zone). At 1440p the header sits at x 1130-1437, y 654-683
 * and the value just below it. ~4% of the screen. */
static void post_zone(int screen_w, int screen_h, int *x, int *y, int *w, int *h) {
    double s = (double)screen_h / REF_H;
    int x0 = imax(0, (int)(screen_w / 2.0 - 360 * s));
    int y0 = imax(0, (int)(screen_h / 2.0 - 150 * s));
    int x1 = imin(screen_w, (int)(screen_w / 2.0 + 360 * s));
    int y1 = imin(screen_h, (int)(screen_h / 2.0 + 60 * s));
    *x = x0; *y = y0; *w = x1 - x0; *h = y1 - y0;
}

static void reading_init(Reading *r) {
    memset(r, 0, sizeof(*r));
    r->header = -1;
    r->value = r->max_value = r->total = -1;
    r->tier = -1;
    for (int i = 0; i < N_HEADERS; i++) r->header_scores[i] = -2;
}

/* World Tour fans (Season 12+), mirrors fans_total in screen_reader.py: the
 * game shows "X / Y" = fans in the current badge / fans it needs. Badge n
 * (Bronze 4 = 1 … Emerald 1 = 24) needs 2,000·n, so Y identifies the badge
 * and the season total is 1,000·n·(n-1) + X. -1 if Y isn't a badge's need. */
#define FANS_STEP   2000
#define FANS_BADGES 24
static long fans_total(long in_rank, long required) {
    if (in_rank < 0 || required <= 0 || required % FANS_STEP) return -1;
    long n = required / FANS_STEP;
    if (n > FANS_BADGES || in_rank > required) return -1;
    return FANS_STEP / 2 * n * (n - 1) + in_rank;
}

/* Season rank score from the ranked "X / 2,499" readout (mirrors ranked_total
 * in screen_reader.py). tier: badge tier 1-4 or -1; anchor: last saved ranked
 * score or -1. Returns the total, or -1 with the reason in why. */
static long ranked_total(long value, long max_value, int tier, long anchor,
                         char *why, size_t why_sz) {
    if (max_value != RANKED_TIER - 1) {
        if (max_value >= 0)
            snprintf(why, why_sz, "%ld / %ld isn't a ranked tier (expected / %d)",
                     value, max_value, RANKED_TIER - 1);
        else
            snprintf(why, why_sz, "%ld (no max) isn't a ranked tier (expected / %d)",
                     value, RANKED_TIER - 1);
        return -1;
    }
    if (anchor < 0) {
        snprintf(why, why_sz, "no saved ranked score to place it from (enter it once in the app)");
        return -1;
    }
    long base, step, n, limit;
    if (tier > 0) {
        base = (4 - tier) * RANKED_TIER + value; step = RANKED_LEAGUE;
        n = RANKED_LEAGUES; limit = RANKED_MAX_STEP;
    } else {
        base = value; step = RANKED_TIER; n = 4 * RANKED_LEAGUES;
        limit = RANKED_MAX_STEP_NO_TIER;
    }
    long num = anchor - base + step / 2;
    long k = num >= 0 ? num / step : -((-num + step - 1) / step);  /* floor */
    if (k < 0) k = 0;
    if (k > n - 1) k = n - 1;
    long total = base + k * step, off = labs(total - anchor);
    if (off > limit) {
        snprintf(why, why_sz, "nearest fit %ld is %ld from the saved %ld (limit %ld) — update it in the app",
                 total, off, anchor, limit);
        return -1;
    }
    snprintf(why, why_sz, "%ld RS", total);
    return total;
}

/* Tier number (1-4) on the badge whose tier circle is near (cx, cy), in a
 * frame rect at (ox, oy) of size rw x rh. Returns the tier or -1 (mirrors
 * read_badge_tier). */
static int read_badge_tier(const Frame *f, int ox, int oy, int rw, int rh,
                           double cx, double cy, double s, const Templates *t) {
    int zr = (int)(TIER_ZONE * s);
    int x0 = imax(0, (int)cx - zr), y0 = imax(0, (int)cy - zr);
    int x1 = imin(rw, (int)cx + zr), y1 = imin(rh, (int)cy + zr);
    int zw = x1 - x0, zh = y1 - y0;
    if (zw < 4 || zh < 4) return -1;
    BitMask m;
    FImg ink;
    make_mask(f, ox + x0, oy + y0, zw, zh, INK_LUMA, &m);
    make_ink(f, ox + x0, oy + y0, zw, zh, INK_LUMA, &ink);
    int *lab = malloc(sizeof(int) * (size_t)zw * zh);
    Comp *all = malloc(sizeof(Comp) * MAX_COMPS);
    int n = components(&m, lab, all, MAX_COMPS);
    double lx = cx - x0, ly = cy - y0, best_d = 1e18;
    int pick = -1;
    for (int i = 0; i < n; i++) {
        const Comp *c = &all[i];
        int w = c->x1 - c->x0, h = c->y1 - c->y0;
        /* Tier-number sized, clear of the zone's edge (the rim and emblem
         * are bigger and run off it). */
        if (h < 11 * s || h > 24 * s || w > h) continue;
        if (c->x0 <= 0 || c->y0 <= 0 || c->x1 >= zw || c->y1 >= zh) continue;
        double dist = fabs((c->x0 + c->x1) / 2.0 - lx) + fabs((c->y0 + c->y1) / 2.0 - ly);
        if (dist < best_d) { best_d = dist; pick = i; }
    }
    int tier = -1;
    if (pick >= 0) {
        double best, second;
        int ch = classify_glyph((const float (*)[DIGIT_H * DIGIT_W])t->tiers, t->tier_chars,
                                t->n_tiers, TIER_MIN, TIER_MARGIN, &ink, lab, &all[pick],
                                &best, &second);
        if (ch >= '1' && ch <= '4') tier = ch - '0';
    }
    free(m.px); free(ink.px); free(lab); free(all);
    return tier;
}

/* Current tier from the badges either side of the ranked header (found at
 * hx, hy, width tw, in the frame rect at ox, oy). Both must be read and
 * agree: the next badge is one tier up, Tier 1 is followed by Tier 4.
 * Returns the tier or -1; desc describes it (mirrors badge_tier). */
static int badge_tier(const Frame *f, int ox, int oy, int rw, int rh, int hx, int hy,
                      int tw, double s, const Templates *t, char *desc, size_t desc_sz) {
    if (t->n_tiers < 2) {
        snprintf(desc, desc_sz, "tier templates not installed");
        return -1;
    }
    double cx = hx + tw / 2.0, cy = hy + TIER_DY * s;
    int a = read_badge_tier(f, ox, oy, rw, rh, cx - TIER_DX * s, cy, s, t);
    int b = read_badge_tier(f, ox, oy, rw, rh, cx + TIER_DX * s, cy, s, t);
    char as[4] = "?", bs[4] = "?";
    if (a > 0) snprintf(as, sizeof(as), "%d", a);
    if (b > 0) snprintf(bs, sizeof(bs), "%d", b);
    if (a < 0 || b < 0 || !(b == a - 1 || (a == 1 && b == 4))) {
        snprintf(desc, desc_sz, "tier unknown (badges %s → %s)", as, bs);
        return -1;
    }
    snprintf(desc, desc_sz, "tier %d (badges %s → %s)", a, as, bs);
    return a;
}

/* Read the post-match panel from its post_zone() crop (mirrors read_post).
 * r->post is set as soon as the header is found, even if the value can't be
 * read yet (still counting up / fading in) — the loop polls faster then. */
static void read_post(const Frame *z, const Templates *t, int screen_h, Reading *r) {
    reading_init(r);
    if (!t->post_ok) {
        snprintf(r->verdict, sizeof(r->verdict), "post-match templates not installed");
        return;
    }
    double s = (double)screen_h / REF_H;
    if (s < MIN_SCALE) {
        snprintf(r->verdict, sizeof(r->verdict), "resolution too low for the post-match panel");
        return;
    }

    BitMask wmask;
    make_mask(z, 0, 0, z->w, z->h, INK_WHITE, &wmask);

    /* Pre-check: the header alone is a lot of white. */
    long have = 0, need = -1;
    for (int i = 0; i < wmask.w * wmask.h; i++) have += wmask.px[i];
    for (int i = 0; i < N_POST_HEADERS; i++) {
        if (!t->post_headers[i].loaded) continue;
        long c = 0;
        const BitMask *m = &t->post_headers[i].m;
        for (int k = 0; k < m->w * m->h; k++) c += m->px[k];
        if (need < 0 || c < need) need = c;
    }
    if (have < POST_MIN_WHITE * need * s * s) {
        free(wmask.px);
        snprintf(r->verdict, sizeof(r->verdict), "no post-match panel");
        return;
    }

    int d = imax(1, (int)(4 * s));
    int best = -1, hx = 0, hy = 0, tw = 0, th = 0, bx, by;
    double best_sc = 0;
    for (int i = 0; i < N_POST_HEADERS; i++) {
        if (!t->post_headers[i].loaded) continue;
        BitMask tm;
        scale_mask(&t->post_headers[i].m, s, &tm);
        double sc = match_template(&wmask, &tm, d, &bx, &by);
        r->header_scores[i] = sc;
        if (sc >= HEADER_MIN && (best < 0 || sc > best_sc)) {
            best = i; best_sc = sc; hx = bx; hy = by; tw = tm.w; th = tm.h;
        }
        free(tm.px);
    }
    free(wmask.px);
    if (best < 0) {
        snprintf(r->verdict, sizeof(r->verdict), "no post-match panel");
        return;
    }
    r->post = 1;
    r->header = best;
    const char *name = t->post_headers[best].name;

    /* Value row just under the header: "5,736/8,000" in white. */
    int vx0 = imax(0, (int)(hx - 60 * s));
    int vx1 = imin(z->w, (int)(hx + tw + 60 * s));
    int vy0 = (int)(hy + th + 2 * s);
    int vy1 = imin(z->h, (int)(hy + th + 50 * s));
    if (vx1 <= vx0 || vy1 <= vy0) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "post-match '%s' panel, value not visible yet", name);
        return;
    }
    int vw = vx1 - vx0, vh = vy1 - vy0;
    BitMask vm;
    FImg ink;
    make_mask(z, vx0, vy0, vw, vh, INK_WHITE_POST, &vm);
    make_ink(z, vx0, vy0, vw, vh, INK_WHITE_POST, &ink);
    int *lab = malloc(sizeof(int) * (size_t)vw * vh);
    Comp *all = malloc(sizeof(Comp) * MAX_COMPS);
    Comp *dig = malloc(sizeof(Comp) * MAX_COMPS);
    char text[MAX_TEXT + 1], info[128];

    int n = components(&vm, lab, all, MAX_COMPS);
    int nd = filter_digits(all, n, s, -1, dig);
    if (nd == 0) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "post-match '%s' panel, value not visible yet", name);
        goto done;
    }
    if (read_glyphs((const float (*)[DIGIT_H * DIGIT_W])t->post_glyphs, POST_CHARS,
                    N_POST_GLYPHS, dig, nd, &ink, lab, 0, text, info, sizeof(info)) < 0) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "post-match '%s' value unreadable: %s", name, info);
        goto done;
    }
    /* Expect "<digits>/<digits>" */
    char *slash = strchr(text, '/');
    int ok = slash && slash != text && slash[1] && !strchr(slash + 1, '/');
    if (ok) {
        *slash = '\0';
        int lc = (int)strlen(text), lm = (int)strlen(slash + 1);
        ok = lc <= MAX_DIGITS && lm <= MAX_DIGITS;
        if (!ok) *slash = '/';
    }
    if (!ok) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "post-match '%s' value malformed: '%s'", name, text);
        goto done;
    }
    int k = (int)strlen(text);
    if (!grouping_ok(text, dig, k, all, n) ||
        !grouping_ok(slash + 1, dig + k + 1, (int)strlen(slash + 1), all, n)) {
        *slash = '/';
        snprintf(r->verdict, sizeof(r->verdict),
                 "post-match '%s' read %s, but its commas don't fit — a digit may be missing",
                 name, text);
        goto done;
    }
    long value = strtol(text, NULL, 10), max_value = strtol(slash + 1, NULL, 10);
    if (value > max_value) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "post-match '%s' read %ld / %ld — current > max, rejecting",
                 name, value, max_value);
        goto done;
    }
    r->value = value;
    r->max_value = max_value;
    snprintf(r->verdict, sizeof(r->verdict), "post-match %s: %ld / %ld",
             name, value, max_value);
done:
    free(vm.px); free(ink.px); free(lab); free(all); free(dig);
}

/* Server mode of a reading, or NULL. */
static const char *reading_mode(const Templates *t, const Reading *r) {
    if (r->header < 0) return NULL;
    return r->post ? t->post_headers[r->header].mode : t->headers[r->header].mode;
}

/* Set r->total from a successful read (mirrors _finish in screen_reader.py).
 * World Tour shows fans in the current badge, so convert "X / Y" to the
 * season total; without a valid Y, reject the read. Ranked shows RS in the
 * current tier: placed with ranked_total near ranked_anchor (-1 = none). */
static void reading_finish(const Templates *t, Reading *r, long ranked_anchor) {
    const char *mode = reading_mode(t, r);
    if (!mode || r->value < 0) return;
    if (strcmp(mode, "ranked") == 0) {
        char why[200];
        long total = ranked_total(r->value, r->max_value, r->tier, ranked_anchor, why, sizeof(why));
        size_t len = strlen(r->verdict);
        if (total < 0) {
            snprintf(r->verdict + len, sizeof(r->verdict) - len, " — %s, not saving", why);
            return;
        }
        r->total = total;
        snprintf(r->verdict + len, sizeof(r->verdict) - len, " = %s", why);
        return;
    }
    if (strcmp(mode, "world-tour") != 0) { r->total = r->value; return; }
    long total = r->max_value >= 0 ? fans_total(r->value, r->max_value) : -1;
    size_t len = strlen(r->verdict);
    if (total < 0) {
        snprintf(r->verdict + len, sizeof(r->verdict) - len,
                 " — not a World Tour badge's fans, rejecting");
        r->value = r->max_value = -1;
        return;
    }
    r->total = total;
    snprintf(r->verdict + len, sizeof(r->verdict) - len, " = %ld fans this season", total);
}

static const char *reading_header_name(const Templates *t, const Reading *r, int i) {
    return r->post ? t->post_headers[i].name : t->headers[i].name;
}

/* Gate -> header -> value pipeline on one full-monitor frame
 * (mirrors read_frame in screen_reader.py). */
static void read_frame(const Frame *f, const Templates *t, Reading *r) {
    reading_init(r);

    int W = f->w, H = f->h;
    double s = (double)H / REF_H;
    int d = imax(1, (int)(4 * s));
    int bx, by;

    /* 1. Gate: yellow MODES tab, top-left */
    r->gate_score = check_gate(f, t, H);
    r->on_modes = r->gate_score >= GATE_MIN;
    if (!r->on_modes) {
        /* Not the lobby — maybe the post-match score panel. */
        double gate = r->gate_score;
        int px, py, pw, ph;
        post_zone(W, H, &px, &py, &pw, &ph);
        Frame z = { frame_px(f, px, py), pw, ph, f->stride, f->bpp, f->ro, f->go, f->bo };
        read_post(&z, t, H, r);
        r->gate_score = gate;
        if (r->post) return;
        reading_init(r);
        r->gate_score = gate;
        snprintf(r->verdict, sizeof(r->verdict),
                 "not on the MODES tab (tab match %.2f)", r->gate_score);
        return;
    }

    /* 2. Header: bottom-centre panel, anchored on the screen centre */
    int rx0 = imax(0, (int)(W / 2.0 - 640 * s));
    int rx1 = imin(W, (int)(W / 2.0 + 640 * s));
    int ry0 = imax(0, (int)(H - 380 * s));
    int rw = rx1 - rx0, rh = H - ry0;

    BitMask wmask;
    make_mask(f, rx0, ry0, rw, rh, INK_WHITE, &wmask);
    int best = -1, hx = 0, hy = 0, tw = 0, th = 0;
    double best_sc = 0;
    for (int i = 0; i < N_HEADERS; i++) {
        if (!t->headers[i].loaded) continue;
        BitMask tm;
        scale_mask(&t->headers[i].m, s, &tm);
        double sc = match_template(&wmask, &tm, d, &bx, &by);
        r->header_scores[i] = sc;
        if (sc >= HEADER_MIN && (best < 0 || sc > best_sc)) {
            best = i; best_sc = sc; hx = bx; hy = by; tw = tm.w; th = tm.h;
        }
        free(tm.px);
    }
    free(wmask.px);

    if (best < 0) {
        char scores[160] = "";
        size_t len = 0;
        for (int i = 0; i < N_HEADERS; i++) {
            if (!t->headers[i].loaded) continue;
            len += snprintf(scores + len, sizeof(scores) - len, "%s%s %.2f",
                            len ? ", " : "", t->headers[i].name, r->header_scores[i]);
            if (len >= sizeof(scores)) break;
        }
        snprintf(r->verdict, sizeof(r->verdict),
                 "on MODES, but no known score header (%s)", scores);
        return;
    }

    r->header = best;
    const char *name = t->headers[best].name;
    if (!t->headers[best].mode) {
        snprintf(r->verdict, sizeof(r->verdict), "'%s' panel — nothing to record", name);
        return;
    }

    if (s < MIN_SCALE) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "'%s' found, but %dx%d is too low to read digits (need 900p+)", name, W, H);
        return;
    }

    /* 3. Value row under the header: yellow current, then white "/ max" */
    int vx0 = imax(0, (int)(hx - 40 * s));
    int vx1 = imin(rw, (int)(hx + tw + 40 * s));
    int vy0 = (int)(hy + th + 2 * s);
    int vy1 = imin(rh, (int)(hy + th + 42 * s));
    if (vx1 <= vx0 || vy1 <= vy0) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "'%s' header found, but no yellow value under it", name);
        return;
    }
    int ox = rx0 + vx0, oy = ry0 + vy0, vw = vx1 - vx0, vh = vy1 - vy0;

    BitMask ym, wm;
    FImg yink, wink;
    make_mask(f, ox, oy, vw, vh, INK_YELLOW, &ym);
    make_mask(f, ox, oy, vw, vh, INK_WHITE, &wm);
    make_ink(f, ox, oy, vw, vh, INK_YELLOW, &yink);
    make_ink(f, ox, oy, vw, vh, INK_WHITE, &wink);
    int *ylab = malloc(sizeof(int) * (size_t)vw * vh);
    int *wlab = malloc(sizeof(int) * (size_t)vw * vh);
    Comp *all = malloc(sizeof(Comp) * MAX_COMPS);
    Comp *ycomps = malloc(sizeof(Comp) * MAX_COMPS);
    Comp *wcomps = malloc(sizeof(Comp) * MAX_COMPS);
    char info[128];

    int n = components(&ym, ylab, all, MAX_COMPS);
    int ny = filter_digits(all, n, s, -1, ycomps);
    if (ny == 0) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "'%s' header found, but no yellow value under it", name);
        goto done;
    }
    /* The yellow current value is the only yellow text in the row, so every
     * digit-shaped glyph must be part of it. */
    long value = read_number(t, ycomps, ny, &yink, ylab, 1, info, sizeof(info));
    if (value < 0) {
        snprintf(r->verdict, sizeof(r->verdict), "'%s' value unreadable: %s", name, info);
        goto done;
    }
    if (!grouping_ok(info, ycomps, ny, all, n)) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "'%s' read %s, but its commas don't fit — a digit may be missing", name, info);
        goto done;
    }

    /* Max: white glyphs right of the current value; the first is the "/" */
    n = components(&wm, wlab, all, MAX_COMPS);
    int nw = filter_digits(all, n, s, ycomps[ny - 1].x1, wcomps);
    if (nw > 0 && wcomps[0].x0 - ycomps[ny - 1].x1 >
                  SLASH_GAP_MAX * (ycomps[0].y1 - ycomps[0].y0)) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "'%s' read %ld, but the '/' is too far after it — a digit may be missing",
                 name, value);
        goto done;
    }
    long max_value = -1;
    if (nw >= 2) {
        max_value = read_number(t, wcomps + 1, nw - 1, &wink, wlab, 0, info, sizeof(info));
        /* An inconsistent max just skips the sanity check below. */
        if (max_value >= 0 &&
            !grouping_ok(info, wcomps + 1, (int)strlen(info), all, n))
            max_value = -1;
    }
    if (max_value >= 0 && value > max_value) {
        snprintf(r->verdict, sizeof(r->verdict),
                 "'%s' read %ld / %ld — current > max, rejecting", name, value, max_value);
        goto done;
    }

    r->value = value;
    r->max_value = max_value;
    if (max_value >= 0)
        snprintf(r->verdict, sizeof(r->verdict), "%s: %ld / %ld", name, value, max_value);
    else
        snprintf(r->verdict, sizeof(r->verdict), "%s: %ld", name, value);
    if (strcmp(t->headers[best].mode, "ranked") == 0) {
        char desc[96];
        r->tier = badge_tier(f, rx0, ry0, rw, rh, hx, hy, tw, s, t, desc, sizeof(desc));
        size_t len = strlen(r->verdict);
        snprintf(r->verdict + len, sizeof(r->verdict) - len, ", %s", desc);
    }

done:
    free(ym.px); free(wm.px); free(yink.px); free(wink.px);
    free(ylab); free(wlab); free(all); free(ycomps); free(wcomps);
}

/* ── HTTP API ──────────────────────────────────────────────────────────────── */

static size_t curl_discard(void *ptr, size_t size, size_t nmemb, void *ud) {
    (void)ptr; (void)ud;
    return size * nmemb;
}

static int push_record(const Config *cfg, const char *mode, long win_points) {
    time_t now = time(NULL);
    struct tm tm;
    localtime_r(&now, &tm);
    char date[16];
    strftime(date, sizeof(date), "%Y-%m-%d", &tm);

    char body[256];
    snprintf(body, sizeof(body),
             "{\"date\":\"%s\",\"winPoints\":%ld,\"mode\":\"%s\"}",
             date, win_points, mode);

    char url[600];
    snprintf(url, sizeof(url), "%s/me/records", cfg->server_url);

    char auth_hdr[300];
    snprintf(auth_hdr, sizeof(auth_hdr), "Authorization: %s", cfg->auth_token);

    CURL *curl = curl_easy_init();
    if (!curl) return -1;

    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    headers = curl_slist_append(headers, auth_hdr);

    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_discard);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);

    CURLcode res = curl_easy_perform(curl);
    long http_code = 0;
    if (res == CURLE_OK)
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) {
        logmsg("ERROR: Push failed: %s", curl_easy_strerror(res));
        return -1;
    }

    if (http_code == 200 || http_code == 201) {
        logmsg("Pushed %s winPoints=%ld for %s (HTTP %ld)",
               mode, win_points, date, http_code);
        return 0;
    }

    logmsg("ERROR: Push failed (HTTP %ld)", http_code);
    return -1;
}

/* Response body collector for fetch_ranked_anchor (capped). */
typedef struct { char buf[8192]; size_t len; } Body;

static size_t curl_collect(void *ptr, size_t size, size_t nmemb, void *ud) {
    Body *b = ud;
    size_t n = size * nmemb, room = sizeof(b->buf) - 1 - b->len;
    memcpy(b->buf + b->len, ptr, n < room ? n : room);
    b->len += n < room ? n : room;
    b->buf[b->len] = '\0';
    return n;
}

static long read_state(const char *path);

/* GET url into body (truncated to its buffer, which is plenty for what's
 * read from it). auth may be NULL. Returns the HTTP status, or -1. */
static long http_get(const char *url, const char *auth, Body *body) {
    body->len = 0;
    body->buf[0] = '\0';
    CURL *curl = curl_easy_init();
    if (!curl) return -1;
    char auth_hdr[300];
    struct curl_slist *headers = NULL;
    if (auth) {
        snprintf(auth_hdr, sizeof(auth_hdr), "Authorization: %s", auth);
        headers = curl_slist_append(headers, auth_hdr);
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    }
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_collect);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, body);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    CURLcode res = curl_easy_perform(curl);
    long http_code = -1;
    if (res == CURLE_OK) curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
    else logmsg("GET %s failed: %s", url, curl_easy_strerror(res));
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    return http_code;
}

/* Start date (YYYY-MM-DD) of the season running today into out[11]: the
 * latest "start" not after today in the server's public season list.
 * Returns 0, or -1 if unknown. */
static int current_season_start(const Config *cfg, char *out) {
    static Body body;
    char url[600], today[16];
    snprintf(url, sizeof(url), "%s/seasons", cfg->server_url);
    if (http_get(url, NULL, &body) != 200) return -1;
    time_t now = time(NULL);
    struct tm tm;
    localtime_r(&now, &tm);
    strftime(today, sizeof(today), "%Y-%m-%d", &tm);
    out[0] = '\0';
    const char *key = "\"start\":\"";
    for (const char *k = strstr(body.buf, key); k; k = strstr(k + 1, key)) {
        const char *d = k + strlen(key);
        if (strlen(d) < 10) break;
        char date[11];
        memcpy(date, d, 10);
        date[10] = '\0';
        if (strcmp(date, today) <= 0 && strcmp(date, out) > 0) memcpy(out, date, 11);
    }
    return out[0] ? 0 : -1;
}

/* Latest saved ranked score from this season: records come newest first, so
 * it's the first record, unless that's from before this season (last
 * season's score is no guide after a reset). Falls back to the last value
 * this tracker pushed if the server can't be reached; -1 if unknown. */
static long fetch_ranked_anchor(const Config *cfg) {
    static Body body;
    char url[600];
    snprintf(url, sizeof(url), "%s/me/records?mode=ranked", cfg->server_url);
    long code = http_get(url, cfg->auth_token, &body);
    if (code != 200) {
        if (code > 0) logmsg("Fetching saved ranked score failed (HTTP %ld)", code);
        return read_state(cfg->state_file_rank);
    }
    const char *pts = strstr(body.buf, "\"winPoints\":");
    const char *date = strstr(body.buf, "\"date\":\"");
    if (!pts) return -1;  /* no ranked records yet */
    char start[11];
    if (date && current_season_start(cfg, start) == 0 &&
        strncmp(date + strlen("\"date\":\""), start, 10) < 0)
        return -1;  /* newest record is from last season */
    return strtol(pts + strlen("\"winPoints\":"), NULL, 10);
}

/* ── State file ────────────────────────────────────────────────────────────── */

static long read_state(const char *path) {
    FILE *f = fopen(path, "r");
    if (!f) return -1;
    long val = -1;
    if (fscanf(f, "%ld", &val) != 1) val = -1;
    fclose(f);
    return val;
}

static void write_state(const char *path, long val) {
    FILE *f = fopen(path, "w");
    if (f) { fprintf(f, "%ld\n", val); fclose(f); }
}

/* ── Per-(screen, mode) tracking ───────────────────────────────────────────────
 * World Tour / Ranked are each read from two screens: the MODES tab and the
 * post-match panel. Each pair has its own streak: a value is pushed once
 * it's been read identically `confirm` times in a row, then that pair rests
 * for `rest` seconds. Separate pairs mean a MODES confirmation never hides
 * the next post-match result. */

typedef struct {
    const char *name;        /* human label for logs */
    const char *mode;        /* mode string posted to the server */
    const char *state_file;  /* last-pushed value path */
    time_t      rest_until;  /* dormant until this time (0 = active) */
    int         reads;       /* identical reads in a row */
    long        last_val;    /* value of the current streak, -1 = none */
    int         confirm;     /* identical reads needed */
    int         rest;        /* seconds to rest after confirming */
} ModeState;

/* Last saved ranked score: ranked reads are placed next to it. */
static long g_ranked_anchor = -1;

static void handle_read(const Config *cfg, ModeState *m, long value, time_t now,
                        double ms) {
    if (now < m->rest_until) return;

    if (value == m->last_val) {
        m->reads++;
    } else {
        m->reads = 1;
        m->last_val = value;
    }
    logq("%s=%ld read #%d | %.0fms", m->name, value, m->reads, ms);

    if (m->reads < m->confirm) return;

    long last = read_state(m->state_file);
    if (value != last) {
        logmsg("%s changed: %ld -> %ld", m->name, last, value);
        if (push_record(cfg, m->mode, value) == 0) {
            write_state(m->state_file, value);
            if (strcmp(m->mode, "ranked") == 0) g_ranked_anchor = value;
        }
    }
    m->rest_until = now + m->rest;
    m->reads = 0;
    m->last_val = -1;
    logmsg("%s confirmed (%ld). Resting %ds.", m->name, value, m->rest);
}

/* ── --read: one screenshot ────────────────────────────────────────────────── */

static int read_file(const char *path, long anchor) {
    char dir[PATH_MAX];
    Templates t;
    if (find_templates_dir(g_cfg.script_dir, dir) != 0 || templates_load(&t, dir) != 0) {
        fprintf(stderr, "ERROR: templates not found next to the binary\n");
        return 1;
    }
    int w, h;
    unsigned char *px = read_pnm(path, "P6", 3, &w, &h);
    if (!px) {
        fprintf(stderr, "ERROR: %s is not a binary (P6) PPM\n", path);
        return 1;
    }
    Frame f = { px, w, h, w * 3, 3, 0, 1, 2 };
    Reading r;
    double t0 = now_ms();
    read_frame(&f, &t, &r);
    reading_finish(&t, &r, anchor);
    double ms = now_ms() - t0;

    printf("gate %.3f  headers {", r.gate_score);
    int first = 1;
    for (int i = 0; i < N_HEADERS; i++) {
        if (r.header_scores[i] < -1) continue;
        printf("%s'%s': %.3f", first ? "" : ", ", reading_header_name(&t, &r, i),
               r.header_scores[i]);
        first = 0;
    }
    const char *mode = reading_mode(&t, &r);
    printf("}\n=> %s  (mode=%s, value=%ld, max=%ld, tier=%d, total=%ld) [%.1fms]\n", r.verdict,
           mode ? mode : "None", r.value, r.max_value, r.tier, r.total, ms);
    free(px);
    templates_free(&t);
    return r.total >= 0 ? 0 : 2;
}

/* ── Signal handler ────────────────────────────────────────────────────────── */

static void sig_handler(int sig) {
    (void)sig;
    g_exiting = 1;
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

int main(int argc, char **argv) {
    if (init_paths(&g_cfg) != 0) {
        fprintf(stderr, "ERROR: cannot determine install directory\n");
        return 1;
    }

    /* --read shot.ppm [saved ranked score] */
    if ((argc == 3 || argc == 4) && strcmp(argv[1], "--read") == 0) {
        g_cfg.log_file[0] = '\0';  /* don't touch tracker.log */
        return read_file(argv[2], argc == 4 ? strtol(argv[3], NULL, 10) : -1);
    }

    if (load_env(&g_cfg) != 0) {
        fprintf(stderr, "ERROR: Failed to load .env (run season-tracker.sh for setup)\n");
        return 1;
    }

    Templates tmpl;
    char tmpl_dir[PATH_MAX];
    if (find_templates_dir(g_cfg.script_dir, tmpl_dir) != 0) {
        logmsg("ERROR: templates folder not found (expected %s/templates)", g_cfg.script_dir);
        return 1;
    }
    if (templates_load(&tmpl, tmpl_dir) != 0)
        return 1;

    signal(SIGINT,  sig_handler);
    signal(SIGTERM, sig_handler);

    /* Launch game if args provided */
    pid_t game_pid = 0;
    if (argc > 1) {
        game_pid = fork();
        if (game_pid == 0) {
            execvp(argv[1], &argv[1]);
            perror("exec game");
            _exit(1);
        }
        logmsg("Launched game: PID %d", game_pid);
        sleep(5);
    }

    /* Three capture buffers: the small top-left gate zone and the centre
     * post-match zone, grabbed every poll, and the full monitor, grabbed only
     * when the MODES tab is up. */
    int zone_w, zone_h, post_x, post_y, post_w, post_h;
    gate_zone(g_cfg.mon_w, g_cfg.mon_h, &zone_w, &zone_h);
    post_zone(g_cfg.mon_w, g_cfg.mon_h, &post_x, &post_y, &post_w, &post_h);
    XCapture xz = {0}, xp = {0}, xc = {0};
    if (xcap_init(&xz, zone_w, zone_h) != 0 ||
        xcap_init(&xp, post_w, post_h) != 0 ||
        xcap_init(&xc, g_cfg.mon_w, g_cfg.mon_h) != 0) {
        logmsg("ERROR: X11 SHM init failed");
        xcap_cleanup(&xz);
        xcap_cleanup(&xp);
        return 1;
    }

    curl_global_init(CURL_GLOBAL_DEFAULT);

    char headers[64] = "";
    for (int i = 0, len = 0; i < N_HEADERS; i++)
        if (tmpl.headers[i].loaded)
            len += snprintf(headers + len, sizeof(headers) - len, "%s%s",
                            len ? ", " : "", tmpl.headers[i].name);
    logmsg("Tracker started: monitor=%dx%d+%d+%d templates=%s (headers: %s; post-match: %s)",
           g_cfg.mon_w, g_cfg.mon_h, g_cfg.mon_x, g_cfg.mon_y, tmpl_dir, headers,
           tmpl.post_ok ? "on" : "off");
    logmsg("Server: %s", g_cfg.server_url);

    g_ranked_anchor = fetch_ranked_anchor(&g_cfg);
    time_t anchor_at = time(NULL);
    if (g_ranked_anchor >= 0)
        logmsg("Ranked reads placed from %ld RS (last saved)", g_ranked_anchor);
    else
        logmsg("No ranked score saved this season: enter yours once in the app to track ranked");

    ModeState tracks[4] = {
        { "World Tour",              "world-tour", g_cfg.state_file_wt,   0, 0, -1,
          CONFIRM_READS, COOLDOWN_SECS },
        { "Ranked",                  "ranked",     g_cfg.state_file_rank, 0, 0, -1,
          CONFIRM_READS, COOLDOWN_SECS },
        { "World Tour (post-match)", "world-tour", g_cfg.state_file_wt,   0, 0, -1,
          POST_CONFIRM_READS, POST_REST_SECS },
        { "Ranked (post-match)",     "ranked",     g_cfg.state_file_rank, 0, 0, -1,
          POST_CONFIRM_READS, POST_REST_SECS },
    };

    while (!g_exiting) {
        if (game_pid > 0) {
            int status;
            if (waitpid(game_pid, &status, WNOHANG) != 0) {
                logmsg("Game process exited. Stopping tracker.");
                break;
            }
        }

        double t0 = now_ms();
        Reading r;

        /* Cheap check: grab only the gate zone. Most polls (in match, other
         * menus) stop here. */
        if (xcap_grab(&xz, g_cfg.mon_x, g_cfg.mon_y) != 0) {
            logq("Capture failed");
            sleep(POLL_SECS);
            continue;
        }
        Frame zf = {
            (const unsigned char *)xz.ximg->data, xz.width, xz.height,
            xz.ximg->bytes_per_line, xz.ximg->bits_per_pixel / 8, 2, 1, 0
        };
        double gate = check_gate(&zf, &tmpl, g_cfg.mon_h);

        if (gate < GATE_MIN) {
            /* Not the lobby: check the post-match panel's centre zone. */
            reading_init(&r);
            if (tmpl.post_ok &&
                xcap_grab(&xp, g_cfg.mon_x + post_x, g_cfg.mon_y + post_y) == 0) {
                Frame pf = {
                    (const unsigned char *)xp.ximg->data, xp.width, xp.height,
                    xp.ximg->bytes_per_line, xp.ximg->bits_per_pixel / 8, 2, 1, 0
                };
                read_post(&pf, &tmpl, g_cfg.mon_h, &r);
            }
            if (!r.post) {
                reading_init(&r);
                snprintf(r.verdict, sizeof(r.verdict),
                         "not on the MODES tab (tab match %.2f)", gate);
            }
            r.gate_score = gate;
        } else if (xcap_grab(&xc, g_cfg.mon_x, g_cfg.mon_y) != 0) {
            logq("Capture failed");
            sleep(POLL_SECS);
            continue;
        } else {
            Frame f = {
                (const unsigned char *)xc.ximg->data, xc.width, xc.height,
                xc.ximg->bytes_per_line, xc.ximg->bits_per_pixel / 8, 2, 1, 0
            };
            read_frame(&f, &tmpl, &r);
        }
        reading_finish(&tmpl, &r, g_ranked_anchor);
        double ms = now_ms() - t0;
        time_t now = time(NULL);

        /* A ranked read that couldn't be placed: maybe the saved score changed. */
        const char *rmode = reading_mode(&tmpl, &r);
        if (rmode && strcmp(rmode, "ranked") == 0 && r.total < 0 && r.value >= 0 &&
            now - anchor_at > ANCHOR_REFRESH_SECS) {
            anchor_at = now;
            long fresh = fetch_ranked_anchor(&g_cfg);
            if (fresh != g_ranked_anchor) {
                logmsg("Saved ranked score %ld -> %ld", g_ranked_anchor, fresh);
                g_ranked_anchor = fresh;
            }
        }

        const char *mode = reading_mode(&tmpl, &r);
        ModeState *m = NULL;
        if (mode && r.total >= 0)
            m = &tracks[(r.post ? 2 : 0) + (strcmp(mode, "ranked") == 0)];

        /* Anything not read this frame loses its streak. */
        for (int i = 0; i < 4; i++)
            if (&tracks[i] != m) { tracks[i].reads = 0; tracks[i].last_val = -1; }

        if (m)
            handle_read(&g_cfg, m, r.total, now, ms);
        else
            logq("%s | %.0fms", r.verdict, ms);

        /* Poll fast while the post-match panel is up: it lasts ~2s and the
         * value counts up for the first ~0.5s of it. */
        if (!g_exiting) {
            if (r.post) usleep(FAST_POLL_USEC);
            else        sleep(POLL_SECS);
        }
    }

    logmsg("Shutting down tracker.");
    templates_free(&tmpl);
    xcap_cleanup(&xz);
    xcap_cleanup(&xp);
    xcap_cleanup(&xc);
    curl_global_cleanup();

    if (game_pid > 0 && kill(game_pid, 0) == 0)
        waitpid(game_pid, NULL, 0);

    return 0;
}
