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
| `digit_0..9.pgm` | 24x20 normalised digit glyphs (MODES, italic) | 0,1,2,4,5,6,7,8 real (averaged over every sample); **3 and 9 rendered** from Saira Extra Condensed Medium, sheared to match the game's italic |
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
line just above it. `digits` overwrites one template per digit in the value. A
single sample is fine, though averaging several (as the committed ones are)
gives a little more margin between look-alikes such as 0/8.

The ranked header needs no code change: both trackers load `header_ranked.pgm`
(and `post_header_ranked.pgm`) if present and post its value with
`mode: "ranked"`. The post-match templates were cut from a screen recording
with a one-off script, not `make_templates.py`; the post-match screen is
optional and switches off if its files are missing.
