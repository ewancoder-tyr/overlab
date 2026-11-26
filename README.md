# OverLab

A free bodybuilding tracker built around progressive overload. You log your sets, it tells you
whether you beat last time and how much work each muscle group got this week.

It is a web app you install on your phone (a PWA). It works offline and keeps your data on the
device. It runs at https://overlab.typingrealm.org.

## What it does

- **Weekly volume per muscle group**, against a target range you choose. This is the main screen:
  muscles grow on the work they get per week, so that is what the app counts.
- **Quick logging.** Weight and reps come prefilled with the set you need to match; most sets are
  one tap.
- **Progression, records and stalls.** Every session is compared with the one before, and an
  exercise that has stopped progressing is flagged, along with the muscle group it trains.
- **Cardio**: distance, time and calories, treadmill segments with incline, a weekly goal.
- **Workout plans** from a simple rotation, a rest clock, a history you can correct.
- **Reminders** on gym days, which make fun of your numbers.
- **Optional extras**: sync between devices through a Google sign-in, experience and levels, a
  leaderboard.
- English and Russian, dark and light.

## Running it

You need Node 26 (22.22 and 24.15 or later also work) and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm start      # http://localhost:4200
pnpm check      # lint, format check, tests, production build
```

The app is fully usable like this. Reminders, sync and the leaderboard need the server below and
a production build served with it: the development server has no service worker and does not
forward `/api/`.

## The server

There is no backend for the app's data. `reminder-server/` is a small Go service that does what a
web app cannot do alone: send push notifications at a set time, keep the optional cloud copy of
a signed-in user's log, and hold the leaderboard. It never reads the log.

```sh
cd reminder-server
go test ./...
VAPID_SUBJECT=https://example.com go run .   # listens on :8080, keeps its files in ./data
```

## Deploying

Every push to `main` is checked, built and deployed by GitHub Actions
(`.github/workflows/deploy.yml`): two images go to the GitHub container registry, the static site
behind nginx and the Go service, and the server then runs `compose.yml` with them.

To tell users about a new version, add an entry at the top of `src/app/release-notes.json` before
pushing. The service notices a version it has not announced yet and notifies every device, once.
A push without a new entry is a quiet deployment.

`compose.yml` describes one particular installation, so adapt it for your own: the image names,
the reverse proxy's Docker network (the proxy must terminate HTTPS, which notifications require),
the paths of the data folder and of the extras folder (optional: a script of your own that the
app loads beside itself, see `src/app/extras.ts`), `VAPID_SUBJECT` (your contact URL for the push
services, required) and `GOOGLE_CLIENT_ID`, your own Google OAuth client id, which is also in
`src/sync/infrastructure/google-identity-sign-in.ts`. Without it sync and the leaderboard are off.

To build the images yourself:

```sh
docker build -t overlab-web .
docker build -t overlab-reminders --build-context notes=src/app reminder-server
```

## How it is built

Angular and TypeScript, event-sourced: the log of events on the device is the only source of
truth, and every screen is a pure projection of it. The code is split into bounded contexts
(`src/catalog`, `src/training`, `src/analytics`, ...), each with domain, application,
infrastructure and presentation layers.

[docs/architecture.md](docs/architecture.md) explains the structure and
[docs/glossary.md](docs/glossary.md) the vocabulary. The domain rules (what counts as progress,
how a stall is detected, how cardio is compared) are written out in [docs/rules](docs/rules), and
each has a test named after it.

## Licence

The code is MIT licensed. The exercise drawings in `public/exercise-drawings` are licensed
separately under CC BY-SA 4.0 and derive from the Everkinetic project; see
[public/exercise-drawings/README.md](public/exercise-drawings/README.md).
