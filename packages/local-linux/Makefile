CC      = gcc
CFLAGS  = -O2 -Wall $(shell pkg-config --cflags tesseract libcurl x11 xext)
LDFLAGS = $(shell pkg-config --libs tesseract libcurl x11 xext)

season-tracker: season-tracker.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

# Companion watcher — committed for local use, NOT part of the Linux release
# (not shipped by package-linux.sh, not built/launched by season-tracker.sh).
# Build explicitly with `make season-watcher`. Needs libm for the days math.
season-watcher: season-watcher.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS) -lm

clean:
	rm -f season-tracker season-watcher

.PHONY: clean
