---
paths:
  - 'src/**/presentation/**'
  - 'src/app/**'
  - 'src/**/*.scss'
  - 'src/**/*.html'
---

# Screens and styles

Read `docs/design.md` before changing how something looks or moves, and `docs/languages.md`
before adding text.

- Components are thin: bind signals, call services. Logic that can be a pure function goes
  beside the page (as `back-navigation.ts`) or into a domain projection, with a spec.
- Paint only with the tokens of `src/styles.scss`. Anything drawn _with_ the accent (text, lines,
  outlines) uses `--accent-ink`, never `--accent`: in the light scheme yellow is only a filled
  block with black on it.
- Green and red mean better and worse, purple a weight record, orange a warning. Do not use them
  for anything else.
- Texts live in the component's `TEXT` table (`{ en, ru }`) and are read through
  `translations(TEXT)`. A missing translation must stay a compile error.
- The logging quick path is one-thumb: no new required fields, no typing (cardio excepted).
  Nothing on the logging screen moves when a set is logged.
- On phones navigation never pushes history (`docs/design.md`, "Known platform issues").
