---
paths:
  - 'reminder-server/**'
---

# The Go service

- Its job is fixed: reminders and release notices, plus the `cloudsync` and `leaderboard`
  packages. Do not add anything else to it.
- `cloudsync` and `leaderboard` import nothing from each other or from `main`; `main.go` wires
  them. Each must stay removable by deleting its folder and its lines in `main.go`.
- The server never interprets events and has no user accounts of its own.
- `schedule.go` must stay identical in behaviour to `src/shared/domain/schedule.ts`, with
  tests for the same cases on both sides.
- Wordings live only in Go, the numbers only in TypeScript. Every language has the same number of
  wordings. Russian wordings use no gendered forms (see the comment on `russian` in `wording.go`).
- Only `/api/reminders/` and `/api/sync/` are reachable from the internet (`deploy/nginx.conf`).
- A new version is announced by the service itself after it starts, from the release notes baked
  into its image (`announce.go`). Do not add a route or a command for it.
- Run `go test ./...` in `reminder-server/` after every change. Read `docs/reminders.md`,
  `docs/sync.md` or `docs/leaderboard.md` for the part you are changing.
