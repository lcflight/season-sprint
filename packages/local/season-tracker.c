/*
 * season-tracker — Fast World Tour Points tracker using X11 SHM + Tesseract C API.
 *
 * Replaces ffmpeg screen capture (~545ms) with XShmGetImage (~0.2ms) and
 * Tesseract subprocess (~80ms) with in-process C API (~5ms).
 * Still uses the Python EasyOCR daemon for accurate points reading.
 *
 * Build:
 *   gcc -O2 -o season-tracker season-tracker.c \
 *       $(pkg-config --cflags --libs tesseract libcurl x11 xext)
 *
 * Usage:
 *   ./season-tracker                   # run tracker (reads .env)
 *   ./season-tracker game_cmd args...  # launch game, then track
 */

#define _GNU_SOURCE
#include <ctype.h>
#include <errno.h>
#include <limits.h>
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
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/XShm.h>

#include <tesseract/capi.h>
#include <curl/curl.h>

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define MAX_LOG_LINES    500
#define LOG_PRUNE_EVERY  50
#define MAX_WTP          2400
#define SENTINEL         "---END---"
#define RESP_BUF_SIZE    4096

/* ── Globals ───────────────────────────────────────────────────────────────── */

static volatile sig_atomic_t g_exiting = 0;

typedef struct {
    char server_url[512];
    char auth_token[256];
    int  mon_w, mon_h, mon_x, mon_y;
    /* Derived regions */
    int  gate_x, gate_y, gate_w, gate_h;
    int  pts_x,  pts_y,  pts_w,  pts_h;
    /* Paths */
    char script_dir[PATH_MAX];
    char env_file[PATH_MAX];
    char state_file[PATH_MAX];
    char log_file[PATH_MAX];
    char ocr_script[PATH_MAX];
} Config;

static Config g_cfg;
static int    g_log_count = 0;

/* ── Timing ────────────────────────────────────────────────────────────────── */

static double now_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec * 1000.0 + tv.tv_usec / 1000.0;
}

/* ── Logging ───────────────────────────────────────────────────────────────── */

static void prune_log(void) {
    FILE *f = fopen(g_cfg.log_file, "r");
    if (!f) return;

    /* Count lines */
    int count = 0;
    int ch;
    while ((ch = fgetc(f)) != EOF)
        if (ch == '\n') count++;

    if (count <= MAX_LOG_LINES) { fclose(f); return; }

    /* Read all content */
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *buf = malloc(sz + 1);
    if (!buf) { fclose(f); return; }
    fread(buf, 1, sz, f);
    buf[sz] = '\0';
    fclose(f);

    /* Find start of last MAX_LOG_LINES lines */
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
    /* Determine script_dir from /proc/self/exe */
    ssize_t len = readlink("/proc/self/exe", cfg->script_dir, PATH_MAX - 1);
    if (len <= 0) {
        /* Fallback: use cwd */
        if (!getcwd(cfg->script_dir, PATH_MAX)) return -1;
    } else {
        cfg->script_dir[len] = '\0';
        char *slash = strrchr(cfg->script_dir, '/');
        if (slash) *slash = '\0';
    }

    snprintf(cfg->env_file,   PATH_MAX, "%s/.env",       cfg->script_dir);
    snprintf(cfg->state_file, PATH_MAX, "%s/.last-wtp",  cfg->script_dir);
    snprintf(cfg->log_file,   PATH_MAX, "%s/tracker.log", cfg->script_dir);
    snprintf(cfg->ocr_script, PATH_MAX, "%s/ocr_preprocess.py", cfg->script_dir);

    FILE *f = fopen(cfg->env_file, "r");
    if (!f) return -1;

    char line[1024];
    char geometry[128] = {0};

    while (fgets(line, sizeof(line), f)) {
        /* Strip newline */
        char *nl = strchr(line, '\n');
        if (nl) *nl = '\0';
        /* Skip comments/empty */
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
        /* Try WxH without offsets */
        if (sscanf(geometry, "%dx%d", &cfg->mon_w, &cfg->mon_h) != 2)
            return -1;
        cfg->mon_x = cfg->mon_y = 0;
    }

    /* Gate region: top-left quarter width, top tenth height */
    cfg->gate_w = cfg->mon_w / 4;
    cfg->gate_h = cfg->mon_h / 10;
    cfg->gate_x = cfg->mon_x;
    cfg->gate_y = cfg->mon_y;

    /* Points region: bottom-center middle third width, bottom fifth height */
    cfg->pts_w = cfg->mon_w / 3;
    cfg->pts_h = cfg->mon_h / 5;
    cfg->pts_x = cfg->mon_x + (cfg->mon_w - cfg->pts_w) / 2;
    cfg->pts_y = cfg->mon_y + (cfg->mon_h - cfg->pts_h);

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

    /* Check for XShm extension */
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
    /* Prevent XDestroyImage from free()ing the shm pointer —
     * shmdt handles that. */
    xc->ximg->data = NULL;
    XDestroyImage(xc->ximg);
    shmdt(xc->shminfo.shmaddr);
    XCloseDisplay(xc->dpy);
    xc->dpy = NULL;
}

