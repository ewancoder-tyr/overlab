# Reminders

**One reminder per program.** Each program has its own days and rings at the reminder time set
in Settings, at a time of its own, or not at all (see the program rule in
`docs/rules/training.md`). A gym split and push-ups every morning are two programs and two
reminders, each on its own schedule.

The schedule rule exists twice and must stay identical: `src/shared/domain/schedule.ts` (the app
shows a program's upcoming days) and `reminder-server/schedule.go` (the server sends on them).
Both have tests for the same cases.

The app subscribes to Web Push through Angular's `SwPush` and registers the subscription with
its programs and the app's language at `PUT /api/reminders/device`; nginx forwards
`/api/reminders/` to the Go service. The server checks once a minute, in each device's own time
zone, and sends at most one reminder per program per day, dropping it if it is more than three
hours late.

## Program reminder rule

- **It is a calendar rule, never a judgement.** The server does not read the log: no day is
  missed, no streak is kept, and it rings even when the program was already done that day.
- **The app sends the schedule as it stands** (`anchoredSchedule`): when an "every N days"
  program is done on another day, the app registers it again counted from N days after that
  day. The server only ever sees a schedule.
- **Settings keeps the default time; the program decides** (`reminder` on the program:
  `default`, `at` a time, or `off`). A program that is off is not sent to the server at all.
- **Settings knows neither programs nor the catalog.** `app.config.ts` passes across what a
  reminder needs (`feedProgramReminders`): the program's id and name (the notification's
  title; a program without a name is called by its first exercise), its schedule, when it wants
  to ring, and the hype lines.
- **On or off is the device's one reminder switch.** It can be turned on once at least one
  program rings.
- **Sent each on its own:** in the device's time zone, at most once a day per program,
  dropped when more than three hours late. Two programs may ring on one day. One added or
  changed after its time has passed today waits for its next day.
- **A tap opens the Train page**, or, for a solo program of a single exercise, that exercise's
  logging screen on solo sets (`/exercises/:id?solo=1`).
- **Set up on the program** (the program editor), reached from Train, from the Reminders card of
  Settings, and from the bell on the logging screen, which takes the workout time's slot in the
  title bar while solo sets are being logged: it opens the solo program that holds the exercise
  (or a new one for it) and is lit when that program rings.
- At most 20 per device.

## The roast

**Reminder text is a roast.** The app sends hype lines (`analytics/domain/overload-hype.ts`)
only for the exercises of the program's next day, so nobody is teased about a deadlift on a day
without one. The numbers are from the last time each exercise was done, in whatever workout
that was; a solo program is quoted from its exercises' standalone history only (`soloHype`).
Loaded exercises are pushed by weight (25 kg, so 30 kg), bodyweight ones by reps (10, so 11).
The app words the numbers in the user's language (`25 кг`, `10 повторов`). The server
(`reminder-server/wording.go`) picks one line and one of 40 wordings in the device's language
(half playful, half a harsh personal roast) at random, never the same wording twice in a row. A
cardio line (the app marks it `cardio`) gets one of 20 cardio wordings instead, which never
mention weights and only ask to match `{last}` (see `docs/rules/cardio.md`). Before there is a
set to quote, a general wording. Every language has the same number of wordings; a device
without a language gets English. Wordings live only in Go; the hype rule lives only in
TypeScript.

## Devices on an earlier version

Before programs a device registered one gym schedule with a time (`schedule`, `time`, `hype`)
and a list of solo reminders (`solo`, see `reminder-server/solo.go`). The server still accepts
and sends those, so a device that has not updated keeps its reminders. An updated app sends
`programs` only, which ends the old ones for that device.
