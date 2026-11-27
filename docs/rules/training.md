# Training rules

How sets are recorded and what is derived from them while training.

## Recording rules

- A failed rep is not recorded. Log the reps actually completed.
- Alternating patterns are stored expanded, as rep groups of one rep each in the order performed.
  The UI may offer shortcuts to enter and display them, but there is one stored shape per set.
- A set that mixes exercises (alternating curl and hammer curl) has rep groups with different
  `exerciseId`. Its primary exercise is that of the first rep group.

## Program rule

A program is the list of exercises the user prepared for each day they train, with the days it
falls on and its reminder (`training/domain/program.ts`). It replaced the plan that used to be
derived from a rotation of past workouts: what to do is now decided in advance, not guessed
from what was done.

- **A program is a template and a calendar rule, nothing more.** Sets never refer to one.
  Whatever is logged lands in the workout derived from the 3-hour gap and in its exercise's own
  history, on a program day or on a whim. Progression is per exercise and setup, wherever the
  exercise was done.
- **It has a name, a schedule, a reminder and one to 14 program days**, each an ordered list of
  exercises (at most 40, none twice). Days have no names: they are Day 1, Day 2 by position. A
  day may be empty, to be filled by training. At most 20 programs.
- **Three events.** `ProgramDefined` carries the whole program and the most recent one of a
  program is the program; `ProgramRemoved` removes it; `ProgramDayChosen` says which program
  day a workout is.
- **A choice marks the workout in progress at that moment, or else the one that starts within
  3 hours of it** (`workoutDays`). So a day can be chosen before the first set, switched in the
  middle, or given to a workout right after its last set. The latest choice of a workout
  decides. A workout nobody chose a day for belongs to no program and moves none forward.
- **The day that comes next is the one after the day done last**, in the program's order, going
  round (`nextDay`). It follows what was done, not the calendar: after a skipped Wednesday,
  Friday still suggests Wednesday's day, and the user switches if they would rather move on.
- **Fixed weekdays never move; "every N days" counts from the day the program was really done**
  (`anchoredSchedule`). Skip Friday, train on Saturday, and the next days are Monday and
  Wednesday. Until the program is done its days stay where they were, so a skipped day is not
  chased. A start date set later than the last time it was done stands.
- **On the Train page** each program is a card listing the day that comes next (or the one
  chosen), programs due today first. Opening an exercise from the card makes the workout that
  day; the day chips switch to another. In the program the workout belongs to, done exercises
  move to the top in the order they were started, planned or not. An exercise is **done** today
  once it has at least one set in the workout in progress.
- **Nothing changes a program silently.** Logging something that is not listed, or leaving a
  listed exercise out, changes nothing. When the workout holds something the day does not, or
  has stopped short of the day's list, the card offers to save what was done as that day's list.
- **Three ways to build a day**, all ending in a `ProgramDefined`: the editor; "Save as a
  program" on a workout (on Train while it is in progress, or in History), as a new program, a
  new day or in place of a day, which also marks that workout as that day; or choosing an empty
  day, training, and taking the offer above.
- **A solo program is done outside workouts** (push-ups every morning): `solo: true`, a single
  day, one or more exercises, no cardio. Its exercises are listed under "Solo" on Train and
  logged as standalone sets (see the standalone set rule), so nothing is chosen for it: it was
  done at the latest standalone set of any of its exercises.
- **Every exercise done outside workouts is a solo program**, made or not (`currentPrograms`).
  A solo reminder of the time before programs (`SoloReminderSet`, `SoloReminderRemoved`, still
  in old logs) is read as a solo program of that exercise on the same days at the same time,
  with the id `solo-<exercise id>`. An exercise done standalone in the last 30 days that no
  solo program holds, and whose own program was never defined or removed, is one for every day
  with the reminder off; it leaves by itself when the habit is dropped. Editing or removing
  either writes a real event under the same id, which then decides.
- **What programs replaced.** The gym schedule and the rotation were preferences
  (`gym-schedule`, `workout-rotation`); their events stay in old logs and are skipped. Nothing
  is converted: a user builds their program by hand.

## Rest and workout time rule

- Both are derived from the log (`training/domain/session-clock.ts`); there is nothing to start,
  stop or sync. They follow the `Clock`, so a test date works.
- Rest counts from the latest non-voided set; voiding it moves rest back to the set before.
- Workout time runs (`now − first`) while something was logged within the idle limit, then stops
  at `last − first`. Logging again within 3 hours resumes the same workout, pause included. A
  stopped time stays visible, dimmed, while the workout is still in progress.
