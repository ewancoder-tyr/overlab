import { Catalog } from '@catalog/domain/catalog';
import { Load, RepGroup, SetId, SetPerformed } from '@training/domain/set';
import { ExerciseSession } from '@training/domain/workout';

/**
 * How a set compares with the matching set of the previous session.
 * - `baseline`: nothing to compare with (first time, or first time on this setup).
 * - `extra`: the previous session had fewer sets, so this one is additional work.
 */
export type Progression = 'up' | 'same' | 'down' | 'baseline' | 'extra';

const KG_PER_LB = 0.45359237;

/** Loads are compared in kilograms, rounded so that float noise cannot create fake differences. */
export function comparableLoad(load: Load): number {
    const kilograms = load.unit === 'kg' ? load.value : load.value * KG_PER_LB;
    return Math.round(kilograms * 1000) / 1000;
}

/**
 * Reduces a list of rep groups to "reps per load" for each (technique, exercise) pair.
 * The outer key embeds the technique's position in the catalog so that sorting the keys puts
 * full reps before partials.
 */
function summarise(
    repGroups: readonly RepGroup[],
    catalog: Catalog,
): Map<string, Map<number, number>> {
    const summary = new Map<string, Map<number, number>>();
    for (const group of repGroups) {
        const techniqueIndex = catalog.techniques.findIndex(
            (technique) => technique.id === group.technique,
        );
        // Unknown techniques (from a newer app version) sort last.
        const rank = techniqueIndex === -1 ? 9999 : techniqueIndex;
        const key = `${String(rank).padStart(4, '0')}|${group.technique}|${group.exerciseId}`;

        const repsByLoad = summary.get(key) ?? new Map<number, number>();
        const load = comparableLoad(group.load);
        repsByLoad.set(load, (repsByLoad.get(load) ?? 0) + group.reps);
        summary.set(key, repsByLoad);
    }
    return summary;
}

/**
 * The progression rule (docs/rules/progression.md, "Progression rule"), applied to any two amounts
 * of work: two single sets, or everything done for an exercise in two sessions.
 *
 * Walk through techniques in catalog order and, within a technique, through loads from heaviest
 * to lightest. The first place where the rep counts differ decides the result.
 *
 * This one rule covers every case:
 * - more reps at the same load: up
 * - a heavier load than before: the previous work has 0 reps at that load, so up
 * - fewer full reps but more partials: full reps are compared first, so down
 * - assisted bodyweight work: -15 is heavier than -20, so less assistance is up
 */
export function compareWork(
    current: readonly RepGroup[],
    previous: readonly RepGroup[],
    catalog: Catalog,
): 'up' | 'same' | 'down' {
    const currentSummary = summarise(current, catalog);
    const previousSummary = summarise(previous, catalog);
    const keys = [...new Set([...currentSummary.keys(), ...previousSummary.keys()])].sort();

    for (const key of keys) {
        const currentReps = currentSummary.get(key) ?? new Map<number, number>();
        const previousReps = previousSummary.get(key) ?? new Map<number, number>();
        const loads = [...new Set([...currentReps.keys(), ...previousReps.keys()])].sort(
            (a, b) => b - a,
        );

        for (const load of loads) {
            const difference = (currentReps.get(load) ?? 0) - (previousReps.get(load) ?? 0);
            if (difference !== 0) {
                return difference > 0 ? 'up' : 'down';
            }
        }
    }
    return 'same';
}

/** Compares two single sets. */
export function compareSets(
    current: SetPerformed,
    previous: SetPerformed,
    catalog: Catalog,
): 'up' | 'same' | 'down' {
    return compareWork(current.repGroups, previous.repGroups, catalog);
}

/** Sets on the exercise's default setup have no `setupId`; give them a stable map key. */
function setupKey(set: SetPerformed): string {
    return set.setupId ?? '';
}

function workingSetsBySetup(session: ExerciseSession): Map<string, SetPerformed[]> {
    const bySetup = new Map<string, SetPerformed[]>();
    for (const set of session.sets) {
        if (set.kind !== 'working') {
            continue;
        }
        const sets = bySetup.get(setupKey(set)) ?? [];
        sets.push(set);
        bySetup.set(setupKey(set), sets);
    }
    return bySetup;
}

/**
 * Progression of every working set in `session`.
 *
 * The n-th working set on a setup is compared with the n-th working set on the same setup in the
 * most recent earlier session that used that setup. Comparing only within a setup is what makes a
 * move to a different machine a new baseline instead of a false drop.
 *
 * @param earlierSessions - sessions of the same exercise before `session`, oldest first.
 */
export function sessionProgression(
    session: ExerciseSession,
    earlierSessions: readonly ExerciseSession[],
    catalog: Catalog,
): ReadonlyMap<SetId, Progression> {
    const result = new Map<SetId, Progression>();
    const earlierBySetup = earlierSessions.map(workingSetsBySetup);

    for (const [setup, sets] of workingSetsBySetup(session)) {
        // `findLast` searches from the newest session backwards.
        const previousSets = earlierBySetup.findLast((bySetup) => bySetup.has(setup))?.get(setup);

        sets.forEach((set, index) => {
            const previous = previousSets?.[index];
            if (previousSets === undefined) {
                result.set(set.id, 'baseline');
            } else if (previous === undefined) {
                result.set(set.id, 'extra');
            } else {
                result.set(set.id, compareSets(set, previous, catalog));
            }
        });
    }
    return result;
}
