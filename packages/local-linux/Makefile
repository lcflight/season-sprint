CC      = gcc
CFLAGS  = -O2 -Wall

# The tracker reads the screen by template matching — no OCR libraries.
TRACKER_PKGS = libcurl x11 xext
# The local-only watcher still OCRs the season banner with Tesseract.
WATCHER_PKGS = tesseract libcurl x11 xext

season-tracker: season-tracker.c
	$(CC) $(CFLAGS) $(shell pkg-config --cflags $(TRACKER_PKGS)) -o $@ $< \
		$(shell pkg-config --libs $(TRACKER_PKGS)) -lm

# Companion watcher — committed for local use, NOT part of the Linux release
# (not shipped by package-linux.sh, not built/launched by season-tracker.sh).
# Build explicitly with `make season-watcher`. Needs libm for the days math.
season-watcher: season-watcher.c
	$(CC) $(CFLAGS) $(shell pkg-config --cflags $(WATCHER_PKGS)) -o $@ $< \
		$(shell pkg-config --libs $(WATCHER_PKGS)) -lm

clean:
	rm -f season-tracker season-watcher

.PHONY: clean
