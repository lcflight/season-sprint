/*
 * Benchmark: C (XShm + Tesseract API) vs old pipeline (ffmpeg + tesseract subprocess)
 *
 * Build: gcc -O2 -o bench_c bench_c.c $(pkg-config --cflags --libs tesseract x11 xext)
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <sys/time.h>
#include <unistd.h>

#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/XShm.h>
#include <tesseract/capi.h>

static double now_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec * 1000.0 + tv.tv_usec / 1000.0;
}

int main(int argc, char **argv) {
    int rounds = 20;
    if (argc > 1) rounds = atoi(argv[1]);

    /* Gate region: top-left quarter, top tenth of a 2560x1440 screen */
    int gate_w = 640, gate_h = 144;
    int gate_x = 0, gate_y = 0;

    printf("Benchmark: XShm capture + Tesseract C API\n");
    printf("Gate region: %dx%d at +%d+%d, rounds: %d\n\n", gate_w, gate_h, gate_x, gate_y, rounds);

    /* ── Init X11 SHM ── */
    Display *dpy = XOpenDisplay(NULL);
    if (!dpy) { fprintf(stderr, "Cannot open display\n"); return 1; }

    int screen = DefaultScreen(dpy);
    XShmSegmentInfo shminfo;
    XImage *ximg = XShmCreateImage(dpy, DefaultVisual(dpy, screen),
                                   DefaultDepth(dpy, screen), ZPixmap,
                                   NULL, &shminfo, gate_w, gate_h);
    shminfo.shmid = shmget(IPC_PRIVATE, ximg->bytes_per_line * ximg->height, IPC_CREAT | 0600);
    shminfo.shmaddr = ximg->data = shmat(shminfo.shmid, 0, 0);
    shminfo.readOnly = False;
    XShmAttach(dpy, &shminfo);
    XSync(dpy, False);
    shmctl(shminfo.shmid, IPC_RMID, 0);

    /* ── Init Tesseract ── */
    TessBaseAPI *tess = TessBaseAPICreate();
    TessBaseAPISetVariable(tess, "debug_file", "/dev/null");
    TessBaseAPIInit3(tess, NULL, "eng");

    unsigned char *gray = malloc(gate_w * gate_h);

    /* Warm up */
    XShmGetImage(dpy, DefaultRootWindow(dpy), ximg, gate_x, gate_y, AllPlanes);

    /* ── Benchmark: Full gate cycle (capture + grayscale + threshold + Tesseract) ── */
    double times_cap[rounds], times_tess[rounds], times_total[rounds];
    char *last_text = NULL;

    for (int i = 0; i < rounds; i++) {
        double t0 = now_ms();

        /* Capture */
        XShmGetImage(dpy, DefaultRootWindow(dpy), ximg, gate_x, gate_y, AllPlanes);
        double t1 = now_ms();

        /* Grayscale + threshold */
        int bpp = ximg->bits_per_pixel / 8;
        for (int y = 0; y < gate_h; y++) {
            unsigned char *row = (unsigned char *)ximg->data + y * ximg->bytes_per_line;
            for (int x = 0; x < gate_w; x++) {
                int b = row[x*bpp+0], g_val = row[x*bpp+1], r = row[x*bpp+2];
                int gv = (r * 77 + g_val * 150 + b * 29) >> 8;
                gray[y * gate_w + x] = (gv > 180) ? 255 : 0;
            }
        }

        /* Tesseract */
        TessBaseAPISetPageSegMode(tess, PSM_SINGLE_LINE);
        TessBaseAPISetImage(tess, gray, gate_w, gate_h, 1, gate_w);
        char *text = TessBaseAPIGetUTF8Text(tess);

        double t2 = now_ms();

        times_cap[i]   = t1 - t0;
        times_tess[i]  = t2 - t1;
        times_total[i] = t2 - t0;

        if (last_text) TessDeleteText(last_text);
        last_text = text;
    }

    /* Stats */
    double sum_cap = 0, sum_tess = 0, sum_total = 0;
    double min_total = 1e9, max_total = 0;
    for (int i = 0; i < rounds; i++) {
        sum_cap   += times_cap[i];
        sum_tess  += times_tess[i];
        sum_total += times_total[i];
        if (times_total[i] < min_total) min_total = times_total[i];
        if (times_total[i] > max_total) max_total = times_total[i];
    }

    printf("C gate cycle (XShm + grayscale + threshold + Tesseract API):\n");
    printf("  capture:   avg=%.2fms\n", sum_cap / rounds);
    printf("  tess OCR:  avg=%.2fms\n", sum_tess / rounds);
    printf("  TOTAL:     avg=%.2fms  min=%.2fms  max=%.2fms\n",
           sum_total / rounds, min_total, max_total);
    if (last_text) {
        char *nl = strchr(last_text, '\n');
        if (nl) *nl = '\0';
        printf("  output:    \"%s\"\n", last_text);
    }

    printf("\nFor comparison (from earlier benchmarks):\n");
    printf("  Old pipeline (ffmpeg + tesseract subprocess):  ~620ms\n");
    printf("  Speedup: %.0fx\n\n", 620.0 / (sum_total / rounds));

    /* Cleanup */
    if (last_text) TessDeleteText(last_text);
    free(gray);
    TessBaseAPIEnd(tess);
    TessBaseAPIDelete(tess);
    XShmDetach(dpy, &shminfo);
    ximg->data = NULL;
    XDestroyImage(ximg);
    shmdt(shminfo.shmaddr);
    XCloseDisplay(dpy);

    return 0;
}
