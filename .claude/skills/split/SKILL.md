---
name: split
description: Split the finished, uncommitted work in the working tree into feature branches of small, reviewable commits. Use when asked to "split the work", "carve the commits" or "prepare the branches", never on your own initiative.
---

# Splitting finished work into reviewable commits

The work is implemented first and committed afterwards (`CLAUDE.md`, "Commits and branches").
This is the "afterwards": the working tree holds finished, uncommitted changes, and your part is
to turn them into a history that reads as a sequence of small, logical steps. I merge.

## 1. Understand what is there. Change nothing yet.

- Read `CLAUDE.md` ("Commits and branches"). If `feature-desc.md` exists at the repo root, read
  it: it is the notes of the session that did the work. Otherwise use this conversation,
  `changelog.md` and the docs that changed.
- Look at everything: `git status`, `git diff` (and `git diff --cached`), and the untracked
  files. A file that moved shows as a deletion plus an untracked file.
- Run `pnpm lint`, `pnpm format`, `pnpm test` and `pnpm build` (and `go test ./...` in
  `reminder-server/` if it changed). If the end state is not clean, stop and say so: there is
  nothing to split until it is.

## 2. Propose the split, then wait for me.

Tell me, and do not create a branch or a commit before I agree:

1. **Which features are in the tree**, and a name for each.
2. **The branches**: `feature/<name>` for each. Several are stacked, each branching from the one
   before, never side by side from `main`. Related features may share a branch.
3. **The commits on each branch, in order**, each with a one-line message, the files (or parts
   of files) in it, and why it stands alone. The order, where it applies:
   - refactors with no change in behaviour (moves and renames alone, so the diff is trivial),
   - removals,
   - additions (domain and its specs before the screens that use it),
   - the server,
   - docs,
   - a release (the release-notes entry and the version), as its own last commit.
4. **What cannot be separated**: steps that must share a commit to stay green, and files that
   several steps touch.

Anything unrelated to the features (a change to `CLAUDE.md`, a skill, tooling) gets its own
commit or branch; ask which.

## 3. Carve, once we agree.

- Create the branch from the current `HEAD`. The working tree comes along untouched.
- For each commit, stage only what belongs to it. Stage part of a file with a patch
  (`git apply --cached` of a diff you wrote; `git add -p` is interactive and does not work
  here). Record a move as a rename: stage the old path's deletion and the new path together.
- **Each commit must pass on its own.** Check the staged state, not the working tree:
  `git stash push --keep-index --include-untracked`, run lint, format check, tests (and the
  build when a template changed, since `pnpm test` does not type-check templates), then
  `git stash pop`. If a state does not pass, move the missing piece into it or merge two steps,
  and tell me which.
- When a step needs a version of a file that the final tree no longer has (a file renamed in
  step 1 and deleted in step 5), recreate that intermediate version, or fold the change into
  the later step and tell me.
- Commit with a message that says what the step does and why it is a step. Commits are
  GPG-signed and I enter the passphrase: never pass `--no-gpg-sign`, and stop if signing fails.
  No co-author or tool attribution lines.
- **Never commit to `main`, never merge, never push.**

## 4. Finish.

- The last commit must leave nothing behind: `git status` is clean apart from files that are
  deliberately not committed (`feature-desc.md`, anything git-ignored). If the work was once
  committed as a whole, `git diff <that commit>` must show only what was changed since.
- Report the branches and their commits (`git log --oneline main..feature/<name>`), which
  steps were merged or reordered and why, and anything left uncommitted.
- Say that it is ready for me to review and merge with `--no-ff`, and that merging to `main`
  deploys.