/* ── Image processing ──────────────────────────────────────────────────────── */

/* Extract a grayscale + thresholded sub-region from XImage.
 * The XImage must cover the full area starting at src_x,src_y
 * (i.e., it was grabbed with those offsets). We extract a sub-rect
 * at (rx - src_x, ry - src_y) of size rw x rh.
 * Output: rw*rh bytes, 0 or 255. */
static void extract_gate_region(XImage *ximg, int src_x, int src_y,
                                int rx, int ry, int rw, int rh,
                                unsigned char *out, int threshold)
{
    int bpp = ximg->bits_per_pixel / 8;
    int ox = rx - src_x;
    int oy = ry - src_y;

    for (int y = 0; y < rh; y++) {
        unsigned char *row = (unsigned char *)ximg->data
            + (oy + y) * ximg->bytes_per_line
            + ox * bpp;
        for (int x = 0; x < rw; x++) {
            /* BGRA layout (typical X11 32-bit) */
            int b = row[x * bpp + 0];
            int g = row[x * bpp + 1];
            int r = row[x * bpp + 2];
            int gray = (r * 77 + g * 150 + b * 29) >> 8;
            out[y * rw + x] = (gray > threshold) ? 255 : 0;
        }
    }
}

/* Write a sub-region of XImage as a 24-bit BMP file.
 * Region is at (rx - src_x, ry - src_y) of size rw x rh. */
static int write_region_bmp(const char *path, XImage *ximg,
                            int src_x, int src_y,
                            int rx, int ry, int rw, int rh)
{
    FILE *f = fopen(path, "wb");
    if (!f) return -1;

    int bpp_in = ximg->bits_per_pixel / 8;
    int ox = rx - src_x;
    int oy = ry - src_y;

    int row_bytes = rw * 3;
    int pad = (4 - (row_bytes % 4)) % 4;
    int stride = row_bytes + pad;
    int img_size = stride * rh;
    int file_size = 54 + img_size;

    /* BMP file header (14 bytes) */
    unsigned char hdr[54] = {0};
    hdr[0] = 'B'; hdr[1] = 'M';
    hdr[2]  = file_size;        hdr[3]  = file_size >> 8;
    hdr[4]  = file_size >> 16;  hdr[5]  = file_size >> 24;
    hdr[10] = 54; /* pixel offset */

    /* DIB header (40 bytes) */
    hdr[14] = 40; /* header size */
    hdr[18] = rw;        hdr[19] = rw >> 8;
    hdr[20] = rw >> 16;  hdr[21] = rw >> 24;
    hdr[22] = rh;        hdr[23] = rh >> 8;
    hdr[24] = rh >> 16;  hdr[25] = rh >> 24;
    hdr[26] = 1;  /* planes */
    hdr[28] = 24; /* bpp */
    hdr[34] = img_size;       hdr[35] = img_size >> 8;
    hdr[36] = img_size >> 16; hdr[37] = img_size >> 24;

    fwrite(hdr, 1, 54, f);

    /* Pixel data: bottom-up row order */
    unsigned char padding[3] = {0};
    for (int y = rh - 1; y >= 0; y--) {
        unsigned char *row = (unsigned char *)ximg->data
            + (oy + y) * ximg->bytes_per_line
            + ox * bpp_in;
        for (int x = 0; x < rw; x++) {
            /* XImage is BGRA, BMP is BGR */
            unsigned char pixel[3];
            pixel[0] = row[x * bpp_in + 0]; /* B */
            pixel[1] = row[x * bpp_in + 1]; /* G */
            pixel[2] = row[x * bpp_in + 2]; /* R */
            fwrite(pixel, 1, 3, f);
        }
        if (pad) fwrite(padding, 1, pad, f);
    }

    fclose(f);
    return 0;
}

