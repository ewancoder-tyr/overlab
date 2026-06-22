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
- Exception: scaffolding config files, CLAUDE.md updates, or truly mechanical boilerplate is fine to generate

## Domain (Bodybuilding — Work In Progress)

This is an **event-stormed, domain-driven** design. The ubiquitous language and bounded contexts will emerge through workshops. As they're defined, capture them here.

### Ubiquitous Language
*(populate as terms are workshopped)*

### Bounded Contexts
*(populate as contexts are identified — e.g., Training, Nutrition, Progress, Planning)*

### Core DDD Rules
- Aggregates protect their own invariants — no cross-aggregate direct calls
- Commands express intent; Domain Events record what happened
- All state changes flow through domain events (event sourcing for auditability)
- Value Objects are immutable; Entities have identity
- No anemic domain model: behavior lives on aggregates, not services
- Repositories are the only way to reconstitute aggregates

## Architecture — Frontend-First DDD

Since this is a frontend-first PWA with all business logic on the client:

- Domain layer: pure TypeScript classes/value objects — zero Angular imports
- Application layer: Angular services orchestrating domain objects, dispatching/sourcing events
- Infrastructure layer: persistence (IndexedDB / localStorage), sync adapters
- Presentation layer: Angular components — thin shells over application services

**Event store is the source of truth.** Projections (read models) are derived from the event stream. This keeps the door open for a future backend that replays the same events for analytics.

### Event Conventions
- Past tense, noun-first: `WorkoutLogged`, `SetCompleted`, `WeightRecorded`
- Immutable value objects: `{ type, aggregateId, occurredAt, payload }`
- Never mutate events after writing

### Frontend DDD Folder Structure (proposed, refine as we go)
```
src/
  domain/          ← pure TS, no Angular
    training/      ← one folder per bounded context
      workout.ts
      workout.events.ts
      workout.repository.ts  ← interface only
  application/
    training/
      workout.service.ts     ← Angular @Service, uses domain + infra
  infrastructure/
    training/
      workout.idb-repository.ts
  presentation/
    training/
      workout-log/           ← feature components
```

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
- Signal Forms (`@angular/forms/signals`) for all new forms
- `NgOptimizedImage` for all static images (not for inline base64)
- Lazy-load every feature route

## TypeScript

- Strict mode always on
- Prefer inference; avoid explicit types when obvious
- `unknown` over `any`
- Domain types (Value Objects, Entities, Events) must be fully typed — no shortcuts

## Accessibility (Non-Negotiable)

- All AXE checks must pass
- WCAG AA minimum: focus management, color contrast, ARIA attributes

## Testing

- Unit: vitest for domain logic (pure functions, aggregates, value objects)
- E2E: Playwright for user-facing flows
- Domain layer tests have zero Angular dependencies

## Collaboration Norms

- When starting a new feature, workshop the domain model first (what are the commands? what events result?)
- Before any new component, identify which bounded context it belongs to
- Update the Ubiquitous Language section whenever a new term is agreed on
- Update Bounded Contexts section as they crystallize
