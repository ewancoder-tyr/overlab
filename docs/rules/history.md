# History

The History page (`/history`, a link at the top of Week) shows everything logged, one day per screen
(`training/domain/day-history.ts`, `app/pages/history`). Derived, nothing stored. It is also where
the past is corrected: deleting an entry and logging on an earlier day (see the last two rules).

- **A day is a local calendar day** (`DayKey`), for this page only. No rule of the app uses
  calendar days; the target window stays rolling.
- **A day is a list of blocks in the order started:** each workout, and each standalone session
  (one exercise), with its start time and how long it lasted. A block belongs whole to the day
  it started on, so a workout past midnight is not cut in two.
- **Inside a block, the exercises in the order first performed**, lifting as rep tiles coloured
  by progression, cardio in words, with the record the exercise holds from that day, if any.
  Colours and records come from the block's own history (workout or standalone).
- **Swiping the day skips rest days:** it goes to the nearest day with something logged
  (`neighbourDay`), as do the arrows. The week strip (Monday first, a dot on logged days)
  shows the real calendar and swipes a week at a time; a rest day can be tapped.
- **The month opens a calendar** in place of the strip, paged by month and by year. Days after
  today cannot be chosen.
- **Swipes that start within 24 px of a screen edge are ignored:** that is Android's back gesture.
- **Experience earned that day** is shown beside the date while gamification is on.
- **The day is remembered while the app runs** (`HistoryPosition`, in memory, never in the
  address): coming back from an exercise's statistics returns to the day that was open. The
  link on Week starts afresh, on the latest day with something logged.
- **The day is a pager that follows the finger.** The neighbouring logged days are drawn beside
  the one on screen, so the next day is in view from the first pixel of a swipe. Let go past a
  fifth of the width (or flick) and the pages settle on the new day in 130 ms, otherwise they
  ease back. With no day on that side the page resists. Arrows and taps turn the same way, a
  later day coming from the right. The first movement decides between turning the page and
  scrolling it. Opening the page animates nothing. Keep the motion this small: it only has to
  say "that was a swipe".

- **Edit deletes entries of the day.** "Edit" beside the date turns the entries into buttons
  (each set tile, each cardio bout or segment); tapping one marks it and shows "Slide to delete"
  (`SlideConfirmComponent`), a red track whose thumb must be dragged to the end. Deleting is
  voiding: a `SetVoided` or `CardioVoided` is appended, nothing leaves the log.
- **"Log on this day" goes back in time** (`Clock.logInThePast`): pick a time, and the app's
  clock is shifted to that moment and keeps running from there, so sets logged one after another
  keep their order. While it is on, the shell says so on every page with "Back to now", and
  training shows the log **as it was then** (everything later is left out, `asOfNow` in
  `TrainingService`), so that day's workout is the one in progress and "last time" is the
  session before it. New events get that `occurredAt` and the real `recordedAt`
  (`EventContext.recordedAt`). Unlike the test date they are real: sync goes on. The
  leaderboard is not reported to meanwhile, and coming back celebrates nothing. Held in memory
  only; a moment that is not in the past is refused.
