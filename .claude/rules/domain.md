---
paths:
  - 'src/**/domain/**'
---

# Domain code

- Pure TypeScript: no Angular, no browser APIs, imports from other `domain/` folders only.
- Find the rule you are touching in `docs/rules/` (or `docs/glossary.md`) and read it first. A
  change to a rule, a term or an event is workshopped with me, then written there.
- Events are a permanent contract (`docs/architecture.md`, "Event rules"). Built-in catalog ids
  are stored in events forever: never rename or reuse one.
- Projections skip unknown event types and unknown exercise ids, and never depend on the order
  events were stored in.
- Messages are returned in every language (`Result`'s error is a `LocalText`); words a projection
  produces take the language as a parameter. Russian plurals go through `plural()`.
- Ask `isCardio()`, `cardioKindOf()` and `isShown()`; never test involvements or ids yourself.
- Each rule gets a vitest spec beside the file, with a test that names the rule.
