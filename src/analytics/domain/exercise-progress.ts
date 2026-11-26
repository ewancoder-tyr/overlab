import { Catalog } from '@catalog/domain/catalog';
import { SetupId } from '@catalog/domain/exercise';
import { IsoDateTime } from '@shared/domain/event';
import { Load, RepGroup, SetPerformed, isEasySession } from '@training/domain/set';
import { ExerciseSession } from '@training/domain/workout';
import { comparableLoad, compareWork } from './progression';

/** Whether a session's work on the exercise beat the previous session's. */
export type SessionVerdict = 'up' | 'same' | 'down' | 'baseline';

/** One session of an exercise as a whole: the point plotted on the progress chart. */
export interface SessionProgress {
    readonly startedAt: IsoDateTime;
    /** The working sets of the session, in the order performed. */
    readonly sets: readonly SetPerformed[];
    readonly setupId: SetupId | undefined;
    /** The heaviest load used for the leading technique, as entered. */
    readonly load: Load;
    /** The same load in kilograms, for plotting sessions logged in different units together. */
    readonly loadInKilograms: number;
    /** Total reps of the leading technique over all working sets. */
    readonly reps: number;
    readonly verdict: SessionVerdict;
    /**
     * An easy session: every working set was easy. Its aim is to match last time (`same` is a
     * success, as for cardio), and the stall count skips it. See "Easy session rule".
     */
    readonly easy: boolean;
}

/** How consistently the exercise has been progressing recently. */
export interface ProgressSummary {
    /** Sessions that could be compared with a previous one (everything except baselines). */
    readonly compared: number;
    /** How many of those beat the session before. */
    readonly improved: number;
    /** Consecutive improved sessions up to and including the latest. */
    readonly streak: number;
}

/**
 * The two numbers that represent a session on the chart, both for its leading technique (the
 * first in catalog order that was used, normally full reps): the heaviest load, and total reps.
 */
function headline(
    repGroups: readonly RepGroup[],
    catalog: Catalog,
): { readonly load: Load; readonly reps: number } | undefined {
    const rank = (technique: string): number => {
        const index = catalog.techniques.findIndex((entry) => entry.id === technique);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    const leading = repGroups.toSorted((a, b) => rank(a.technique) - rank(b.technique))[0]
        ?.technique;
    const groups = repGroups.filter((group) => group.technique === leading);
    const heaviest = groups.toSorted((a, b) => comparableLoad(b.load) - comparableLoad(a.load))[0];
    return heaviest === undefined
        ? undefined
        : { load: heaviest.load, reps: groups.reduce((sum, group) => sum + group.reps, 0) };
}

/**
 * Projection: an exercise's history as one point per session, each judged against the previous
 * session on the same setup. This is the "am I really doing more than last time?" view.
 *
 * A session is judged as a whole, on everything done for the exercise in its working sets: with
 * 8, 8, 6, 5 at 22 kg last time, today needs at least one more rep in total (8, 8, 6, 6) or some
 * reps at a heavier load to count as `up`. How the reps are split across sets does not matter,
 * so 9, 8, 6, 4 counts as the same work. See `compareWork` for the exact rule.
 *
 * @param sessions - one exercise's sessions, oldest first.
 */
export function exerciseProgress(
    sessions: readonly ExerciseSession[],
    catalog: Catalog,
): readonly SessionProgress[] {
    const result: (SessionProgress & { readonly work: readonly RepGroup[] })[] = [];
    for (const session of sessions) {
        const sets = session.sets.filter((set) => set.kind === 'working');
        const work = sets.flatMap((set) => set.repGroups);
        const summary = headline(work, catalog);
        if (summary === undefined) {
            continue; // Warm-ups only: nothing to plot.
        }
        // A session belongs to the setup of its first working set. Comparing within a setup
        // only is what makes a new machine a new baseline rather than a drop.
        const setupId = sets[0]?.setupId;
        const previous = result.findLast((entry) => entry.setupId === setupId);
        result.push({
            startedAt: session.workoutStartedAt,
            sets,
            setupId,
            work,
            load: summary.load,
            loadInKilograms: comparableLoad(summary.load),
            reps: summary.reps,
            verdict:
                previous === undefined ? 'baseline' : compareWork(work, previous.work, catalog),
            easy: isEasySession(sets),
        });
    }
    return result;
}

export function summariseProgress(progress: readonly SessionProgress[]): ProgressSummary {
    const compared = progress.filter((entry) => entry.verdict !== 'baseline');
    // Count back from the latest session while each one improved.
    const firstMiss = compared.toReversed().findIndex((entry) => entry.verdict !== 'up');
    return {
        compared: compared.length,
        improved: compared.filter((entry) => entry.verdict === 'up').length,
        streak: firstMiss === -1 ? compared.length : firstMiss,
    };
}
