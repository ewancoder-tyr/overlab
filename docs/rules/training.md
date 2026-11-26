# Training rules

How sets are recorded and what is derived from them while training.

## Recording rules

- A failed rep is not recorded. Log the reps actually completed.
- Alternating patterns are stored expanded, as rep groups of one rep each in the order performed.
  The UI may offer shortcuts to enter and display them, but there is one stored shape per set.
- A set that mixes exercises (alternating curl and hammer curl) has rep groups with different
  `exerciseId`. Its primary exercise is that of the first rep group.

## Plan rule

- The rotation position is counted in **logged workouts**, not calendar days: the plan for a
  workout is what was done `rotation` workouts before it. A skipped gym day delays the rotation;
  every logged workout counts, even a stray short one.
- While a workout is in progress it is the one being planned, so it is not counted as its own
  past. Reminders use the plan of the workout after the latest logged one.
- There is no plan until `rotation` workouts exist.
- An exercise is **done** today once it has at least one set in the workout in progress.
- On the Train page, done exercises move to the top in the order they were started, above the
  rest of the plan. That order is what the plan of this workout will be next time round.

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

Some sets are not part of any workout: push-ups every morning, whatever the gym schedule says
(`isStandalone`, `workoutSets`, `standaloneSessions` in `training/domain`). Regular workouts are
unchanged.

- **A standalone set is a `SetPerformed` with `standalone: true`**, an optional field; absent
  means a workout set. It is chosen per set, with the "Solo" chip on the logging screen.
- **It never touches a workout.** Workouts are grouped from the other sets only, so a standalone
  set starts or resets no rest, no workout time and no screen wake lock, is never the current
  exercise or "done today", and is not in the plan or the rotation count, even when logged in
  the middle of a workout.
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
- **Standalone habits are pinned to the top of Train** (`standaloneHabits`): the exercises done
  standalone in the last 30 days, in catalog order, under "Solo". A row opens the logging
  screen on standalone sets (`?solo=1`) and shows the sets of the standalone session in
  progress as done. A dropped habit leaves by itself; an exercise that is also planned is
  listed in both places, and never again among the favorites.
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
- **Hiding never gets in the way of the plan:** on Train, planned exercises and those done in the
  workout in progress are always listed (`trainList`). Only other favorites are filtered.
- `lifting` hides cardio on Week, Train, Catalog and the cardio goal in Advanced; `cardio` hides
  the muscle gauges, lifting favorites and catalog entries, the muscle filter, the volume target
  and the rest stopwatch. Reminders are unchanged.
- `TrainingFocus` lives in `shared/domain/training-focus.ts` (settings keeps it, catalog uses it);
  `app.config.ts` passes it to `CatalogService.focus`, where pages read it.
