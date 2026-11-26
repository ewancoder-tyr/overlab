import { ExerciseId } from '@catalog/domain/exercise';
import { Workout, exercisesOf } from './workout';

/**
 * Projection: the plan for a workout, given the workouts logged before it.
 *
 * The user rotates between `rotation` distinct workouts (A, B, C, A, B, C for a rotation of 3),
 * so the workout that comes after `previousWorkouts` is a repeat of the one `rotation` workouts
 * back. Its exercises, in the order they were first done then, are the plan. With a rotation of
 * 1 that is simply the last workout.
 *
 * Nothing about the plan is stored. A skipped gym day delays the rotation instead of breaking
 * it, and an exercise added to workout B today is part of B's plan from then on. The price is
 * that every logged workout counts, even a stray two-set one.
 *
 * There is no plan until `rotation` workouts exist: the rotation has not come round once yet.
 */
export function plannedExercises(
    previousWorkouts: readonly Workout[],
    rotation: number,
): readonly ExerciseId[] {
    // `at(-0)` would be the FIRST workout, so a rotation below 1 must never reach it.
    if (!Number.isInteger(rotation) || rotation < 1) {
        return [];
    }
    const template = previousWorkouts.at(-rotation);
    return template === undefined ? [] : exercisesOf(template);
}
