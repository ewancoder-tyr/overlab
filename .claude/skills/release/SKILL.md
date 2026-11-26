---
name: release
description: Prepare a new version of OverLab (version bump and release notes in both languages). Use only when explicitly asked for a new version or a release, never for an ordinary change.
---

# Releasing a new version

A release is a push to `main` that adds a version at the top of `src/app/release-notes.json`:
the pipeline deploys it and the server then notifies every device, once. Background is in
`docs/releases.md`. Your part is to prepare that push; I commit and push.

1. Gather what changed since the last release: `changelog.md` first, then `git log` and the
   working tree's diff (it is often uncommitted).
2. Pick the version: increment the middle number of the newest entry in
   `src/app/release-notes.json` (1.1.0, 1.2.0, and after 1.9.0 comes 1.10.0). Always three parts.
3. Add an entry at the top of `src/app/release-notes.json`: `version`, today's `date`, a `summary`
   and `changes`, each in `en` and `ru`, written for users. The summary is one sentence of at
   most 250 characters (it is the notification's text); both languages list the same changes,
   one for one.
4. Set the same version in `package.json`.
5. Clear `changelog.md` back to its heading.
6. Run `pnpm lint`, `pnpm format` and `pnpm test`.
7. Say that it is ready to push, and that the push will notify every device. Commit or push only
   when asked.
