# Progression, records and stalls

## Progression rule

One rule compares any two amounts of work, whether two sets or two whole sessions of an exercise.
Go technique by technique in the catalog's technique order (full reps first) and, within a
technique, load by load from heaviest to lightest, comparing the total reps. The first difference
found decides: more reps there is better, fewer is worse.

- More reps at the same load is better. Any reps at a heavier load is better.
- Extra partials never compensate for fewer full reps.
- **A session is judged as a whole.** After 8, 8, 6, 5 at 22 kg, the next session needs at least
  8, 8, 6, 6 (one more rep in total) or reps at a heavier load. The split across sets does not
  matter: 9, 8, 6, 4 is the same work. Warm-up sets are ignored.
- Individual sets are also compared, the n-th working set with the n-th of last time, only to
  colour the set display.
- The first session (or set) on a new setup is a new baseline: neither up nor down.
- **Pace**, shown while logging, is the same rule applied mid-session: the sets done so far
  against the same number of sets from last time (ahead, level or behind). The session is beaten
  as soon as the work so far exceeds the whole of last session.

## Records and stall rule

Both are derived from the log, follow the progression rule and its scoping (same exercise, same
setup, working sets only, non-voided), and add nothing to the quick path
(`analytics/domain/records.ts`, `analytics/domain/stall.ts`).

- **A set is judged on its top load and the full reps at it:** of its rep groups of that exercise
  with the first technique in catalog order, the heaviest load (`comparableLoad`) and the reps at
  it. Partials never make or break a record. In a mixed-exercise set each exercise's rep groups
  count for that exercise only.
- **Records are standings, not events.** At any time a setup has exactly one weight record (the
  first set at its heaviest top load, any reps) and one rep record (the first set with the most
  reps at that load); one set may hold both (`both`). Doing the heaviest load again for more reps
  moves only the rep record; a heavier set takes both. 100 reps at 30 kg never beat 40 reps at
  40 kg. Ties stay with the earlier set; order is `occurredAt`, then `id`. Everything is derived
  again from the log, so a beaten record simply stops showing.
- **A setup with a single session has no records** (nor a record table). From its second
  session on, the records may be anywhere in its history, the first session included.
- **A stall counts back from the latest finished session on the current setup** while the
  verdict is `same` or `down`; an `up` or a baseline ends the count. It is a stall when the
  count reaches the threshold; 0 is off. Stalls never expire.
- **The session in progress** is ignored while it is behind or level (`isPending`, also used by
  the progress chart); once it beats the last one, the stall ends at once.
- Records show as a flexed arm on the top edge of today's tiles (only when today's set holds one),
  purple for the weight record (or both) and green for the rep record (cardio: purple for an
  amount, green for speed or burn rate), and a Records card on the statistics page;
  stalls as an orange `STALLED` tag on the Train page, a line on the statistics page and an
  orange dot on the Week page's gauge of each muscle group they mark (see below). Neither
  shows on the logging screen's history row. Cardio has its own records (below) and no stalls.

## Stalled muscle group rule

The Week page puts the dose (weekly volume) next to the response (stalls), so a muscle group
whose work is not paying off says so (`analytics/domain/muscle-stall.ts`). A projection over
weekly volume and the stall rule as they are; nothing is stored or asked.

- **One stalled exercise is enough to mark a muscle group.** The aim is to improve on every
  exercise every time. There is no mark for progress: something nearly always goes up.
- **Only the muscle groups the exercise trains strongly enough** (involvement above the stall
  involvement, default more than half). A stalled bench press marks chest, not the triceps that
  only help, so one stall does not turn three gauges orange.
- **Only exercises trained in the target window count** (they are in the volume breakdown).
  Stalls never expire, and a dropped exercise must not mark its muscle forever.
- **The stall rule applies unchanged:** its threshold (0 turns this off too), setup scoping, and
  the session in progress ending a stall at once. Cardio never stalls, so it marks nothing.
- **Advice follows the volume status.** Under target: add sets. Within or over while another
  direct exercise still progresses: only the stalled exercise is named, because the muscle is
  responding. Within with all of them stalled: room to add; over with all stalled: back off.
  Not stalled: no advice, whatever the volume.
- **One line under the summary**, for the most pressing (add sets with the largest shortfall,
  then back off, room to add, the exercise). Each gauge opens to its volume breakdown, stalled
  exercises tagged, and for add sets or room to add up to three favorites that would train it
  directly.
