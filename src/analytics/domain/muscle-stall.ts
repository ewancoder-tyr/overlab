import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId, involvementOf, isCardio } from '@catalog/domain/exercise';
import { MuscleGroupId } from '@catalog/domain/muscle-group';
import { ExerciseVolume, MuscleVolume } from './weekly-volume';

/**
 * How much an exercise must involve a muscle group (more than this, 0 to 1) for its stall to
 * mark that muscle group, until the preference says otherwise. More than half means the muscles
 * an exercise trains directly, not those that only help: a stalled bench press (chest 1,
 * triceps 0.5) marks chest, but a stalled dip (chest 0.8, triceps 0.8) marks both.
 */
export const DEFAULT_STALL_INVOLVEMENT = 0.5;

/**
 * What a stalled muscle group's weekly volume suggests:
 * - `add-sets`: under target, so more work is the obvious lever;
 * - `room-to-add`: within target and every exercise that trains it directly is stalled, so
 *   there is room to add sets up to the top of the range;
 * - `back-off`: over target and every such exercise is stalled, so more work is not helping;
 * - `exercise`: within or over target while another such exercise still progresses. The muscle
 *   is responding, so the cause is likely that one exercise; only its name is given.
 */
export type VolumeAdvice = 'add-sets' | 'room-to-add' | 'back-off' | 'exercise';

/** A stalled muscle group, with what makes it stalled and the advice that follows. */
export interface MuscleStall {
    readonly volume: MuscleVolume;
    /**
     * The exercises trained in the window that involve the muscle group by more than the stall
     * involvement, largest share of its volume first.
     */
    readonly direct: readonly ExerciseVolume[];
    /** Those of them that are stalled, in the same order. Never empty. */
    readonly stalled: readonly ExerciseVolume[];
    readonly advice: VolumeAdvice;
}

/**
 * The volume advice rule: under target, add sets whatever else is true. Otherwise prescribe
 * nothing while some direct exercise still progresses, and only when all of them are stalled,
 * room to add (within) or back off (over).
 */
export function volumeAdvice(status: MuscleVolume['status'], allStalled: boolean): VolumeAdvice {
    if (status === 'under') {
        return 'add-sets';
    }
    if (!allStalled) {
        return 'exercise';
    }
    return status === 'within' ? 'room-to-add' : 'back-off';
}

/**
 * Projection: the stalled muscle groups, in muscle group order.
 *
 * A muscle group is stalled when at least one stalled exercise was trained in the window (it is
 * in the muscle group's volume breakdown) and involves the muscle group by more than
 * `stallInvolvement`. One is enough: the aim is to improve on every exercise every time.
 *
 * - **Only exercises trained this week count.** Stalls never expire, so an exercise dropped
 *   months ago while stalled would otherwise mark its muscle group forever. It also means every
 *   mark is explained by the breakdown under it.
 * - **Assisting muscles are not blamed.** A stall marks only the muscle groups the exercise
 *   trains strongly enough; a muscle that merely helps is rarely why the exercise stalled.
 * - **Cardio never marks a muscle group**: it involves none, and it never stalls.
 *
 * `stalledExercises` comes from the stall rule as it is, so its threshold (0 is off), setup
 * scoping and the session in progress apply here unchanged.
 */
export function muscleStalls(
    volumes: readonly MuscleVolume[],
    stalledExercises: ReadonlySet<ExerciseId>,
    catalog: Catalog,
    stallInvolvement: number = DEFAULT_STALL_INVOLVEMENT,
): readonly MuscleStall[] {
    const stalls: MuscleStall[] = [];
    for (const volume of volumes) {
        const direct = volume.byExercise.filter((entry) => {
            const exercise = catalog.findExercise(entry.exerciseId);
            return (
                exercise !== undefined &&
                !isCardio(exercise) &&
                involvementOf(exercise, volume.muscleGroup.id) > stallInvolvement
            );
        });
        const stalled = direct.filter((entry) => stalledExercises.has(entry.exerciseId));
        if (stalled.length > 0) {
            stalls.push({
                volume,
                direct,
                stalled,
                advice: volumeAdvice(volume.status, stalled.length === direct.length),
            });
        }
    }
    return stalls;
}

/** Most pressing first: a muscle short of work is the clearest case, then too much work. */
const ADVICE_ORDER: readonly VolumeAdvice[] = ['add-sets', 'back-off', 'room-to-add', 'exercise'];

/**
 * The one stall worth a line under the summary: by advice in `ADVICE_ORDER`, and among
 * `add-sets` the largest shortfall first. Ties keep muscle group order (`toSorted` is stable).
 */
export function topStall(stalls: readonly MuscleStall[]): MuscleStall | undefined {
    const shortfall = (stall: MuscleStall): number =>
        stall.volume.target.minSets - stall.volume.sets;
    return stalls.toSorted(
        (a, b) =>
            ADVICE_ORDER.indexOf(a.advice) - ADVICE_ORDER.indexOf(b.advice) ||
            (a.advice === 'add-sets' ? shortfall(b) - shortfall(a) : 0),
    )[0];
}

/**
 * Favorites that would add direct work to a muscle group: those that involve it by more than
 * the stall involvement and are not in its breakdown already, the strongest involvement first,
 * then in catalog order. At most `limit`.
 */
export function couldAdd(
    muscleGroupId: MuscleGroupId,
    trained: readonly ExerciseVolume[],
    favorites: ReadonlySet<ExerciseId>,
    catalog: Catalog,
    stallInvolvement: number = DEFAULT_STALL_INVOLVEMENT,
    limit = 3,
): readonly ExerciseId[] {
    const done = new Set(trained.map((entry) => entry.exerciseId));
    return catalog.exercises
        .filter((exercise) => favorites.has(exercise.id) && !done.has(exercise.id))
        .map((exercise) => ({ id: exercise.id, ratio: involvementOf(exercise, muscleGroupId) }))
        .filter((entry) => entry.ratio > stallInvolvement)
        .toSorted((a, b) => b.ratio - a.ratio)
        .slice(0, limit)
        .map((entry) => entry.id);
}
