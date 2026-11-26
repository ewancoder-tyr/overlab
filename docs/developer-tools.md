# Developer tools

Tools for trying the app out and tracking down problems, kept out of everyday use.

## Test date

`Clock` (`shared/application/clock.service.ts`) is the app's only source of the current time; never
call `new Date()` for "now" elsewhere (its own `realTime()` is the one exception, for what must
carry the device's real time: the `recordedAt` of an event logged in the past, see
`docs/rules/history.md`, and the date of an exported backup). The developer settings can set a test
date, which shifts that clock so the whole app, including the timestamps of new events, believes it
is another day. It is held in memory only and the shell shows a warning while it is on. Loading demo
data, erasing the device and deleting everything all need a confirming second tap.

## Developer settings

Demo data, the test date, a test notification and diagnostics. They are the last card of Settings,
hidden until the About heading is tapped 10 times (`DeveloperMode`, in memory, so a reload hides
them again). While a test date or diagnostics is on they stay visible, so whatever is on can be
switched off. The Data page holds only the user's own data: export, import, Google sign-in and
erasing.

## Diagnostics

An optional trace of what the app and the browser do on one device, for problems that only show
on a phone (`src/diagnostics/`). It is switched on in the developer settings.

- **The switch is per device, not a preference.** It and the trace live in `localStorage`, never
  in the event log: nothing is synced or backed up, and nothing else in the app reads them.
- **Off means off.** Probes start when it is switched on and remove every listener when it is
  switched off, so the app runs exactly as without it.
- **A probe watches one thing** (`TraceProbe`: taps, page switches with their render and frame,
  long tasks, slow inputs, errors, visibility). Adding one is a class in `browser-probes.ts`
  and a line in `provideDiagnostics()`.
- **The trace is real time, to the millisecond**, never the test date. Copy puts the whole trace
  on the clipboard for a bug report.
