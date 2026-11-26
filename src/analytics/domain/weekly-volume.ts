import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId } from '@catalog/domain/exercise';
import { MUSCLE_GROUPS, MuscleGroup, MuscleGroupId } from '@catalog/domain/muscle-group';
import { SetPerformed, isEasy, totalReps } from '@training/domain/set';

/**
 * How many days weekly volume and weekly cardio are counted over, until the target window
 * preference says otherwise. The targets mean "this many sets (or minutes) per this many days",
 * so a longer window is a different target, not a different view: nothing is scaled.
 */
export const DEFAULT_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The rolling window as milliseconds. Whole days of 24 hours back from now, not calendar days:
 * the window slides with the clock, so a set drops out exactly N days after it was done.
 */
export function windowMs(days: number): number {
    return days * DAY_MS;
}

/**
 * What a light set (done easy on purpose) is worth in weekly volume, as a fraction of a set,
 * until the preference says otherwise. The targets assume sets close to failure, which a light
 * set is not, but it is still work: half a set.
 */
export const DEFAULT_LIGHT_SET_WEIGHT = 0.5;

/** The range of weighted sets a muscle group should receive in the window. */
export interface VolumeTarget {
    readonly minSets: number;
    readonly maxSets: number;
}

/**
 * The target for a weekly minimum of `minSets`. The maximum is always double the minimum, so the
 * user chooses one number (a preference) and 10 gives the common 10 to 20.
 */
export function volumeTarget(minSets: number): VolumeTarget {
    return { minSets, maxSets: 2 * minSets };
}

/**
 * A common evidence-based range for hypertrophy, until the preference says otherwise. One target
 * for every muscle group; targets per muscle group are an idea for later.
 */
export const DEFAULT_VOLUME_TARGET: VolumeTarget = volumeTarget(10);

export type VolumeStatus = 'under' | 'within' | 'over';

/** What one exercise gave a muscle group in the window. */
export interface ExerciseVolume {
    readonly exerciseId: ExerciseId;
    /** Weighted the same way as the muscle group's total, of which it is a part. */
    readonly sets: number;
}

export interface MuscleVolume {
    readonly muscleGroup: MuscleGroup;
    /** Working sets in the window, each weighted by the exercise's involvement of this muscle. */
    readonly sets: number;
    /** Reps in the window, weighted the same way. */
    readonly reps: number;
    /**
     * The volume breakdown: each exercise that gave this muscle group any sets in the window,
     * largest first (ties in catalog order). The entries add up to `sets`, give or take rounding.
     */
    readonly byExercise: readonly ExerciseVolume[];
    readonly target: VolumeTarget;
    readonly status: VolumeStatus;
}

export function volumeStatus(sets: number, target: VolumeTarget): VolumeStatus {
    if (sets < target.minSets) {
        return 'under';
    }
    return sets > target.maxSets ? 'over' : 'within';
}

/**
 * Projection: the core view of the app. For every muscle group, how much work it received in the
 * `windowDays` (the target window, 7 unless chosen otherwise) up to `now`.
 *
 * One working set counts as `involvement ratio` sets for each muscle the exercise involves:
 * a deadlift set adds 1 to glutes, 0.6 to hamstrings, 0.5 to back, and so on.
 *
 * A set that mixes exercises is split by each exercise's share of the set's reps, so a set of
 * 4 curls and 4 hammer curls counts as half a curl set plus half a hammer curl set.
 *
 * A light set counts as `lightSetWeight` of a set (half, unless the user chose otherwise). Its
 * reps count in full: they are the reps actually done, and only the set count stands for how
 * hard the work was.
 *
 * An easy set counts as no set at all, whatever the preferences: it is far from failure on
 * purpose, and the targets are about sets close to it. Its reps count in full too.
 *
 * Standalone sets count like any other: a muscle does not know whether it was a workout.
 *
 * Warm-up sets and sets of exercises missing from the catalog are skipped.
 */
export function weeklyVolume(
    sets: readonly SetPerformed[],
    catalog: Catalog,
    now: Date,
    target: VolumeTarget = DEFAULT_VOLUME_TARGET,
    lightSetWeight: number = DEFAULT_LIGHT_SET_WEIGHT,
    windowDays: number = DEFAULT_WINDOW_DAYS,
): readonly MuscleVolume[] {
    const windowStart = now.getTime() - windowMs(windowDays);
    const totals = new Map<
        MuscleGroupId,
        { sets: number; reps: number; byExercise: Map<ExerciseId, number> }
    >();

    for (const set of sets) {
        const time = Date.parse(set.occurredAt);
        if (set.kind !== 'working' || time <= windowStart || time > now.getTime()) {
            continue;
        }
        const repsInSet = totalReps(set);
        if (repsInSet === 0) {
            continue;
        }
        const setWeight = isEasy(set) ? 0 : set.effort?.kind === 'light' ? lightSetWeight : 1;

        for (const group of set.repGroups) {
            const exercise = catalog.findExercise(group.exerciseId);
            if (exercise === undefined) {
                continue;
            }
            const shareOfSet = group.reps / repsInSet;
            for (const involvement of exercise.involvements) {
                const total = totals.get(involvement.muscleGroupId) ?? {
                    sets: 0,
                    reps: 0,
                    byExercise: new Map<ExerciseId, number>(),
                };
                const sets = setWeight * shareOfSet * involvement.ratio;
                total.sets += sets;
                total.reps += group.reps * involvement.ratio;
                total.byExercise.set(exercise.id, (total.byExercise.get(exercise.id) ?? 0) + sets);
                totals.set(involvement.muscleGroupId, total);
            }
        }
    }

    // Always return every muscle group, including untouched ones: seeing a zero is the point.
    return MUSCLE_GROUPS.map((muscleGroup) => {
        const total = totals.get(muscleGroup.id);
        // Round away float noise such as 0.30000000000000004.
        const roundedSets = roundSets(total?.sets ?? 0);
        return {
            muscleGroup,
            sets: roundedSets,
            reps: Math.round(total?.reps ?? 0),
            byExercise: breakdown(total?.byExercise, catalog),
            target,
            status: volumeStatus(roundedSets, target),
        };
    });
}

function roundSets(sets: number): number {
    return Math.round(sets * 100) / 100;
}

/**
 * The breakdown, largest first. Exercises whose sets weigh nothing (easy sets, or light sets at
 * a weight of 0) are left out: they did no counted work. A tie is broken by catalog order, so
 * the result never depends on the order the events were stored in.
 */
function breakdown(
    byExercise: ReadonlyMap<ExerciseId, number> | undefined,
    catalog: Catalog,
): readonly ExerciseVolume[] {
    if (byExercise === undefined) {
        return [];
    }
    const catalogOrder = (id: ExerciseId): number =>
        catalog.exercises.findIndex((exercise) => exercise.id === id);
    return [...byExercise]
        .map(([exerciseId, sets]) => ({ exerciseId, sets: roundSets(sets) }))
        .filter((entry) => entry.sets > 0)
        .sort((a, b) => b.sets - a.sets || catalogOrder(a.exerciseId) - catalogOrder(b.exerciseId));
}
