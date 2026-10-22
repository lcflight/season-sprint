# Tracker templates

Template images the desktop trackers match against to read THE FINALS' score
screens: the lobby MODES tab and the post-match "WORLD TOUR SCORE" panel. Shared by both trackers: Linux ([`season-tracker.c`](../local-linux/season-tracker.c))
and Windows ([`screen_reader.py`](../local-win/screen_reader.py)). Both release
builds copy this folder in as `templates/`.

All files are binary PGMs cut from 2560x1440 screenshots. The trackers rescale
them by monitor height, since the game UI scales with vertical resolution.

| File | What it is | Source |
|------|------------|--------|
| `modes_tab.pgm` | Yellow mask of the highlighted MODES nav tab: the "on the right screen" gate | real screenshot |
| `header_world_tour.pgm` | White mask of "WORLD TOUR SCORE" | real screenshot |
| `header_placement.pgm` | White mask of "PLACEMENT ROUNDS" (recognised, never pushed) | real screenshot |
| `header_ranked.pgm` | **Not yet captured.** Ranked score header after placements | — |
| `digit_0..9.pgm` | 24x20 normalised digit glyphs (MODES, italic) | all real, averaged over every sample (yellow current values and white maxes) |
| `digit_8_yellow.pgm` | Variant 8 for the yellow current value; the white-derived `digit_8` sits too close to 0 for it | real |
| `post_header_world_tour.pgm` | White mask of the post-match "WORLD TOUR SCORE" (upright font) | real, from a match-end recording |
| `post_header_ranked.pgm` | **Not yet captured.** Post-match ranked header | — |
| `post_digit_0..9.pgm`, `post_digit_slash.pgm` | 24x20 glyphs of the post-match value ("5,736/8,000", upright white) | all real, averaged over the count-up frames of a recording |

## Adding / refreshing templates

Use full-monitor screenshots of the MODES tab (any 16:9 resolution, 1440p best):

```bash
# Ranked header, once placements are done (select Ranked Cashout first):
python make_templates.py header ranked shot.png

# Replace digit templates with real glyphs: pass the yellow value shown.
# Do this for a screen showing a 3 or 9 to retire the rendered ones.
python make_templates.py digits shot.png 3,914

# See what the tracker reads from a screenshot:
python make_templates.py check shot.png
```

`header` finds the yellow value at the bottom centre and crops the white text
line just above it. `digits` writes one template per digit in the value
(repeats are averaged). `--only 39` limits which digits are written, `--blend`
averages into the existing template instead of replacing it, and
`--variant NAME` writes `digit_<d>_<NAME>.pgm` beside the main one. A glyph
scores the best variant of each digit, so add a variant when one rendering of
a digit doesn't match the existing template well.

Check margins after any change: `python make_templates.py check shot.png` on
each screenshot you have, plus both trackers' cross-check (see the tracker
READMEs).

The ranked header needs no code change: both trackers load `header_ranked.pgm`
(and `post_header_ranked.pgm`) if present and post its value with
`mode: "ranked"`. The post-match templates were cut from a screen recording
with a one-off script, not `make_templates.py`; the post-match screen is
optional and switches off if its files are missing.
