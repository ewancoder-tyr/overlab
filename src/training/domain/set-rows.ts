import { TechniqueId } from '@catalog/domain/technique';
import { Load, SetPerformed } from './set';

/** Reps of one technique within a set, summed over its rep groups. */
export interface TechniqueReps {
    readonly technique: TechniqueId;
    readonly reps: number;
}

/** One set, reduced to what fits in a single cell: its reps per technique. */
export interface SetCell {
    readonly set: SetPerformed;
    /** In order of first appearance, e.g. 5 full then 3 partials. */
    readonly repsByTechnique: readonly TechniqueReps[];
}

/** All the sets of a session done at the same load, in the order performed. */
export interface LoadRow {
    /** Usually one load. More than one when the load changed within the sets (drop sets). */
    readonly loads: readonly Load[];
    readonly cells: readonly SetCell[];
}

function loadKey(load: Load): string {
    return `${load.value}${load.unit}`;
}

/** The distinct loads of a set, in the order used. */
function loadsOf(set: SetPerformed): readonly Load[] {
    const seen = new Map<string, Load>();
    for (const group of set.repGroups) {
        if (!seen.has(loadKey(group.load))) {
            seen.set(loadKey(group.load), group.load);
        }
    }
    return [...seen.values()];
}

function repsByTechnique(set: SetPerformed): readonly TechniqueReps[] {
    const totals = new Map<TechniqueId, number>();
    for (const group of set.repGroups) {
        totals.set(group.technique, (totals.get(group.technique) ?? 0) + group.reps);
    }
    return [...totals].map(([technique, reps]) => ({ technique, reps }));
}

/**
 * Projection for compact display: groups a session's sets into one row per load, so that
 * "three sets at 20 kg, then two at 22.5 kg" reads as two short lines of rep counts.
 *
 * Rows appear in the order their load was first used. This is a display summary: the exact order
 * of rep groups inside a set is not kept (an alternating pattern shows as its totals).
 */
export function groupSetsByLoad(sets: readonly SetPerformed[]): readonly LoadRow[] {
    const rows = new Map<string, { loads: readonly Load[]; cells: SetCell[] }>();
    for (const set of sets) {
        const loads = loadsOf(set);
        const key = loads.map(loadKey).join('>');
        const row = rows.get(key) ?? { loads, cells: [] };
        row.cells.push({ set, repsByTechnique: repsByTechnique(set) });
        rows.set(key, row);
    }
    return [...rows.values()];
}
