# Sync

Signing in with Google is optional. Signed in, the server keeps a **cloud copy** of the user's
event log, so all their devices share one history and losing every device loses nothing that was
backed up. Signed out, the app is exactly what it was before sync existed.

**Offline-first is untouched: sync is never on the write path.** Logging writes to IndexedDB as
always; sync is a separate cycle that reads the local log and appends to it later. Signed in or
not, online or not, the app works the same and saves everything locally.

- **Merge is a set union by event `id`**, through the same idempotent append as backup import.
  Concurrent devices never conflict: more events are just more events, and the latest
  `PreferenceChanged` still wins.
- **The cycle is push, then pull.** Push sends the **pending** events (those in the local log the
  server has not confirmed); pull fetches everything after the device's cursor. It runs on app
  start, shortly after any append, on `online`, on returning to the foreground, and every 30 s
  while visible. A failure is silent and retried by the next trigger.
- **Sync pauses while a test date is on**, so fake-dated events never reach the cloud copy.
- **Signing in uploads what is on the device.** When the local log is not empty, the app warns
  first that its data will be merged into that Google account's cloud copy.
- **Signing out** keeps the device's data. Erasing it is the separate "Erase this device".
- **Erase this device** clears the local log and signs the device out (otherwise the next pull
  would bring everything back). The cloud copy is untouched; signing in again restores it.
- **Delete everything** (only when signed in) deletes the cloud copy and this device's data, and
  every other signed-in device erases its own when it next syncs, pending events included. The
  server bumps the account's **generation**; a device holding an older one is told the copy was
  deleted. Demo data may be loaded while signed in: it lands in the cloud copy, and this is how
  it is removed.

## The sync server

A separate package of the Go service, `reminder-server/cloudsync/`, with its own SQLite database
(`/data/sync.db`, pure-Go driver) and its own routes under `/api/sync/`. Nothing else imports it:
removing sync means deleting that folder, its few lines in `main.go`, the nginx location and the
database file. It shares nothing with reminders.

- **Identity is the Google `sub`** from an ID token, checked once at sign-in. The server then sets
  its own signed cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, one year). Sync stores no email or
  name (the leaderboard stores a name and picture, only for those who join it). When the cookie
  expires, pending events wait on the device until the user signs in again.
- **It never interprets events.** It stores each one as an opaque JSON blob under `(sub, id)`,
  ignoring duplicates, and hands out a sequence number only as the pull cursor. Ordering for
  projections stays `occurredAt`, then `id`.
- **The database must be backed up off the server**, because a signed-in user's cloud copy may
  be their only copy. That is the operator's job: the service does not do it.
- **It is on only when `GOOGLE_CLIENT_ID` is set** (`compose.yml`). The same id is in
  `sync/infrastructure/google-identity-sign-in.ts`; both are public.

The app's side is the `sync` context. `SyncService` runs the cycle and keeps the bookkeeping
(`SyncState`: account, generation, cursor, confirmed and local-only ids) in its own IndexedDB
database, `overlab-sync`. `sync.providers.ts` decides when to sync; the cloud backup
part (`CloudBackupComponent`) and the two erase actions, all on the Data page's one "Your data"
card beside export and import, are its only screens.
