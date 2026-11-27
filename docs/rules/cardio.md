# Cardio

The app is about lifting; cardio is a guest in it. Cardio exercises are ordinary catalog entries
with no involvements, so the Week page never sees them, and they take part in workouts, programs,
favorites and reminders like any other exercise. What differs is how they are logged and judged.

- **What a cardio exercise records is its cardio kind** (`cardioKindOf`, an optional `cardioKind`
  on `Exercise`): see the treadmill rule and the timed exercise rule. Ask that function, never
  the exercise's id.
- **`isCardio()` (`catalog/domain/exercise.ts`) is the one seam.** Code that needs to know asks
  that function, never `involvements.length` in its own way. If cardio later needs an explicit
  field on `Exercise`, only that function and the catalog table change.
- **Its own event.** A bout is a `CardioPerformed`, not a stretched `SetPerformed`: reps, load and
  technique describe lifting. `performSet` refuses a cardio exercise and `performCardio` refuses
  any other.
- **Distance is stored as entered** (`value` and `unit`), like a load. Only metres exist today; an
  imperial unit is one more literal in `DistanceUnit` and one more factor in `toMeters`.
- **The logging screen is the same screen with other zones** (`CardioLogComponent`): four numbers
  for last time and today (distance, time, speed, calories), and an entry panel with typed fields.
- **The statistics page charts distance, speed and time** as three small line charts over the
  last 12 sessions (`CardioProgressComponent`), one per measure because their scales are
  unrelated. A measure never recorded gets no chart; a session without it leaves a gap.
- **Reminders ask cardio to match last time**, not to beat it: the hype's `last` and `target`
  are the same words, an amount with its time (`5 km in 30:00`, `200 kcal in 20:00`) or one
  alone (`25:00`). Its own wordings quote only `{last}`, never `{target}`.

For one day (12 November 2026, version 0.3.0 and the test deployments after it) cardio was logged
as sets, with reps standing for minutes or tenths of a distance. Those `SetPerformed` events are
still valid and still in people's logs. They count for no muscle group and are not shown on the
cardio screens; nothing converts them, because their reps have no unit.

**The Week page shows cardio as its own card, never as a muscle gauge** (see the weekly cardio
rule): time only, summed across exercises, against the cardio goal.

## Cardio progression rule

A cardio session is all the bouts of one exercise in one workout, added up. A measure counts for
the session only when every bout recorded it. Two sessions are compared on what **both** recorded:

1. Distance and time: on **distance and speed**, and on **climb** too when both sessions have
   one (treadmill sessions, see the treadmill rule).
2. Distance only: on distance.
3. Time and calories, no distance (a stair climber): on calories and on calories per minute.
4. Time only: longer is better.
5. Calories only: more is better.

- **With several axes, better means at least as good on all and better on one.** After 5 km in
  30:00, 5.5 km in 33:00 (farther, same speed) and 5 km in 28:00 (same distance, faster) are both
  better.
- **Better on one axis and worse on the other is a trade:** neither up nor down. 6 km in 40:00 is
  farther but slower.
- **Calories stay out of the verdict whenever there is a distance.** A machine derives them from
  distance and time, so they would only add noise.
- Sessions with nothing in common (a distance last time, only calories today) are not compared:
  today is a new baseline.
- All three measures are whole numbers (metres, seconds, kcal), so speeds compare exactly.

## Cardio match rule

Nobody runs farther or faster every time, so a cardio session aims to **match** the one before,
not to beat it (`matchedOrBeaten` in `analytics/domain/cardio-progression.ts`). The verdict is
the cardio progression rule unchanged; only what counts as success differs from lifting.

- **Matched (`same`) is a success**, green like beaten (`up`): at least as far and at least as
  fast as last time. Beaten is a bonus; records mark the real bests.
- **A trade (`mixed`) is neither**: a long slow run after a short fast one is not a failure.
  **Behind (`down`)** is the only miss.
- **No margin.** Matching is exact on whole metres and seconds: 5 km in 30:01 after 30:00 is
  behind. A tolerance would leak into records and lose exact comparison.
- **The goal line gives the numbers**: `Match it: at least 5 km at 10.0 km/h or faster.`, built
  from what last time recorded (`describeGoal`).
- **Cardio never stalls.** No `STALLED` tag, no stall line, no muscle group marked. Matching is
  the plan, so "no record for N sessions" says nothing is wrong.

## Weekly cardio rule

Time is the one measure every cardio exercise shares (10 km on a bike is not 10 km running, and
every machine estimates calories its own way), so the weekly goal counts time only
(`analytics/domain/weekly-cardio.ts`). Distance, speed and calories stay per exercise.

- **The same target window as weekly volume** (`windowMs` in `weekly-volume.ts`). One definition of
  "week".
