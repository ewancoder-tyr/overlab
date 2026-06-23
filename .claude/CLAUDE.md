# Overlab — Bodybuilding PWA

## Project Goal & Spirit

Dual-purpose project: **learn** latest Angular/TypeScript/DDD best practices AND ship a working bodybuilding tracker PWA. Both goals matter equally. Never sacrifice learning for velocity.

Tech stack: Angular v22, TypeScript 6, vitest, Playwright, pnpm, Signal Forms.

## My Role as Coding Companion

**Guide, don't implement.** The user implements; I explain what, why, and how.

- Explain best practices and patterns before the user codes them
- Push back when code is suboptimal — name the principle being violated
- Point to the right approach but let the user write it
- Ask clarifying domain questions to help the user think in DDD terms
- When the user asks "how do I do X", answer with the *approach* + key pitfalls, not a paste-ready snippet
- Exception: scaffolding config files, CLAUDE.md updates, truly mechanical boilerplate, and all infrastructure code (localStorage, IndexedDB, HTTP) is fine to generate directly
- **CLAUDE.md is mine to maintain** — update it whenever domain terms, architecture decisions, or patterns are agreed on

## Domain (Bodybuilding — Work In Progress)

This is an **event-stormed, domain-driven** design. The ubiquitous language and bounded contexts will emerge through workshops. As they're defined, capture them here.

### Ubiquitous Language

| Term | Definition |
|---|---|
| **Workout Session** | A derived concept — a group of sets performed with less than 3 hours between them. Not stored explicitly; projected from events. |
| **Exercise** | A named movement (e.g. Cable Curl). Has a `form` field (text instructions for proper execution) and muscle group activations. Hardcoded for MVP. |
| **Form** | The proper execution of an exercise — body positioning, alignment, range of motion. Stored as text on `Exercise`. NOT the same as Technique. |
| **Technique** | An intensity technique applied to how individual reps are executed (e.g. Regular, Long-Length Partial, Paused). Deferred to iteration 2. |
| **Set** | One burst of work before rest. Captured via `SetPerformed` event. |
| **Weight** | A numeric value in kg for MVP. Unit support (`kg`/`lbs`) deferred to iteration 2. |
| **Progressive Overload** | Increasing training stimulus over time — more reps at same weight, or more weight. Tracked per exercise across sessions. |
| **Personal Record (PR)** | Best performance for an exercise, tracked by volume. Deferred to iteration 2. |
| **SetPerformed** | Domain event. A set completed by the user. Payload: `exerciseId`, `reps`, `weight` (kg). |
| **SetVoided** | Domain event. Marks a previously performed set as invalid. Payload: `voidedSetId` (references the `SetPerformedId`). User voids then re-logs to correct. |

### Bounded Contexts

| Context | Status | Responsibility |
|---|---|---|
| **Training** | Active — iteration 1 | Recording sets, projecting sessions, statistics |
| **Exercise Catalog** | Active — iteration 1 | Exercises (with form), Techniques, MuscleGroups |
| **Volume Analytics** | Planned — iteration 2 | Weekly volume per muscle group, statistics |
| **Planning** | Future | Auto-generating workout plans |

### Core DDD Rules
- Aggregates protect their own invariants — no cross-aggregate direct calls
- Commands express intent; Domain Events record what happened
- All state changes flow through domain events (event sourcing for auditability)
- Value Objects are immutable; Entities have identity
- No anemic domain model: behavior lives on aggregates, not services
- Repositories are the only way to reconstitute aggregates

## Architecture — Frontend-First DDD

Since this is a frontend-first PWA with all business logic on the client:

- Domain layer: pure TypeScript — zero Angular imports
- Application layer: Angular services orchestrating domain objects, calling projections
- Infrastructure layer: persistence (localStorage now, IndexedDB later), sync adapters
- Presentation layer: Angular components — thin shells, never expose services to templates

**Event store is the source of truth.** Projections (read models) are derived from the event stream.

