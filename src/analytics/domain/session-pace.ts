import { Catalog } from '@catalog/domain/catalog';
import { RepGroup, SetPerformed, isEasySession } from '@training/domain/set';
import { ExerciseSession } from '@training/domain/workout';
import { IsoDateTime } from '@shared/domain/event';
import { compareWork } from './progression';

/**
 * Where a session in progress stands against the previous one, for the logging screen:
 * "how am I doing so far, and what does the next set need to be?"
 */
export interface SessionPace {
    /** When the session being compared against started. Absent on a new baseline. */
    readonly previousStartedAt?: IsoDateTime;
    /** The previous session's working sets, in order. Empty on a new baseline. */
    readonly previous: readonly SetPerformed[];
    /** This session's working sets so far, in order. */
    readonly current: readonly SetPerformed[];
    /**
     * The sets done so far against the same number of sets from last time: after two sets, your
     * two against last time's first two. Absent before the first set and on a new baseline.
     */
    readonly soFar?: 'up' | 'same' | 'down';
    /**
     * The sets done so far against the WHOLE previous session, which is how a session is finally
     * judged. `up` means last time is already beaten, whatever happens next.
     */
    readonly session?: 'up' | 'same' | 'down';
    /**
     * Today's session is an easy one so far (every working set easy): level with last time is
     * then a success, not a miss. See "Easy session rule" in docs/rules/training.md.
     */
    readonly easy: boolean;
    /** The set from last time that the next set lines up with. Absent once they are used up. */
    readonly next?: SetPerformed;
}

const working = (sets: readonly SetPerformed[]): SetPerformed[] =>
    sets.filter((set) => set.kind === 'working');

const repGroupsOf = (sets: readonly SetPerformed[]): RepGroup[] =>
    sets.flatMap((set) => set.repGroups);

/**
 * Projection: the pace of `current` against the most recent earlier session on the same setup.
 *
 * It applies the progression rule (see `compareWork`) twice: to equal numbers of sets, for the
 * running "ahead or behind", and to everything, for the final verdict. Warm-ups are ignored.
 *
 * @param current - the session in progress, or `undefined` before its first set.
 * @param earlier - sessions of the same exercise before it, oldest first.
 */
export function sessionPace(
    current: ExerciseSession | undefined,
    earlier: readonly ExerciseSession[],
    catalog: Catalog,
): SessionPace {
    const currentWorking = working(current?.sets ?? []);
    // Progression is compared only within one setup. The setup in question is the one in use
    // now, or, before the first set, the one used last time.
    const setupId = (currentWorking.at(-1) ?? working(earlier.at(-1)?.sets ?? []).at(-1))?.setupId;
    const onSetup = (sets: readonly SetPerformed[]): SetPerformed[] =>
        working(sets).filter((set) => set.setupId === setupId);

    const currentSets = onSetup(currentWorking);
    const previousSession = earlier.findLast((session) => onSetup(session.sets).length > 0);
    if (previousSession === undefined) {
        return { previous: [], current: currentSets, easy: isEasySession(currentSets) };
    }

    const previousSets = onSetup(previousSession.sets);
    const next = previousSets[currentSets.length];
    const compared =
        currentSets.length === 0
            ? {}
            : {
                  soFar: compareWork(
                      repGroupsOf(currentSets),
                      repGroupsOf(previousSets.slice(0, currentSets.length)),
                      catalog,
                  ),
                  session: compareWork(
                      repGroupsOf(currentSets),
                      repGroupsOf(previousSets),
                      catalog,
                  ),
              };

    return {
        previousStartedAt: previousSession.workoutStartedAt,
        previous: previousSets,
        current: currentSets,
        easy: isEasySession(currentSets),
        ...compared,
        // Spread conditionally: with `exactOptionalPropertyTypes` an optional property must be
        // absent rather than explicitly `undefined`.
        ...(next === undefined ? {} : { next }),
    };
}
