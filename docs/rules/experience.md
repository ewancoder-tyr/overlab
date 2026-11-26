# Experience

Gamification is a game laid over the log, nothing more (`gamification/domain/experience.ts`).
It reads sets and cardio through training and judges them with the analytics rules as they are.

- **Absolute weight earns nothing.** Loads are in kg or lb as entered, per hand, signed, and a leg
  press moves ten times what a curl does. Weight pays through progress: the bonuses below.
- **A working set is 10 XP**, 12 when taken to failure (kept small: effort is one self-reported
  tap and failure on every heavy set is no habit to pay for), a light set the light set weight
  of 10, an easy set 5 (fixed), a warm-up 0. A mixed set
  is split by each exercise's share of its reps, as in weekly volume. Cardio is 1 XP a minute.
- **Bonuses:** a session beaten (`up`) +30, once; the first `up` after a stall (by the stall
  threshold) +50 more. **Every set** that is a new best when done: a weight record +50, a rep
  record +25, several in one workout included. Cardio, per session: matched or beaten +30, a
  record +50.
- **Easy and standalone sets earn by the same rules.** An easy session gets the +30 only for
  beating last time, never for matching it (the same ten easy push-ups every morning must not
  out-earn sets taken to failure). Standalone sessions earn their bonuses within their own
  history. In the experience history, standalone sets outside a workout's span are entries of
  their own, a run of them less than 3 hours apart making one.
- **Records here are moments, not standings:** a session earns its bonus when it set a new best on
  its setup at the time. A later, heavier set does not take earned experience away. The first
  session on a setup is the baseline and earns no record bonus.
- **Starting from scratch is a `ProgressReset`.** Only sets (by their time) and session bonuses
  (by the time of the session's last set) after the latest one count. Comparisons still look at
  all of history: a reset wipes experience, not strength.
- **Everything is derived again**, so tuning the numbers recomputes everyone, and voiding a set
  takes its experience back. The 0.3.0 cardio sets and unknown exercises earn nothing.
- **Off means not computed:** experience is a `computed` read only by the Week page (a slim
  level summary first, so the volume gauges stay in view, and the details card last) and the
  shell's animations, all shown only while the preference is on. The
  exercise list follows the training focus (`isShown`).
- **Earning is celebrated** (`experienceGain`, `ExperienceCelebrationComponent` in the shell): a
  rising "+10 XP" with the exercise (or its new level) and each bonus named with its amount ("Weight
  record +50", `byReason`), bigger and longer with a bonus, and a "Level up" burst for a new
  character level, with its title. Only a gain of whole points counts; a loss (void, reset) or the
  first reading after start-up shows nothing. A sync pull that brings sets from another device is a
  gain too. It is an overlay that takes no space and no taps, so nothing on the page moves.
- **The experience history** (`/experience`, from the card's History link) lists every workout
  that earned anything, newest first, 20 at a time: when, how much, the character's level
  reached, and per exercise each reason with its count and amount ("Sets ×4 +40"). It only
  regroups the ledger the totals are summed from (`Experience.entries`, `experienceHistory`),
  so it always adds up to the total and follows every rule and the reset.
- **Two hairlines frame every page** (`ExperienceLinesComponent`): along the top edge the level
  progress of the exercise on screen (its logging screen, else the current exercise; none
  otherwise), along the bottom edge the character's. Fixed, 3 px, `--accent-ink`.
