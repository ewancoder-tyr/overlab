# Reminders

The gym schedule rule exists twice and must stay identical: `src/settings/domain/gym-schedule.ts`
(the app shows upcoming gym days) and `reminder-server/schedule.go` (the server sends on them).
Both have tests for the same cases.

The app subscribes to Web Push through Angular's `SwPush` and registers the subscription with the
plan and the app's language at `PUT /api/reminders/device`; nginx forwards `/api/reminders/` to the
Go service. The server checks once a minute, in each device's own time zone, and sends at most one
reminder per device per day, dropping it if it is more than three hours late.

**Solo reminders travel with the same registration** (`solo` in the request, see the solo
reminder rule) and are sent by the same check, each on its own schedule and with its own "last
sent" date. The app also sends an empty plan (no gym days, no solo reminders), so the server
learns that the last solo reminder was removed.

**Reminder text is a roast.** The app sends hype lines (`analytics/domain/overload-hype.ts`) only
for the exercises planned for the next workout, so nobody is teased about a deadlift on a day
without one. The numbers are from the last time each exercise was done, in whatever workout that
was. Loaded exercises are pushed by weight (25 kg, so 30 kg), bodyweight ones by reps (10, so 11).
The app words the numbers in the user's language (`25 кг`, `10 повторов`). The server
(`reminder-server/wording.go`) picks one line and one of 40 wordings in the device's language (half
playful, half a harsh personal roast) at random, never the same wording twice in a row. A cardio
line (the app marks it `cardio`) gets one of 20 cardio wordings instead, which never mention weights
and only ask to match `{last}` (see `docs/rules/cardio.md`). Every language has the same number of
wordings; a device without a language gets English. Wordings live only in Go; the hype rule lives
only in TypeScript.

## Solo reminder rule

A standalone exercise can have an alarm: push-ups every day at 08:00, pull-ups every second day
(`settings/domain/solo-reminder.ts`, `reminder-server/solo.go`). It is to standalone sets what
the gym day reminder is to workouts, and nothing more.

- **It is a calendar rule, never a judgement.** It does not read the log: no day is missed, no
  streak is kept, nothing changes colour, and doing or skipping the exercise changes nothing
  about the next alarm. It rings even when the exercise was already done that day.
- **One per exercise**, with a schedule of the gym schedule's shape (days of the week, or every
  N days from a start date, "every day" being every 1 day) and a time of day. A new one starts
  as every day from today at 08:00. At most 10; the factory refuses an eleventh exercise.
- **Two events per exercise, like favorites:** `SoloReminderSet` and `SoloReminderRemoved`; the
  most recent of an exercise decides. Not a preference holding the list, so two devices setting
  different exercises both keep theirs.
- **Settings keeps the exercise as a bare id** (it does not know the catalog). `app.config.ts`
  passes the name and the hype across (`feedSoloReminderFacts`); a reminder whose exercise the
  catalog does not know is listed in Settings (to be removed) but not sent.
- **The roast is the gym's, about that exercise alone:** the same wordings, with the numbers
  from its standalone history only (`soloHype`), bodyweight by reps and loaded by weight. Before
  the first standalone set, a general wording. The title is the exercise's name.
- **On or off is the device's one reminder switch.** It can be turned on with gym days or with
  at least one solo reminder. The gym schedule is optional on the server for that reason.
- **Sent by the gym reminder's rules, each on its own:** in the device's time zone, at most once
  a day per exercise, dropped when more than three hours late, independent of the gym day
  reminder (both may arrive on one day). One added or changed after its time has passed today
  waits for its next day.
- **A tap opens the exercise's logging screen on solo sets** (`/exercises/:id?solo=1`).
- **Set up in two places, with one editor** (`SoloReminderEditorComponent`): the Reminders card
  of Settings (a list, and a menu offering the solo habits, then the other favorites) and the
  bell on the logging screen. The bell takes the workout time's slot in the title bar while solo
  sets are being logged, lit when a reminder is set.