/* ── Tesseract gate ────────────────────────────────────────────────────────── */

static int tess_gate_check(TessBaseAPI *api, unsigned char *gray, int w, int h) {
    TessBaseAPISetPageSegMode(api, PSM_SINGLE_LINE);
    TessBaseAPISetImage(api, gray, w, h, 1, w);
    char *text = TessBaseAPIGetUTF8Text(api);
    if (!text) return 0;

    /* Case-insensitive search for "WORLD TOUR" */
    int found = 0;
    for (char *p = text; *p; p++) {
        if (strncasecmp(p, "WORLD TOUR", 10) == 0) { found = 1; break; }
    }
    TessDeleteText(text);
    return found;
}

/* ── OCR Daemon (Python EasyOCR) ───────────────────────────────────────────── */

typedef struct {
    pid_t pid;
    int   in_fd;   /* write image paths to daemon */
    int   out_fd;  /* read OCR results from daemon */
} OcrDaemon;

static int daemon_start(OcrDaemon *d, const Config *cfg) {
    char fifo_in[PATH_MAX], fifo_out[PATH_MAX];
    snprintf(fifo_in,  PATH_MAX, "/tmp/st-ocr-in-%d",  getpid());
    snprintf(fifo_out, PATH_MAX, "/tmp/st-ocr-out-%d", getpid());

    unlink(fifo_in); unlink(fifo_out);
    if (mkfifo(fifo_in, 0600) || mkfifo(fifo_out, 0600)) {
        perror("mkfifo");
        return -1;
    }

    pid_t pid = fork();
    if (pid < 0) { perror("fork"); return -1; }

    if (pid == 0) {
        /* Child: redirect stdin/stdout to FIFOs */
        int fd_in  = open(fifo_in, O_RDONLY);
        int fd_out = open(fifo_out, O_WRONLY);
        if (fd_in < 0 || fd_out < 0) _exit(1);
        dup2(fd_in, STDIN_FILENO);
        dup2(fd_out, STDOUT_FILENO);
        close(fd_in); close(fd_out);

        /* Redirect stderr to log file */
        char err_file[PATH_MAX];
        snprintf(err_file, PATH_MAX, "%s.ocr_err", cfg->log_file);
        FILE *ef = fopen(err_file, "w");
        if (ef) { dup2(fileno(ef), STDERR_FILENO); fclose(ef); }

        execlp("python3", "python3", cfg->ocr_script, "--daemon", NULL);
        _exit(1);
    }

    /* Parent: open FIFOs (must open write-end first to avoid blocking) */
    d->pid = pid;
    d->in_fd  = open(fifo_in, O_WRONLY);
    d->out_fd = open(fifo_out, O_RDONLY);
    unlink(fifo_in);
    unlink(fifo_out);

    if (d->in_fd < 0 || d->out_fd < 0) {
        fprintf(stderr, "Failed to open daemon FIFOs\n");
        kill(pid, SIGTERM);
        return -1;
    }

    /* Read READY signal — use raw read() to avoid buffered I/O
     * consuming bytes meant for later daemon_query calls */
    char ready[64];
    int rpos = 0;
    while (rpos < (int)sizeof(ready) - 1) {
        ssize_t n = read(d->out_fd, &ready[rpos], 1);
        if (n <= 0) {
            fprintf(stderr, "Daemon did not send READY\n");
            kill(pid, SIGTERM);
            return -1;
        }
        if (ready[rpos] == '\n') break;
        rpos++;
    }
    ready[rpos] = '\0';

    if (strcmp(ready, "READY") != 0) {
        fprintf(stderr, "Daemon sent unexpected: %s\n", ready);
        kill(pid, SIGTERM);
        return -1;
    }

    return 0;
}