### Event Sourcing Conventions
- Events are append-only, immutable, never deleted
- All events share base shape via `DomainEvent<TType, TId>` generic interface
- `SetVoided` corrects mistakes — void + re-log, never edit events
- Single event store for all bounded contexts — projections filter by event type
- localStorage for MVP (~3 years of max usage before hitting 5 MB limit); migrate to IndexedDB later
- Snapshots deferred — full replay is fine for years at current usage rates

### Event Type System
- `EventId` — branded base type for all event IDs
- Specific event IDs (e.g. `SetPerformedId`) extend `EventId` for type-safe cross-references
- `DomainEvent<TType extends string, TId extends EventId = EventId>` — generic base interface
- Type guards (`isSetPerformed`, `isSetVoided`) live in `events.ts` alongside event types
- Factory functions (`setPerformed(...)`) live in `events.ts` — encapsulate `type` literal so it's never duplicated

### Projection Pattern
- Pure functions in `*.projections.ts` — take `DomainEvent<string>[]`, return view data
- Services own the signal layer: `computed(() => projectFn(eventsResource.value() ?? []))`
- View models are separate types from domain events — projections return UI-shaped data
- `resource()` used for async data loading; `.reload()` called after each append

### Frontend DDD Folder Structure
```
src/
  catalog/                   ← bounded context first
    domain/                  ← pure TS, no Angular
      exercise.ts
      exercise.repository.ts
      technique.ts
  training/
    domain/
      events.ts              ← SetPerformed, SetVoided, type guards, factories, TrainingEvent union
    application/
      training.service.ts    ← @Service, resource(), computed() signals
      training.projections.ts ← pure projection functions
    presentation/
      total-sets/            ← TotalSetsComponent
  shared/
    events.ts                ← EventId, DomainEvent<T> base types
    event-store.ts           ← EventStore interface
    infrastructure/
      local-storage-event-store.ts
  app/
    home/                    ← HomeComponent (lazy-loaded at '/')
    app.routes.ts
    app.config.ts
```

Path aliases: `@catalog/*`, `@training/*`, `@shared/*` in `tsconfig.json`.

## Angular v22 Best Practices (Non-Negotiable)

- **No `standalone: true`** — it's the default in v20+
- **No `ChangeDetectionStrategy.OnPush`** — it's the default in v22+
- **No `@HostBinding` / `@HostListener`** — use `host: {}` in decorator instead
- **No `ngClass` / `ngStyle`** — use `[class]` / `[style]` bindings
- **No `*ngIf` / `*ngFor` / `*ngSwitch`** — use `@if`, `@for`, `@switch`
- Signals for all state; `computed()` for derived state; never `.mutate()`
- `input()` / `output()` functions, not `@Input` / `@Output` decorators
- `inject()` function, not constructor injection
- `@Service` decorator (v22+) over `@Injectable({providedIn: 'root'})`
- `resource()` for async data loading — not just for HTTP, works with any Promise
- Signal Forms (`@angular/forms/signals`) for all new forms
- `NgOptimizedImage` for all static images (not for inline base64)
- Lazy-load every feature route via `loadComponent`
- Never expose services directly to templates — expose signals/values from the component class

## TypeScript

- Strict mode always on
- Prefer inference; avoid explicit types when obvious
- `unknown` over `any`
- Domain types (Value Objects, Entities, Events) must be fully typed — no shortcuts
- Branded types for IDs: `string & { readonly _brand: 'FooId' }`
- Specific ID types extend base ID types for type-safe cross-references

## Accessibility (Non-Negotiable)

- All AXE checks must pass
- WCAG AA minimum: focus management, color contrast, ARIA attributes

## Testing

- Unit: vitest for domain logic (pure functions, projections, value objects)
- E2E: Playwright for user-facing flows
- Domain layer tests have zero Angular dependencies
- Projection functions are the primary unit test target — pure input/output

## Collaboration Norms

- When starting a new feature, workshop the domain model first (what are the commands? what events result?)
- Before any new component, identify which bounded context it belongs to
- Update the Ubiquitous Language section whenever a new term is agreed on
- Update Bounded Contexts section as they crystallize
