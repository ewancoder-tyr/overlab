# OverLab

OverLab (Overload + Laboratory) is a free, MIT-licensed bodybuilding tracker built around
progressive overload: log sets, see whether you beat last time, track weekly volume per muscle
group.

**The core purpose is weekly volume per muscle group.** Every exercise declares how strongly it
involves each muscle group, and the app's main view is each muscle group's weekly total against
its target range. Logging sets and progression exist to feed and support that view.

It is an **offline-first PWA** (English and Russian). All data and all domain logic live on the
device. Signing in with Google is optional and keeps a cloud copy of the log for syncing.

**There is no backend, with one exception:** `reminder-server/` (Go). It sends the gym day and
solo reminders and announces new versions, and hosts two separate, removable packages: `cloudsync`
(the cloud copy) and `leaderboard` (the board and buddies). It never interprets the event log. Do
not add anything else to it.

## Working mode

- Write the code to be read.
- Comment the _why_: domain rules, non-obvious TypeScript or Angular patterns, and trade-offs.
  Do not comment what the code plainly says.
- Workshop domain changes (new terms, events, rules) with me before implementing them, and
  update the matching file in `docs/` when they are agreed.
- After every change run `pnpm lint`, `pnpm format` and `pnpm test`. Leave all three clean. After
  a change to the server, `cd reminder-server && go test ./...` too.
- After every change, however small, add a short line written for users to `changelog.md`
  (git-ignored; create it if missing). It feeds the next release.
- Commit only when asked.

## Commands

| Command             | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `pnpm start`        | Dev server on http://localhost:4200                         |
| `pnpm test`         | Unit tests (vitest), single run                             |
| `pnpm lint`         | ESLint, type-checked strict rules                           |
| `pnpm format`       | Prettier, writes changes                                    |
| `pnpm build`        | Production build with service worker                        |
| `pnpm check`        | lint + format check + test + build                          |
| `pnpm draw`         | Draw a new exercise in the house style                      |
| `pnpm build:single` | The whole app as one HTML file, a demo that opens from disk |

**Every push to `main` is deployed** by GitHub Actions (`.github/workflows/deploy.yml`); nothing
is deployed from a working tree. **A deployment is not a release.** A release is a push that adds
a version to `src/app/release-notes.json`: the server then notifies every device, once. Prepare
one only when I ask for a new version, with the `release` skill.

## Stack

Angular 22 (zoneless, signals, standalone), TypeScript 6 strict, SCSS, pnpm, vitest,
`@angular/service-worker`, IndexedDB. ESLint (typescript-eslint strict type-checked +
angular-eslint) and Prettier. TypeScript files use 4-space indent; everything else 2.

## Architecture

**Functional event sourcing.** The event log is the only source of truth.

```
user intent -> factory validates and builds an event -> append to the log -> projections derive views
```

- **Events** are immutable facts and a permanent contract: never edited, deleted, renamed or
  given a new meaning. Mistakes are corrected with a new event. Adding an optional field is fine.
- **Factories** (`performSet(...)`) are the only way to create events; they return a `Result`.
- **Projections** are pure functions from events to view data, independent of storage order
  (sort by `occurredAt`, then `id`). Never store a derived value in an event.
- No class aggregates, no repositories of mutable entities.

Each bounded context is a top-level folder in `src/` with a path alias (`@training/*`):
`shared`, `catalog`, `training`, `analytics`, `gamification`, `settings`, `sync`, `leaderboard`,
`diagnostics`, and `app` (shell, routing, pages that compose contexts).

Dependencies point one way: `app -> gamification -> analytics -> training -> catalog -> shared`.
`settings` and `sync` stand beside that chain and depend only on `shared`; `leaderboard` sits on
`gamification` and `sync`. Where one side needs a value of the other, `app.config.ts` passes it
across.

| Layer             | Contains                                              | May import                        |
| ----------------- | ----------------------------------------------------- | --------------------------------- |
| `domain/`         | Types, event factories, projections. Pure TypeScript. | Other `domain/` only. No Angular. |
| `application/`    | Angular services exposing signals and commands        | `domain/`, shared application     |
| `infrastructure/` | IndexedDB, browser APIs, file export                  | `domain/`, `application/` ports   |
| `presentation/`   | Components. Thin: bind signals, call services.        | `application/`, `domain/` types   |

`eslint.config.js` enforces both sets of rules.

## Where the rest is written down

Read the matching document before changing that part of the app, and keep it true afterwards.
Code comments refer to these by file and heading.

| Document                    | Read it for                                                             |
| --------------------------- | ----------------------------------------------------------------------- |
| `docs/glossary.md`          | The ubiquitous language: every domain term, one meaning each            |
| `docs/architecture.md`      | Contexts in detail, the event envelope, every event and the event rules |
| `docs/rules/training.md`    | Recording, plan and rotation, rest, standalone and easy sets, focus     |
| `docs/rules/progression.md` | Progression, records, stalls, stalled muscle groups                     |
| `docs/rules/cardio.md`      | Everything cardio: bouts, treadmill, match, weekly goal, records        |
| `docs/rules/history.md`     | The History page, deleting entries, logging in the past                 |
| `docs/rules/experience.md`  | Experience, levels, celebrations                                        |
| `docs/reminders.md`         | Gym day and solo reminders, hype lines and roasts                       |
| `docs/sync.md`              | Google sign-in, the cloud copy, the sync server                         |
| `docs/leaderboard.md`       | Leaderboard and buddies                                                 |
| `docs/languages.md`         | How every text exists in English and Russian                            |
| `docs/design.md`            | Colours, type, navigation, the logging screen, known platform issues    |
| `docs/developer-tools.md`   | Test date, developer settings, diagnostics                              |
| `docs/releases.md`          | Release notes, versions, how a new version is announced                 |
| `docs/history.md`           | What each beta version before 1.0 added (some rules mention them)       |

## Conventions

- Branded types for ids: `string & { readonly __brand: 'ExerciseId' }`.
- `readonly` on all domain data. `unknown` over `any`. No non-null assertions.
- Signals for state, `computed()` for derived state, `inject()` over constructor injection,
  `input()` / `output()` functions, `@if` / `@for` control flow, lazy-loaded routes.
- Components expose `protected readonly` signals to templates and never expose services.
- Selector prefix `olab`. Files keep their type suffix: `exercise-log.component.ts`,
  `training.service.ts`.
- `Clock` (`shared/application/clock.service.ts`) is the only source of "now". Never call
  `new Date()` for the current time elsewhere.
- Every text exists in every language (`Localized<T>`); components keep theirs in a `TEXT` table.
- Mobile-first and accessible: semantic HTML, labelled controls, visible focus, WCAG AA contrast,
  touch targets of at least 44px.
- Domain code is tested with plain vitest, no TestBed. Every domain rule in `docs/` should have a
  test that names it.
