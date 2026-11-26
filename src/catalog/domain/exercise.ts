import { Branded } from '@shared/domain/brand';
import { LocalText } from '@shared/domain/language';
import { TrainingFocus } from '@shared/domain/training-focus';
import { MuscleGroupId, MuscleInvolvement } from './muscle-group';

export type ExerciseId = Branded<string, 'ExerciseId'>;

/** A specific machine or gym for an exercise. Progression is compared within one setup. */
export type SetupId = Branded<string, 'SetupId'>;

/**
 * What the logged load number means for an exercise.
 * - `external`: the weight moved (barbell, dumbbell, machine stack). Never negative.
 * - `bodyweight`: load added to body weight. Signed: +10 weighted, 0 plain, -20 assisted.
 */
export type LoadType = 'external' | 'bodyweight';

/**
 * What a cardio exercise records, which decides the fields of its logging screen.
 * - `distance`: distance, time and calories, each optional (running, cycling). The default.
 * - `treadmill`: the same three, logged in segments that each carry an incline.
 * - `timed`: time only (a sauna has no distance and no calorie counter).
 */
export type CardioKind = 'distance' | 'treadmill' | 'timed';

export interface Exercise {
    readonly id: ExerciseId;
    readonly name: LocalText;
    readonly loadType: LoadType;
    /** True when the load is logged per hand or per side (dumbbells, single-arm cables). */
    readonly perSide: boolean;
    /**
     * Sorted by ratio, highest first. Empty for a cardio exercise, which therefore counts
     * towards no muscle group's weekly volume.
     */
    readonly involvements: readonly MuscleInvolvement[];
    /** Only on a cardio exercise that is not of the usual `distance` kind. See `cardioKindOf`. */
    readonly cardioKind?: CardioKind;
    /** Notes on correct execution. */
    readonly form?: LocalText;
    /** How to warm up for this exercise. */
    readonly warmUp?: LocalText;
}

/**
 * Cardio (running, cycling) is an exercise that involves no muscle group. That absence is the
 * whole definition: there is no separate "kind" field to keep in step with the involvements.
 */
export function isCardio(exercise: Exercise): boolean {
    return exercise.involvements.length === 0;
}

/**
 * What a cardio exercise records: `distance` unless the catalog says otherwise. Ask this, never
 * the exercise's id, so one more treadmill-like machine is one more line in the catalog.
 */
export function cardioKindOf(exercise: Exercise): CardioKind {
    return exercise.cardioKind ?? 'distance';
}

/**
 * How much the exercise involves a muscle group, from above 0 to 1, or 0 when it does not
 * involve it at all.
 */
export function involvementOf(exercise: Exercise, muscleGroupId: MuscleGroupId): number {
    return exercise.involvements.find((each) => each.muscleGroupId === muscleGroupId)?.ratio ?? 0;
}

/**
 * Whether the training focus shows an exercise in lists (Train, Catalog): `lifting` hides cardio,
 * `cardio` hides lifting, `both` hides nothing. The one place that rule lives, so pages never
 * test `isCardio()` against the focus themselves.
 *
 * It only hides. A hidden exercise is still logged, counted and synced, and the Train page shows
 * a planned one anyway (see `trainList`).
 */
export function isShown(exercise: Exercise, focus: TrainingFocus): boolean {
    switch (focus) {
        case 'both':
            return true;
        case 'lifting':
            return !isCardio(exercise);
        case 'cardio':
            return isCardio(exercise);
    }
}
