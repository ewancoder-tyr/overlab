import { IsoDateTime } from '@shared/domain/event';
import { SessionProgress } from './exercise-progress';

/**
 * What the stall walk needs of a session: when it started, its setup, and whether it made
 * progress (`up`), started over (`baseline`) or not (`same`, `down`). Sessions from
 * `exerciseProgress` are such entries as they are. Only lifting stalls: cardio's aim is to match
 * last time, not to beat it every time (see "Cardio match rule" in docs/rules/cardio.md).
 */
export type StallEntry = Pick<SessionProgress, 'startedAt' | 'setupId' | 'verdict' | 'easy'>;

/**
 * The stall threshold the app starts with, before analytics is told the user's preference.
 * The preference itself (and its validation) belongs to settings; `app.config.ts` passes it in.
 */
export const DEFAULT_STALL_THRESHOLD = 3;

/**
 * Whether the latest session is the workout in progress and has not (yet) beaten the one before.
 * Such a session is unfinished, so it is neither a miss on the progress chart nor part of a
 * stall: more sets may still come. Once it beats last time (`up`), or starts a new baseline,
 * it is no longer pending: that outcome cannot be undone by the sets still to come.
 */
export function isPending(
    progress: readonly StallEntry[],
    inProgressSince: IsoDateTime | undefined,
): boolean {
    const latest = progress.at(-1);
    return (
        latest !== undefined &&
        latest.startedAt === inProgressSince &&
        latest.verdict !== 'up' &&
        latest.verdict !== 'baseline'
    );
}

/**
 * How many finished sessions in a row, counting back from the latest, failed to beat the one
 * before (`same` or `down`) on the current setup, the setup of the latest session.
 *
 * - An `up` ends the count, and so does a baseline: moving to a new setup restarts the clock,
 *   so swapping the machine is a fix for a stall, not a way to hide it.
 * - A stall never expires: sessions months apart still count.
 * - **An easy session is skipped**: it neither adds to the count nor ends it, whatever its
 *   verdict. Holding 10, 10, 10 easy push-ups is the plan, not a stall, and an easy day between
 *   three hard sessions without progress does not excuse them.
 * - `inProgressBeaten`: the session in progress has already beaten the last one, which ends
 *   the stall at once, while the lifter is still at the gym.
 *
 * @param progress - finished sessions only, oldest first (drop a pending one, see `isPending`).
 */
export function stalledFor(progress: readonly StallEntry[], inProgressBeaten: boolean): number {
    if (inProgressBeaten) {
        return 0;
    }
    const setupId = progress.at(-1)?.setupId;
    const onSetup = progress.filter((entry) => entry.setupId === setupId && !entry.easy);
    const firstProgress = onSetup
        .toReversed()
        .findIndex((entry) => entry.verdict === 'up' || entry.verdict === 'baseline');
    return firstProgress === -1 ? onSetup.length : firstProgress;
}

/** A stall is `threshold` sessions in a row without progress. A threshold of 0 is off. */
export function isStalled(count: number, threshold: number): boolean {
    return threshold > 0 && count >= threshold;
}

/**
 * The count for an exercise's whole history, the session in progress included: a pending one
 * is left out, one that already beat the last one (or started a new setup) ends the stall.
 *
 * @param progress - every session, oldest first, as from `exerciseProgress`.
 */
export function stalledForNow(
    progress: readonly StallEntry[],
    inProgressSince: IsoDateTime | undefined,
): number {
    const latest = progress.at(-1);
    const latestInProgress = inProgressSince !== undefined && latest?.startedAt === inProgressSince;
    if (!latestInProgress) {
        return stalledFor(progress, false);
    }
    // An easy session in progress is skipped like a finished one: beating last time the easy
    // way does not end a stall.
    const beaten = !latest.easy && !isPending(progress, inProgressSince);
    return stalledFor(progress.slice(0, -1), beaten);
}