- Which alert applies depends on where the user is, not on what they log next
  (`restAlertFor`): the rest alert on the current exercise's own logging screen, the switch rest
  alert anywhere else. The logging screen tells `RestAlert` which exercise it shows.
- Each alert buzzes at most once per rest, only while the page is visible, and never when the
  app is opened (or the page changed) after its moment has passed (`RestAlert`). Leaving the
  current exercise after the 1:00 buzz can still buzz at 3:00.
- While workout time runs, the app keeps the screen on (Screen Wake Lock), failing silently.

## Standalone set rule

Some sets are not part of any workout: push-ups every morning, whatever the gym program says
(`isStandalone`, `workoutSets`, `standaloneSessions` in `training/domain`). Regular workouts are
unchanged.

- **A standalone set is a `SetPerformed` with `standalone: true`**, an optional field; absent
  means a workout set. It is chosen per set, with the "Solo" chip on the logging screen.
- **It never touches a workout.** Workouts are grouped from the other sets only, so a standalone
  set starts or resets no rest, no workout time and no screen wake lock, is never the current
  exercise or "done today", and makes no workout a program day, even when logged in the
  middle of a workout.
- **It counts everywhere else like any set:** weekly volume by its effort, experience, records,
  statistics.
- **Standalone sessions are per exercise, by the 3-hour gap.** Standalone sets of one exercise
  less than 3 hours apart are one session: 10 and, twenty minutes later, 8 are a session of 18;
  the evening's are another. Nothing groups different exercises together.
- **Standalone sessions are a history of their own**, never compared with workout sessions:
  progression, pace, records, the record table and stalls each run on one history or the other.
  10 easy push-ups each morning say nothing about 30 to failure at the gym. An exercise is
  stalled when either history is.
- **The session in progress** is the latest standalone session while another set would still
  join it (less than 3 hours since its last set), as the workout in progress is for workout sets.
- **Solo exercises are pinned to the top of Train**, under "Solo": the exercises of the solo
  programs (see the program rule), which include every exercise done standalone in the last 30
  days (`standaloneHabits`). A row opens the logging screen on standalone sets (`?solo=1`) and
  shows the sets of the standalone session in progress as done. An exercise that is also in a
  program day is listed in both places, and never again among the favorites.
- **The chip remembers:** it starts as the latest set of that exercise was, derived from the log.
  The logging screen and the statistics page show one history at a time; statistics has a switch
  when the exercise has both.

## Easy session rule

An easy set is practice, not a test of strength, so an easy session is judged like cardio: it
aims to match (`isEasySession` in `training/domain/set.ts`). Effort decides, not where the set
was done: the rule is the same in a workout and standalone.

- **An easy session is one whose working sets are all easy.** One set of real effort makes the
  whole session a real one, judged by the progression rule as always.
- **Matched (`same`) is a success**, green like beaten, on the logging screen and the progress
  chart. Behind is the only miss. The verdict itself is the progression rule unchanged.
- **The stall count skips easy sessions:** they neither add to a stall nor end one, whatever
  their verdict. Easy, hard, hard, easy, hard, all level, is a stall of 3. Beating last time the
  easy way does not end a stall and earns no stall-broken bonus.
- **Verdicts still compare with the session before, easy or not**, within the same history and
  setup: the first hard session after easy ones is compared with the last easy one.
- **Effort is not carried over to the next set, except easy:** when the set to match was easy,
  the Easy chip starts on.

## Training focus rule

- **It hides, it never deletes or stops counting.** Events are logged, synced and projected
  exactly as before; switching back shows everything again.
- **`isShown(exercise, focus)` (`catalog/domain/exercise.ts`) is the one rule** for lists, built
  on `isCardio()`. Pages never test `isCardio()` against the focus themselves.
- **Hiding never gets in the way of a program:** on Train, the exercises of programs and those
  done in the workout in progress are always listed (`trainList`). Only other favorites are
  filtered.
- `lifting` hides cardio on Week, Train, Catalog and the cardio goal in Advanced; `cardio` hides
  the muscle gauges, lifting favorites and catalog entries, the muscle filter, the volume target
  and the rest stopwatch. Reminders are unchanged.
- `TrainingFocus` lives in `shared/domain/training-focus.ts` (settings keeps it, catalog uses it);
  `app.config.ts` passes it to `CatalogService.focus`, where pages read it.
