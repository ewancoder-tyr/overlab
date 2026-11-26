# Exercise drawings

Two SVG files per built-in exercise, `<exercise id>-1.svg` and `<exercise id>-2.svg`: the two end
positions of the movement. `ExerciseFigureComponent` finds them by this naming convention.

## Licence

The drawings in this folder are **not** covered by the project's MIT licence. They are licensed
under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

They are drawn in one style: a retro 1950s instruction-manual look, heavy ink outlines and the
same square-jawed lifter in shorts and combat boots throughout. Every drawing was generated with
an AI image model and traced to SVG.

They are derived from the earlier drawings of this app, which they replaced in November 2026: each
generation was given the earlier pair of positions as its pose reference. Most of those came from
the [Everkinetic open data project](https://github.com/everkinetic/data), based on
everkinetic.com, created by Greg Priday, which is why the set stays under CC BY-SA 4.0. The rest
(the eight cardio exercises and nine exercises Everkinetic lacks) were themselves AI-generated in
the Everkinetic style. `dead-hang` shows the same hanging position twice, because a hold has only
one position.

## Adding a drawing

Run `pnpm draw <exercise id> "<position 1>" "<position 2>"` (`scripts/draw-exercise.mjs`). It
holds the exact prompt that made this set and does every step below. Look at both drawings
before keeping them, and run it again for a pair that came out wrong.

By hand: generate the two positions with an AI image model, attaching an existing drawing
(rendered black on white) as the style reference. Ask for pure black ink on pure white, no grey
or shading, no text, no frame, no background, a square image with a margin. Then trace each
picture, which keeps the files small enough for the service worker to prefetch:

```sh
magick in.png -colorspace gray -resize 70% -threshold 50% -trim +repage -bordercolor white -border 6 in.pbm
potrace --svg -t 6 -O 1 -u 2 --flat -C '#f6f5ef' in.pbm -o <exercise id>-1.svg
```

Light lines (`#f6f5ef`) on a transparent background, no text, any proportions: the component fits
each drawing into a square box.
