# Leaderboard

The one online-first feature: it shows what was never on the phone
(`src/leaderboard/`, `reminder-server/leaderboard/`). Nothing about it is an event, and nothing
is synced.

- **Taking part is a row on the server, per Google account**, so every signed-in device of the
  account agrees on it. Joining is a switch in Settings, Experience (shown only while
  gamification is on), and needs a Google sign-in on the Data page first.
- **Joining takes Google's button once more.** The server stores the name and picture from that
  verified ID token, never from the request, and only when the token is for the account the
  device syncs with. That is all it keeps: sub, name, picture, experience, joining time (and
  what buddies need, see Buddies).
- **Only those taking part see the board**, and the account id is never sent to anyone.
- **The app reports its experience** (whole points, rounded down, after it settles for 5 s).
  The server cannot compute it, because it never reads events, so it trusts the number. It
  cannot join anyone by reporting. Level and title are derived on each phone from the
  experience (`standings`), on the character's curve, in the viewer's language. Equal
  experience shares a place (1, 2, 2, 4); the server breaks ties by who joined first.
- **It follows experience as it is**: a `ProgressReset` drops you on the board too.
- **Leaving:** the switch, turning gamification off, or "Delete everything" (the server
  forgets the account). Signing out keeps the row, frozen until signed in again.
- **Nothing is reported while a test date is on**, as with sync.
- **The last board fetched is cached** in `localStorage`, per account, only to show offline
  ("as it was at …"). Google's pictures are not cached; offline, a row shows an initial.
- **On the server it is a separate package** with its own database (`/data/leaderboard.db`),
  under `/api/sync/leaderboard` because the sync session cookie is sent only to `/api/sync/`.
  It borrows sync's sign-in through `main.go` (`cloudsync.Account`, `Verify`,
  `OnAccountDeleted`) and imports nothing from it. Removing it means deleting that folder, its
  lines in `main.go` and the database file, and on the app side `src/leaderboard/`, its line
  in `app.config.ts` and its places on Week and Settings.

## Buddies

Friends who train trolling each other: when someone you know logs a set, your phone says so, in
the reminder's roasting voice ("80 kg × 8 on bench press. And you? Sofa again?"). Part of the
leaderboard, on both sides (`src/leaderboard/` `buddy-*` and `buddies.service.ts`,
`reminder-server/leaderboard/buddies.go` and `roast.go`). Nothing about it is an event.

- **Consent is blind and mutual.** A **follow** (the bell on a leaderboard row) alone does
  nothing and tells nobody. Sets travel only between **buddies**: two accounts that follow each
  other, which in practice means two people who agreed to it in real life. Either one
  unfollowing ends it in both directions, silently.
- **Nobody can learn who follows them.** No route says it, the board marks only the rows _you_
  follow (the bell never shows "mutual"), and a reported set is answered the same way, and
  before any push is sent, whether anyone listens or not. You find out that someone followed
  back when their sets start arriving.
- **Following is the switch; there is no other.** The first follow sets notifications up on
  that device (the browser's permission prompt). A refusal does not undo the follow: the other
  side still hears about you. Each further device of the account is set up from a line on the
  leaderboard page, shown only while you follow someone and that device is not set up.
- **The phone words it, the server roasts it.** As with reminders: the app sends the exercise
  and what was done in **every language** (`BuddyActivity`, `setActivity`, `cardioActivity`),
  because the reader's language is not the sender's; the server picks the receiving device's
  language and one of its wordings (20 lifting, 10 cardio, 6 for a record, per language, never
  the same twice in a row on a device). The title is the buddy's Google name. Wordings live
  only in Go, the numbers only in TypeScript.
- **Russian roasts use no gendered forms for either person**: nothing in the past tense about
  the buddy or the reader, and no adjectives for them.
- **A set is quoted as the records rule judges it** (`topSet`): top load and the full reps at
  it; a plain bodyweight set by its reps. A cardio bout as `describeBout` words it. Working
  sets only, never warm-ups; light, easy and standalone sets are told like any other.
- **Transient: nothing is stored or replayed.** The server pushes and forgets. The push lives
  an hour at the push service, for a phone that is offline.
- **Every recording is one push.** Each report carries a notification `tag` chosen by the phone
  (the event's id, so every set is its own notification); the server only prefixes it with the
  sender's row.
- **Only fresh sets logged on this device are told** (`news`): within 10 minutes of being done,
  so a set logged offline is told when the phone is back, but old ones never arrive as a burst.
  Sets pulled by sync, an imported backup, the history uploaded at sign-in, a test date and
  logging in the past tell nothing. A void tells nothing and takes nothing back.
- **A device that follows nobody reports nothing**: following is its half of any mutual follow.
- **Leaving the leaderboard removes your follows in both directions** and your devices, as do
  turning gamification off and "Delete everything". Signing out keeps them.
- **The browser has one push subscription, shared with reminders.** Each feature claims it
  while it uses it (`PushSubscriptions` in `shared/infrastructure`), and it is given up only
  when neither does. So following a buddy does not switch gym reminders on, and switching
  reminders off does not silence buddies.
- **On the server** it is two tables in the leaderboard's database (`follows`, and `devices`:
  the push subscriptions per account, at most 10) and a random public id per row of the board,
  which is what the app sends to follow it; the account id is still never sent to anyone. It
  borrows the reminder server's sender through `main.go` (`leaderboard.Push`) and imports
  nothing. An account is limited to 120 reports an hour.
