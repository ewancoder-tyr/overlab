# Design

- **Black and yellow, dark by default, with a light scheme.** The app does not follow the system
  light/dark setting; the `color-scheme` preference decides (`ColorSchemes` in `shared/application`,
  fed from `app.config.ts`). Each scheme redefines the tokens in `src/styles.scss`; components paint
  only with tokens. In light, yellow is only ever a filled block with black on it: anything drawn
  _with_ the accent (text, lines, outlines) uses `--accent-ink`, which is yellow in dark and black
  in light, never `--accent`. Yellow (`--accent`) is for what you act on and for data marks; green
  and red are reserved for better and worse, purple (`--record-weight`) for weight records, and
  green also marks an exercise done today on the Train page; orange for warnings. Destructive
  buttons are solid red (`.button--danger`). All colours are tokens in `src/styles.scss`.
- **Type.** Barlow Condensed (bundled, works offline) for headings, labels and every number,
  with Roboto Condensed for Cyrillic letters; the system font for body text.
- **Gym-laboratory details, used sparingly:** specimen-style uppercase labels (`.eyebrow`),
  hazard-stripe dividers (`.hazard`), tube-shaped volume gauges, the dumbbell-shaped log button
  (three plates a side), the kettlebell around the rest clock as its alert nears.
- **Week gauges are buttons:** each opens, one at a time, to the muscle group's volume
  breakdown. A stalled muscle group has an orange dot before its name.
- **Navigation** is a bottom tab bar (Week, Train, Catalog, Data, Settings). Train lists the
  solo exercises first (see the standalone set rule in `docs/rules/training.md`), then a workout
  done on a whim, then each program as a card (due today first: the day that comes next, with
  the exercises started on top in the order started and chips to switch day), then the other
  favorites; the Catalog lists everything and is where exercises are starred.
  Tabs switch on finger-down (`SwitchOnTouchDirective`) and the bar has `touch-action: none`: a
  quick thumb tap that drifts was otherwise taken for a swipe and never became a click. **Back
  retraces your steps, at most one level up** (`app/back-navigation.ts`): among pages opened from a
  tab (logging, statistics, History, programs, What's new) to the page before, but a page visited again cuts
  the trail back to it (log, statistics, log is one step from Train); from the first page to the tab
  it was opened from; from any other tab to Week; from Week out of the app. On phones nothing is
  added to history (`ReplaceOnlyLocationStrategy` turns every push into a replace, see Known
  platform issues) and a `CloseWatcher`, held on every page but Week, catches back. Where
  `CloseWatcher` is missing, and on computers, the router keeps its usual history. The logging
  screen covers the whole viewport with three fixed zones: title bar, comparison, entry panel. The
  zones never move, and nothing moves when a set is logged; only what is under the rest clock
  scrolls, opening at the bottom, when it does not fit.
- **The comparison is last session against today's**, as two rows of rep tiles lined up set by set,
  under a one-line verdict (ahead, level, behind, beaten), a coloured headline only. What the next
  set needs is the dashed outline in today's row, not words. Older sessions are on the statistics
  page, not here.
- **Rest is the big number while logging:** large digits at the top left of the empty space above
  the comparison (always at the same height), tight under the title bar and with the comparison
  right under it. A yellow kettlebell appears around them 10 seconds before the rest alert, its
  handle reaching over the title bar's lower edge; at the alert it flashes like lightning. Workout
  time is a small pill in the title bar. Elsewhere (the Train page) both are small pills side by
  side.
- **Logging is one-thumb:** two steppers (weight, reps), prefilled with the set to match next,
  extras behind chips (partials, failure, light, easy, solo). The chips are one short word each and
  always share one row: they fit a 360px phone in both languages, and the row scrolls sideways on
  anything narrower. Do not add required fields or typing to the quick path.
- **Cardio is the exception: it is typed.** Three numeric-keypad fields (distance in metres,
  time, calories), any of which may stay empty, with last time's numbers as placeholders. Nobody
  steps up to 5230 metres.
- **Exercise drawings** are white line art on the dark surface, two positions per exercise, in a
  retro 1950s instruction-manual style (heavy ink, the same square-jawed lifter in combat boots), in
  `public/exercise-drawings` (CC BY-SA 4.0, not MIT; see the README there). Keep every drawing in
  that one style: draw new ones with `pnpm draw` (`scripts/draw-exercise.mjs`), which holds the
  prompt. The logging screen shows the exercise's second position as a faint backdrop in the top
  half of the screen, centred, fading out towards the middle. The rest clock keeps to its left.
- **Sets are rep tiles**, one line per load, coloured by technique. Today's are solid; history is
  dimmed (dark tile, coloured number).

## Known platform issues

- **Adding a history entry freezes the installed app under Samsung power saving** (seen on a
  Galaxy S25). After `history.pushState`, which every router does on navigation, the screen
  often stops updating (no new frames, no scrolling) until the next touch, although the page
  switched in milliseconds. `replaceState` never does, nor does the same page in a Chrome tab.
  Narrowed down with throwaway test pages: a plain page with `pushState` and no framework froze,
  the same page without it did not, and Angular and React Router both froze. Hence on phones the app
  never pushes (see Navigation above).
