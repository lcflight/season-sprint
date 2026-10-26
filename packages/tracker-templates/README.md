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
| `header_ranked.pgm` | White mask of "RANK SCORE" (ranked, after placements) | real screenshot (Season 12, Gold 2) |
| `badge_tier_1..4.pgm` | 24x20 glyphs of the tier number at the bottom of the ranked badges | `1` and `2` real; **`3` and `4` not yet captured** |
| `digit_0..9.pgm` | 24x20 normalised digit glyphs (MODES, italic) | all real, averaged over every sample (yellow current values and white maxes) |
| `digit_8_yellow.pgm` | Variant 8 for the yellow current value; the white-derived `digit_8` sits too close to 0 for it | real |
| `post_header_world_tour.pgm` | White mask of the post-match "WORLD TOUR SCORE" (upright font) | real, from a match-end recording |
| `post_header_ranked.pgm` | **Not yet captured.** Post-match ranked header | — |
| `post_digit_0..9.pgm`, `post_digit_slash.pgm` | 24x20 glyphs of the post-match value ("5,736/8,000", upright white) | all real, averaged over the count-up frames of a recording |

## Adding / refreshing templates

Use full-monitor screenshots of the MODES tab (any 16:9 resolution, 1440p best):

```bash
# Ranked header (select Ranked Cashout first). Already captured:
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

## Ranked

Ranked's MODES panel shows "189 / 2,499": rank score earned in the current
tier, not the season total. Leagues (Bronze 0, Silver 10,000 … Diamond
40,000+) span 10,000 RS in four 2,500 RS tiers, Tier 4 lowest. To get the
total, the readers:

1. read the tier number on both badges beside the panel (left = current,
   right = next). They must agree: right is one tier up, or Tier 4 after a
   Tier 1;
2. place the read in the league nearest the last saved ranked score from
   this season, which the trackers fetch from the server;
3. refuse a result more than 2,000 RS from that saved score (1,000 if the
   tier couldn't be read), rather than guess.

So ranked tracking needs one ranked score entered in the app each season.

Tier numbers use their own font. Cut missing ones from a ranked MODES
screenshot by passing the current (left) tier, which writes both badges:

```bash
python make_templates.py tier shot.png 4     # writes badge_tier_4 and badge_tier_3
python make_templates.py tier shot.png 1     # writes badge_tier_1 and badge_tier_4
python make_templates.py check shot.png --anchor 25000
```

Until `3` and `4` exist, only Tier 2 screens (badges 2 → 1) have a known
tier. The other tiers still read, but under the smaller 1,000 RS limit. The post-match templates were cut from a screen recording
with a one-off script, not `make_templates.py`; the post-match screen is
optional and switches off if its files are missing.