static int daemon_query(OcrDaemon *d, const char *msg,
                        char *response, size_t maxlen)
{
    /* Send message */
    dprintf(d->in_fd, "%s\n", msg);

    /* Read response lines until sentinel */
    size_t pos = 0;
    response[0] = '\0';

    /* We need line-buffered reading from a raw fd */
    char ch;
    char line[1024];
    int line_pos = 0;

    while (pos < maxlen - 1) {
        ssize_t n = read(d->out_fd, &ch, 1);
        if (n <= 0) return -1;

        if (ch == '\n') {
            line[line_pos] = '\0';
            if (strcmp(line, SENTINEL) == 0)
                break;

            /* Append line to response */
            if (pos > 0 && pos < maxlen - 1)
                response[pos++] = '\n';
            size_t ll = strlen(line);
            if (pos + ll >= maxlen) ll = maxlen - 1 - pos;
            memcpy(response + pos, line, ll);
            pos += ll;
            response[pos] = '\0';

            line_pos = 0;
        } else {
            if (line_pos < (int)sizeof(line) - 1)
                line[line_pos++] = ch;
        }
    }

    return 0;
}

static void daemon_stop(OcrDaemon *d) {
    if (d->in_fd >= 0)  close(d->in_fd);
    if (d->out_fd >= 0) close(d->out_fd);
    if (d->pid > 0) {
        kill(d->pid, SIGTERM);
        waitpid(d->pid, NULL, 0);
    }
}

/* ── WTP Parser ────────────────────────────────────────────────────────────── */

/* Case-insensitive strstr */
static char *strcasestr_local(const char *haystack, const char *needle) {
    size_t nlen = strlen(needle);
    for (; *haystack; haystack++) {
        if (strncasecmp(haystack, needle, nlen) == 0)
            return (char *)haystack;
    }
    return NULL;
}

/* Parse World Tour Points from OCR text. Returns value or -1 if not found. */
static int parse_wtp(const char *text) {
    char buf[RESP_BUF_SIZE];
    strncpy(buf, text, sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = '\0';

    int found_header = 0;
    int first_num = -1;

    char *saveptr;
    char *line = strtok_r(buf, "\n", &saveptr);

    while (line) {
        /* Trim whitespace */
        while (*line && isspace(*line)) line++;
        char *end = line + strlen(line) - 1;
        while (end > line && isspace(*end)) { *end = '\0'; end--; }

        if (found_header) {
            /* Try "current / max" pattern */
            int cur, max;
            if (sscanf(line, "%d / %d", &cur, &max) == 2 ||
                sscanf(line, "%d/ %d", &cur, &max) == 2 ||
                sscanf(line, "%d /%d", &cur, &max) == 2 ||
                sscanf(line, "%d/%d", &cur, &max) == 2) {
                if (cur >= 0 && cur <= MAX_WTP && max >= 0 && max <= MAX_WTP) {
                    return cur;
                }
            }

            /* Try standalone number */
            /* Strip commas and underscores */
            char cleaned[64];
            int ci = 0;
            for (char *p = line; *p && ci < 62; p++) {
                if (*p != ',' && *p != '_')
                    cleaned[ci++] = *p;
            }
            cleaned[ci] = '\0';

            char *endp;
            long val = strtol(cleaned, &endp, 10);
            if (endp != cleaned && *endp == '\0' && val >= 0 && val <= MAX_WTP) {
                if (first_num < 0) {
                    first_num = (int)val;
                } else {
                    if (first_num <= (int)val)
                        return first_num;
                    first_num = (int)val;
                }
                line = strtok_r(NULL, "\n", &saveptr);
                continue;
            }

            /* Non-numeric line after header — reset */
            if (strlen(line) > 0) {
                found_header = 0;
                first_num = -1;
            }
            line = strtok_r(NULL, "\n", &saveptr);
            continue;
        }

        /* Check for header */
        if (strcasestr_local(line, "TOUR POINTS") ||
            strcasestr_local(line, "TOUR POINT")) {
            /* Try "current / max" on same line */
            char *p = line;
            int cur, max;
            while (*p) {
                if (isdigit(*p)) {
                    if (sscanf(p, "%d / %d", &cur, &max) == 2 ||
                        sscanf(p, "%d/%d", &cur, &max) == 2) {
                        if (cur >= 0 && cur <= MAX_WTP && max >= 0 && max <= MAX_WTP)
                            return cur;
                    }
                    break;
                }
                p++;
            }
            found_header = 1;
            first_num = -1;
        }

        line = strtok_r(NULL, "\n", &saveptr);
    }

    return -1;
}

/* ── HTTP API ──────────────────────────────────────────────────────────────── */

static size_t curl_discard(void *ptr, size_t size, size_t nmemb, void *ud) {
    (void)ptr; (void)ud;
    return size * nmemb;
}

static int push_record(const Config *cfg, int win_points) {
    time_t now = time(NULL);
    struct tm tm;
    localtime_r(&now, &tm);
    char date[16];
    strftime(date, sizeof(date), "%Y-%m-%d", &tm);

    char body[256];
    snprintf(body, sizeof(body),
             "{\"date\":\"%s\",\"winPoints\":%d}", date, win_points);

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
        logmsg("Pushed winPoints=%d for %s (HTTP %ld)", win_points, date, http_code);
        return 0;
    }

    logmsg("ERROR: Push failed (HTTP %ld)", http_code);
    return -1;
}

