# Releases

`src/app/release-notes.json` lists every version with its changes, newest first, starting with
1.0.0 (the betas before it are summed up in `docs/history.md`). It is the one source for the
"What's new" page (`/whats-new`, linked from Settings) and for the "new version" notification.

Each entry has its `summary` and `changes` in every language (`{ "en": ..., "ru": ... }`).

## Deploying

**Every push to `main` is deployed** by `.github/workflows/deploy.yml`: it runs `pnpm check` and
the server's tests, builds the two images (the site, the Go service) and pushes them to the
GitHub container registry, then tells the server over ssh which commit to run. The server checks
the repository out at that commit and runs `compose.yml` with the images of that commit. A pull
request is only checked. Nothing is deployed from a working tree.

The ssh details are secrets of the GitHub repository. Everything else, including the service's
settings (`VAPID_SUBJECT`, `GOOGLE_CLIENT_ID`), is in `compose.yml`.

## Releasing

**A deployment is not a release.** A push that leaves the newest entry of the release notes as it
was changes the app quietly: no version, no notification.

**A release is a push that adds a version at the top of `src/app/release-notes.json`.** Nothing
else has to be run:

- The release notes are copied into the Go service's image when it is built.
- Two minutes after it starts, the service reads their newest entry and, if it has not announced
  that version yet, sends every device "OverLab 1.2.0 is out" with the entry's `summary`, each in
  its own language (`reminder-server/announce.go`; the wording around the summary lives there).
  The delay lets the site, replaced in the same deployment, come up first.
- The service remembers the last version it announced, so restarts and later deployments
  without a new entry notify nobody. Only a version newer than that one is announced, so
  rolling back to an older commit announces nothing either.
- There is no route or command to announce by hand, so nothing can trigger it from outside.
- Only devices with reminders on can be told.

**A release is a decision, never a side effect of an ordinary change.** To make one, gather
everything that changed since the last release (`changelog.md` first, then git history and the
changes themselves), write it up for users as a new entry at the top of the release notes, clear
`changelog.md` back to its heading, and increment the middle number: 1.1.0, 1.2.0, and after
1.9.0 comes 1.10.0, then 1.11.0. Set the same version in `package.json`, then push.

**`changelog.md` collects the changes for the next release.** After every change, however small,
add a short line to it, written for users. The file is git-ignored and local only. It holds only
what has happened since the last release.

## In the app

When a newer version has been downloaded, the shell shows "A new version is ready" with an
Update button (`SwUpdate` in `app.component.ts`). It never reloads by itself, except on the
"What's new" page: the notification opens that page in the old version, which cannot list the
news until it has switched over.
