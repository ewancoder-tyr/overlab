import { CURL, DEADLIFT, RUNNING, cardioAt, reps, setAt } from '../../testing/fixtures';
import {
    cardioSessions,
    currentWorkout,
    exerciseSessions,
    exercisesOf,
    groupIntoWorkouts,
} from './workout';

describe('groupIntoWorkouts', () => {
    it('keeps sets less than 3 hours apart in one workout', () => {
        const sets = [
            setAt('2026-11-11T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-11T12:59:59Z', [reps(8, 20)]),
        ];

        expect(groupIntoWorkouts(sets)).toHaveLength(1);
    });

    it('starts a new workout when the gap reaches 3 hours', () => {
        const sets = [
            setAt('2026-11-11T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-11T13:00:00Z', [reps(8, 20)]),
        ];

        const workouts = groupIntoWorkouts(sets);

        expect(workouts.map((workout) => workout.sets.length)).toEqual([1, 1]);
    });

    it('measures the gap from the previous set, not from the start of the workout', () => {
        const sets = [
            setAt('2026-11-11T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-11T12:00:00Z', [reps(8, 20)]),
            setAt('2026-11-11T14:00:00Z', [reps(8, 20)]),
        ];

        const [workout] = groupIntoWorkouts(sets);

        expect(workout?.sets).toHaveLength(3);
        expect(workout?.startedAt).toBe('2026-11-11T10:00:00.000Z');
        expect(workout?.endedAt).toBe('2026-11-11T14:00:00.000Z');
    });

    it('returns no workouts for no sets', () => {
        expect(groupIntoWorkouts([])).toEqual([]);
    });
});

describe('currentWorkout', () => {
    const workouts = groupIntoWorkouts([setAt('2026-11-11T10:00:00Z', [reps(8, 20)])]);

    it('is the latest workout while its last set is less than 3 hours ago', () => {
        expect(currentWorkout(workouts, new Date('2026-11-11T12:30:00Z'))).toBe(workouts[0]);
    });

    it('is undefined once 3 hours have passed', () => {
        expect(currentWorkout(workouts, new Date('2026-11-11T13:00:00Z'))).toBeUndefined();
    });
});

describe('exerciseSessions', () => {
    it('gives one session per workout that contains the exercise, oldest first', () => {
        const workouts = groupIntoWorkouts([
            setAt('2026-11-09T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-09T10:05:00Z', [reps(5, 100, { exerciseId: DEADLIFT })]),
            setAt('2026-11-10T10:00:00Z', [reps(5, 100, { exerciseId: DEADLIFT })]),
            setAt('2026-11-11T10:00:00Z', [reps(9, 20)]),
            setAt('2026-11-11T10:05:00Z', [reps(8, 20)]),
        ]);

        const sessions = exerciseSessions(workouts, CURL);

        expect(sessions.map((session) => session.sets.length)).toEqual([1, 2]);
        expect(sessions[0]?.workoutStartedAt).toBe('2026-11-09T10:00:00.000Z');
    });
});

describe('exercisesOf', () => {
    it('lists lifting and cardio together, in the order first performed', () => {
        const [workout] = groupIntoWorkouts(
            [
                setAt('2026-11-11T10:20:00Z', [reps(8, 20)]),
                setAt('2026-11-11T10:25:00Z', [reps(8, 20)]),
            ],
            [
                cardioAt('2026-11-11T10:15:00Z', { seconds: 600 }), // The run came first.
            ],
        );

        expect(workout && exercisesOf(workout)).toEqual([RUNNING, CURL]);
    });

    it('lists the exercises of a workout in the order first performed', () => {
        const [workout] = groupIntoWorkouts([
            setAt('2026-11-11T10:00:00Z', [reps(5, 100, { exerciseId: DEADLIFT })]),
            setAt('2026-11-11T10:05:00Z', [reps(8, 20)]),
            setAt('2026-11-11T10:10:00Z', [reps(5, 100, { exerciseId: DEADLIFT })]),
        ]);

        expect(workout && exercisesOf(workout)).toEqual([DEADLIFT, CURL]);
    });
});

describe('workouts with cardio', () => {
    it('counts a day of nothing but cardio as a workout', () => {
        const run = cardioAt('2026-11-11T10:00:00Z', { meters: 5000, seconds: 1800 });

        const workouts = groupIntoWorkouts([], [run]);

        expect(workouts).toHaveLength(1);
        expect(workouts[0]).toMatchObject({ sets: [], cardio: [run] });
    });

    it('puts a cardio bout in the same workout as sets less than 3 hours away', () => {
        const set = setAt('2026-11-11T10:00:00Z', [reps(8, 20)]);
        const sameWorkout = cardioAt('2026-11-11T11:00:00Z', { seconds: 1200 });
        const nextDay = cardioAt('2026-11-12T10:00:00Z', { seconds: 1200 });

        const workouts = groupIntoWorkouts([set], [nextDay, sameWorkout]);

        expect(workouts.map((workout) => [workout.sets.length, workout.cardio.length])).toEqual([
            [1, 1],
            [0, 1],
        ]);
        // The workout runs until the cardio bout, its last activity.
        expect(workouts[0]?.endedAt).toBe('2026-11-11T11:00:00.000Z');
    });

    it('gives one cardio session per workout that contains the exercise', () => {
        const workouts = groupIntoWorkouts(
            [setAt('2026-11-10T10:00:00Z', [reps(8, 20)])],
            [
                cardioAt('2026-11-09T10:00:00Z', { meters: 3000 }),
                cardioAt('2026-11-11T10:00:00Z', { meters: 2000 }),
                cardioAt('2026-11-11T10:30:00Z', { meters: 2000 }),
            ],
        );

        const sessions = cardioSessions(workouts, RUNNING);

        expect(sessions.map((session) => session.bouts.length)).toEqual([1, 2]);
    });
});