/* ── State file ────────────────────────────────────────────────────────────── */

static int read_state(const Config *cfg) {
    FILE *f = fopen(cfg->state_file, "r");
    if (!f) return -1;
    int val = -1;
    fscanf(f, "%d", &val);
    fclose(f);
    return val;
}

static void write_state(const Config *cfg, int val) {
    FILE *f = fopen(cfg->state_file, "w");
    if (f) { fprintf(f, "%d\n", val); fclose(f); }
}

/* ── Signal handler ────────────────────────────────────────────────────────── */

static void sig_handler(int sig) {
    (void)sig;
    g_exiting = 1;
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

int main(int argc, char **argv) {
    /* Load config */
    if (load_env(&g_cfg) != 0) {
        fprintf(stderr, "ERROR: Failed to load .env (run season-tracker.sh for setup)\n");
        return 1;
    }

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

    /* Init X11 capture — size covers both gate and points regions */
    int cap_x = g_cfg.mon_x;
    int cap_y = g_cfg.mon_y;
    int cap_w = g_cfg.mon_w;
    int cap_h = g_cfg.mon_h;

    XCapture xc = {0};
    if (xcap_init(&xc, cap_w, cap_h) != 0) {
        logmsg("ERROR: X11 SHM init failed");
        return 1;
    }

    /* Init Tesseract — suppress debug output */
    TessBaseAPI *tess = TessBaseAPICreate();
    TessBaseAPISetVariable(tess, "debug_file", "/dev/null");
    if (TessBaseAPIInit3(tess, NULL, "eng") != 0) {
        logmsg("ERROR: Tesseract init failed");
        xcap_cleanup(&xc);
        return 1;
    }

    /* Init curl */
    curl_global_init(CURL_GLOBAL_DEFAULT);

    /* Start EasyOCR daemon */
    logmsg("Starting OCR daemon (loading model)...");
    OcrDaemon daemon = { .pid = 0, .in_fd = -1, .out_fd = -1 };
    if (daemon_start(&daemon, &g_cfg) != 0) {
        logmsg("ERROR: OCR daemon failed to start");
        TessBaseAPIEnd(tess); TessBaseAPIDelete(tess);
        xcap_cleanup(&xc);
        curl_global_cleanup();
        return 1;
    }
    logmsg("OCR daemon ready (PID %d)", daemon.pid);

    /* Allocate gate buffer */
    int gate_pixels = g_cfg.gate_w * g_cfg.gate_h;
    unsigned char *gate_buf = malloc(gate_pixels);
    if (!gate_buf) {
        logmsg("ERROR: malloc");
        daemon_stop(&daemon);
        TessBaseAPIEnd(tess); TessBaseAPIDelete(tess);
        xcap_cleanup(&xc);
        curl_global_cleanup();
        return 1;
    }

    char tmp_bmp[PATH_MAX];
    snprintf(tmp_bmp, PATH_MAX, "/tmp/st-pts-%d.bmp", getpid());

    logmsg("Tracker started: gate=%dx%d+%d+%d capture=%dx%d+%d+%d",
           g_cfg.gate_w, g_cfg.gate_h, g_cfg.gate_x, g_cfg.gate_y,
           g_cfg.pts_w,  g_cfg.pts_h,  g_cfg.pts_x,  g_cfg.pts_y);
    logmsg("Server: %s", g_cfg.server_url);

    int wt_read_count   = 0;  /* consecutive successful WT reads */
    int sleep_interval  = 1;
    int cycle_count     = 0;
    #define GATE_INTERVAL   1    /* seconds between gate checks */
    #define COOLDOWN_SECS   300  /* 5 min cooldown after confirmed read */

    while (!g_exiting) {
        /* Check if game exited */
        if (game_pid > 0) {
            int status;
            if (waitpid(game_pid, &status, WNOHANG) != 0) {
                logmsg("Game process exited. Stopping tracker.");
                break;
            }
        }

        cycle_count++;
        double t_start = now_ms();

        /* ── Stage 1: XShm capture + Tesseract gate ── */
        if (xcap_grab(&xc, cap_x, cap_y) != 0) {
            logq("Capture failed");
            sleep(sleep_interval);
            continue;
        }

        double t_cap = now_ms();

        extract_gate_region(xc.ximg, cap_x, cap_y,
                            g_cfg.gate_x, g_cfg.gate_y,
                            g_cfg.gate_w, g_cfg.gate_h,
                            gate_buf, 180);

        int gate_pass = tess_gate_check(tess, gate_buf,
                                        g_cfg.gate_w, g_cfg.gate_h);
        double t_gate = now_ms();
        double ms_gate = t_gate - t_start;

        if (!gate_pass) {
            logq("Gate: not World Tour screen | %.0fms (cap=%.1fms tess=%.1fms)",
                 ms_gate, t_cap - t_start, t_gate - t_cap);
            wt_read_count = 0;
            sleep_interval = GATE_INTERVAL;
            sleep(sleep_interval);
            continue;
        }

        /* ── Stage 2: Write points BMP, send to EasyOCR daemon ── */
        write_region_bmp(tmp_bmp, xc.ximg, cap_x, cap_y,
                         g_cfg.pts_x, g_cfg.pts_y,
                         g_cfg.pts_w, g_cfg.pts_h);

        double t_bmp = now_ms();

        char response[RESP_BUF_SIZE] = {0};
        daemon_query(&daemon, tmp_bmp, response, sizeof(response));
        unlink(tmp_bmp);

        double t_ocr = now_ms();
        double ms_total = t_ocr - t_start;
        double ms_ocr   = t_ocr - t_bmp;

        int wtp = parse_wtp(response);

        if (wtp >= 0) {
            int last = read_state(&g_cfg);

            if (wtp != last) {
                logmsg("World Tour Points changed: %d -> %d", last, wtp);
                if (push_record(&g_cfg, wtp) == 0)
                    write_state(&g_cfg, wtp);
            }

            wt_read_count++;
            logq("OCR ok | wtp=%d (read #%d) | gate=%.0fms ocr=%.0fms total=%.0fms",
                 wtp, wt_read_count, ms_gate, ms_ocr, ms_total);

            if (wt_read_count >= 2) {
                /* Confirmed read — cooldown for 5 minutes */
                logmsg("World Tour Points confirmed: %d. Sleeping %ds.",
                       wtp, COOLDOWN_SECS);
                wt_read_count = 0;
                if (!g_exiting) sleep(COOLDOWN_SECS);
                continue;
            }
        } else {
            char oneline[120];
            strncpy(oneline, response, 119);
            oneline[119] = '\0';
            for (char *p = oneline; *p; p++)
                if (*p == '\n') *p = ' ';
            logq("OCR ok | no WTP | raw=\"%s\" | gate=%.0fms ocr=%.0fms total=%.0fms",
                 oneline, ms_gate, ms_ocr, ms_total);
        }

        if (!g_exiting)
            sleep(GATE_INTERVAL);
    }

    /* Cleanup */
    logmsg("Shutting down tracker.");
    free(gate_buf);
    unlink(tmp_bmp);
    daemon_stop(&daemon);
    TessBaseAPIEnd(tess);
    TessBaseAPIDelete(tess);
    xcap_cleanup(&xc);
    curl_global_cleanup();

    if (game_pid > 0 && kill(game_pid, 0) == 0)
        waitpid(game_pid, NULL, 0);

    return 0;
}
