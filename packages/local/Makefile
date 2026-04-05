CC      = gcc
CFLAGS  = -O2 -Wall $(shell pkg-config --cflags tesseract libcurl x11 xext)
LDFLAGS = $(shell pkg-config --libs tesseract libcurl x11 xext)

season-tracker: season-tracker.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	rm -f season-tracker

.PHONY: clean
