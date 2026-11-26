# Architecture

**Functional event sourcing.** The event log is the only source of truth.

```
user intent -> factory validates and builds an event -> append to the log -> projections derive views
```

- **Events** are immutable facts. They are never edited or deleted. Mistakes are corrected with a
  new event (`SetVoided`, then re-log).
- **Factories** (`performSet(...)`) are the only way to create events. They validate input and
  return a `Result`; invalid data never reaches the log.
- **Projections** are pure functions from events to view data. They hold all read-side logic.
- There are no class aggregates and no repositories of mutable entities.

## Bounded contexts

Each context is a top-level folder in `src/` with the same four layers.

| Context        | Path alias        | Responsibility                                                                                                                                                                                                                                     |
| -------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared`       | `@shared/*`       | Event envelope, ids, `Result`, event log and its storage                                                                                                                                                                                           |
| `catalog`      | `@catalog/*`      | Exercises, techniques, muscle groups, setups, favorites                                                                                                                                                                                            |
| `training`     | `@training/*`     | Performing and voiding sets and cardio, workouts, history                                                                                                                                                                                          |
| `analytics`    | `@analytics/*`    | Progression (lifting and cardio), records, stalls, weekly volume and cardio. Owns no events.                                                                                                                                                       |
| `gamification` | `@gamification/*` | Experience and levels, for the character and each exercise, derived from the log. Owns one event: starting from scratch. Off by default                                                                                                            |
| `settings`     | `@settings/*`     | Preferences (gym schedule, rotation, reminder time, language, rest alerts, stall threshold, stall involvement, training focus, volume target, light set weight, cardio goal, target window, color scheme, gamification), reminders, solo reminders |
| `sync`         | `@sync/*`         | Google sign-in, pushing and pulling the cloud copy, sync status                                                                                                                                                                                    |
| `leaderboard`  | `@leaderboard/*`  | Taking part in the leaderboard, reporting experience, showing the board. Online-first, owns no events. Built on gamification and sync                                                                                                              |
| `diagnostics`  | `@diagnostics/*`  | On-device trace of taps, page switches, slow moments and errors, for tracking down problems. Off by default                                                                                                                                        |
| `app`          |                   | Shell, routing, pages that compose contexts                                                                                                                                                                                                        |

`sync` stands beside the chain like `settings`, depending only on `shared`: it moves events without
reading them. `leaderboard` sits on top of both `gamification` and `sync`, below `app`. So does
`diagnostics`: it watches the browser, never the log.

Dependencies point one way: `app -> gamification -> analytics -> training -> catalog -> shared`.
`settings` stands beside that chain: it depends only on `shared`, and only `app` knows both. Where
one side needs a value of the other (training needs the rotation and the rest alert, analytics the
stall threshold and the weekly targets, gamification the light set weight and the stall threshold,
catalog the training focus, reminders need the hype, every context needs the language),
`app.config.ts` passes it across.

**Extras** are not a context. An installation may serve one script of its own beside the app
(`/extras/extras.js`), which the shell loads when it is there (`app/extras.ts`). The app gives it
nothing and depends on nothing in it.

## Layers

| Layer             | Contains                                              | May import                        |
| ----------------- | ----------------------------------------------------- | --------------------------------- |
| `domain/`         | Types, event factories, projections. Pure TypeScript. | Other `domain/` only. No Angular. |
| `application/`    | Angular services exposing signals and commands        | `domain/`, shared application     |
| `infrastructure/` | IndexedDB, browser APIs, file export                  | `domain/`, `application/` ports   |
| `presentation/`   | Components. Thin: bind signals, call services.        | `application/`, `domain/` types   |

These rules are enforced by `no-restricted-imports` blocks in `eslint.config.js`.

## Events

Every event has this envelope:

| Field        | Meaning                                                              |
| ------------ | -------------------------------------------------------------------- |
| `id`         | UUID, globally unique                                                |
| `type`       | Event name, past tense                                               |
| `version`    | Schema version of this event type, starting at 1                     |
| `deviceId`   | Random id of the device that created it                              |
| `occurredAt` | When it happened (ISO 8601 UTC). May be in the past when backfilling |
| `recordedAt` | When it was logged (ISO 8601 UTC)                                    |

| Event                 | Context      | Payload                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SetPerformed`        | training     | `kind`, `repGroups[]`, optional `effort`, optional `setupId`, optional `standalone`                                                                                                                                                                                                       |
| `SetVoided`           | training     | `setId`                                                                                                                                                                                                                                                                                   |
| `CardioPerformed`     | training     | `exerciseId`, optional `distance` (`value`, `unit`), `durationSeconds`, `calories`, `incline`                                                                                                                                                                                             |
| `CardioVoided`        | training     | `cardioId`                                                                                                                                                                                                                                                                                |
| `PreferenceChanged`   | settings     | `preference` (`gym-schedule`, `reminder-time`, `workout-rotation`, `language`, `rest-alert`, `switch-rest-alert`, `stall-threshold`, `training-focus`, `volume-target`, `light-set-weight`, `cardio-goal`, `stall-involvement`, `target-window`, `color-scheme`, `gamification`), `value` |
| `ProgressReset`       | gamification | none: experience counts only what happened after the latest one                                                                                                                                                                                                                           |
| `ExerciseFavorited`   | catalog      | `exerciseId`                                                                                                                                                                                                                                                                              |
| `ExerciseUnfavorited` | catalog      | `exerciseId`                                                                                                                                                                                                                                                                              |
| `SoloReminderSet`     | settings     | `exerciseId`, `schedule`, `time`                                                                                                                                                                                                                                                          |
| `SoloReminderRemoved` | settings     | `exerciseId`                                                                                                                                                                                                                                                                              |

The current value of a preference is that of its most recent `PreferenceChanged`. An exercise is
a favorite when the most recent of its two favorite events is `ExerciseFavorited`, and has a solo
reminder when the most recent of its two solo reminder events is `SoloReminderSet`.

### Event rules

- Events are a permanent contract. Adding an optional field is compatible. Renaming, removing or
  changing the meaning of a field requires a new `version` and an upcaster.
- Readers are tolerant: projections skip unknown event types and unknown exercise ids.
- Built-in catalog ids (`bicep-curl`, `long-length-partial`) are stored in events forever. Never
  rename or reuse one.
- Projections must not depend on the order events were stored in. Sort by `occurredAt`, then `id`,
  when order matters. This is what makes multi-device merge a plain set union.
- Never store derived values (effective load, workout id, volume) in events.

## Testing

- Domain code (factories, projections) is tested with plain vitest, no Angular TestBed.
- Every domain rule in `docs/` should have a test that names it.
