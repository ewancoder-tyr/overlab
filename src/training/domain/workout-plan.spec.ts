import { ExerciseId } from '@catalog/domain/exercise';
import { CURL, DEADLIFT, PULL_UP, reps, setAt } from '../../testing/fixtures';
import { SetPerformed } from './set';
import { groupIntoWorkouts } from './workout';
import { plannedExercises } from './workout-plan';

const BENCH = 'bench-press' as ExerciseId;

/** One set of each exercise, a few minutes apart, on the given day of November 2026. */
const workoutOn = (day: number, exerciseIds: readonly ExerciseId[]): readonly SetPerformed[] =>
    exerciseIds.map((exerciseId, index) =>
        setAt(
            `2026-11-${String(day).padStart(2, '0')}T10:${String(index * 5).padStart(2, '0')}:00Z`,
            [reps(8, 20, { exerciseId })],
        ),
    );

// Three different workouts on three days: A, B, C.
const workouts = groupIntoWorkouts([
    ...workoutOn(1, [DEADLIFT, CURL]),
    ...workoutOn(3, [BENCH, CURL]),
    ...workoutOn(5, [PULL_UP, BENCH, CURL]),
]);

describe('plannedExercises', () => {
    it('with a rotation of 1 repeats the last workout, in the order it was done', () => {
        expect(plannedExercises(workouts, 1)).toEqual([PULL_UP, BENCH, CURL]);
    });

    it('with a rotation of 3 repeats the workout of three workouts ago', () => {
        expect(plannedExercises(workouts, 3)).toEqual([DEADLIFT, CURL]);
    });

    it('with a rotation of 2 repeats the workout before the last one', () => {
        expect(plannedExercises(workouts, 2)).toEqual([BENCH, CURL]);
    });

    it('lists an exercise once, where it was first done, even if it was returned to', () => {
        const mixed = groupIntoWorkouts(workoutOn(1, [CURL, DEADLIFT, CURL]));

        expect(plannedExercises(mixed, 1)).toEqual([CURL, DEADLIFT]);
    });

    it('has no plan until the rotation has come round once', () => {
        expect(plannedExercises(workouts, 4)).toEqual([]);
        expect(plannedExercises([], 1)).toEqual([]);
    });

    it('has no plan for a rotation that is not a whole number from 1', () => {
        expect(plannedExercises(workouts, 0)).toEqual([]);
        expect(plannedExercises(workouts, 1.5)).toEqual([]);
    });
});