- **Sum `durationSeconds` of every non-voided `CardioPerformed`** in the window, of any cardio
  exercise. Shown in whole minutes, rounded down; compared with the goal in seconds, so 149:59
  is not reached. Distance is never summed across exercises.
- **A bout without a time counts as 0** and the card says how many there were. No estimate.
- **The breakdown is per exercise**, largest first. Unknown exercise ids still count, under
  "Other" (always last).
- **A timed exercise (Sauna) is left out**: it is logged like cardio but is not training.
- **Under or reached**, never over. The cardio sets of the 0.3.0 day don't count.
- **Calories are a dim side figure only** (≈ the sum of the bouts that recorded them), never part
  of the status, absent when no bout recorded any.

## Treadmill rule

A treadmill is logged in **segments**, because the incline changes during a session: 10 minutes
walking flat, 20 running at 4%, 5 at 10% (`cardioKindOf`, `incline` and `cardioTotals` in
`training/domain/cardio.ts`). Running and Walking stay in the catalog for outdoors; nothing
logged under them is moved.

- **A segment is a cardio bout with an incline**, not a new event: `CardioPerformed` gained an
  optional `incline`. A session's segments add up like any bouts, so totals, weekly cardio,
  hype and history work unchanged.
- **Every treadmill segment stores its incline, 0 when flat**; other exercises never have one
  (`performCardio` refuses it). Stored as the machine showed it, from 0 to 40 in steps of 0.5,
  and read as percent grade. The label may change one day; the stored number never will.
- **The fields are what the display shows now.** A treadmill counts distance, time and calories
  from its start, so the form takes off what today's earlier segments already logged and stores
  the difference (`since` in `CardioFormComponent`). A number not above what is logged can only
  be a display that was reset, and is stored as typed. The hint says what is already logged.
- **The incline is remembered, read back from the log**: the wheel starts on the incline last
  logged on the exercise (5 before any), and the switch starts as the previous segment of today
  left it (flat in a new session). The "Incline" switch is the quick path, one tap between flat
  and the remembered incline; the wheel beside the fields (`WheelPickerComponent`, a scroll-snap
  list) tunes it, and turning it switches the incline on.
- **Climb is the third axis.** Climb is each segment's distance times its incline, in metres,
  summed in whole half-percent metres so that the same work cut into other segments gives the
  very same number. A session has a climb only when every bout recorded a distance and an
  incline. Walking 10, running 20 flat and 10 inclined is beaten by walking 10, running 15 flat
  and 15 inclined: same distance, same speed, more climb.
- **A climb record** is a session whose climb is more than in every comparable earlier one,
  when its distance is not also a record (distance first, then climb, then speed). Purple, like
  every amount. Experience needs no new rule: the session and record bonuses follow the verdict.
- **The comparison shows five numbers** (distance, time, speed, climb, calories) and under each
  row the session's **profile**: one block per segment, as wide as its time and as tall as its
  incline, both rows on one scale. Today's blocks are buttons, for voiding a segment. The goal
  line adds "Climb 100 m or more." The statistics page charts climb when there was any.

## Timed exercise rule

Some things done at the gym have only a duration. Sauna is the one such exercise for now.

- **Only time is recorded**: `performCardio` refuses a distance, calories or an incline, and
  the logging screen has the one time field and one number per row.
- **It is cardio in every other way**: an exercise with no involvements, logged as
  `CardioPerformed`, part of workouts, programs, favorites, history and experience (a minute is
  a minute), compared on time by rule 4 of the cardio progression rule.
- **It stays out of the weekly cardio goal**, which is about training.

## Cardio records rule

The lifting rules carried over (`analytics/domain/cardio-records.ts`). Cardio has no setups, so
the scope is the exercise.

- **A record is a session no earlier session matches:** judged on its totals, against every
  earlier session it can be compared with, by the cardio progression rule. It is a record when
  every such comparison is better on some axis. Ties are not records. A session with nothing
  earlier to compare with is a baseline and has no record.
- **The kind:** a **distance**, **calories** or **duration** record when that amount is more than
  in every comparable earlier session (lifting's weight record), otherwise a **speed** or
  **burn-rate** record (lifting's rep record: faster than anything at that distance or farther).
  So 6 km slower than last week's 5 km is a trade against last time but a distance record when
  nobody ran 6 km before.
- **The record table** is for the measures of the latest session: with distance and time, the
  best speed per distance that nothing beats on both, farthest first; with one measure, the most.
- **Cardio has no stalls** (see the cardio match rule).
- The record mark is the same biceps, on the number that set it in today's row, with the kind
  next to "Today". Records ignore the sets logged for cardio on the 0.3.0 day.
