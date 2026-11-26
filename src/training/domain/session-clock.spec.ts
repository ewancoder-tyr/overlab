import {
    CURL,
    DEADLIFT,
    HAMMER_CURL,
    cardioAt,
    contextAt,
    reps,
    setAt,
} from '../../testing/fixtures';
import {
    IDLE_LIMIT_MS,
    currentExercise,
    formatElapsed,
    restAlertFor,
    restStart,
    workoutTime,
} from './session-clock';
import { activeSets, voidSet } from './set';
import { groupIntoWorkouts } from './workout';

const at = (time: string): Date => new Date(time);

describe('rest', () => {
    it('counts from the latest set occurredAt, of any exercise', () => {
        const sets = [
            setAt('2026-11-12T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-12T10:03:00Z', [reps(5, 100, { exerciseId: DEADLIFT })]),
        ];

        expect(restStart(sets, at('2026-11-12T10:04:00Z'))).toEqual(at('2026-11-12T10:03:00Z'));
    });

    it('is started by warm-up sets', () => {
        const sets = [setAt('2026-11-12T10:00:00Z', [reps(10, 10)], { kind: 'warmup' })];

        expect(restStart(sets, at('2026-11-12T10:01:00Z'))).toEqual(at('2026-11-12T10:00:00Z'));
    });

    it('is neither started nor reset by cardio bouts', () => {
        // Rest is a projection of sets only; cardio is never passed in. The workout still sees
        // the run (see below), but the rest keeps counting from the set.
        const set = setAt('2026-11-12T10:00:00Z', [reps(8, 20)]);
        const events = [set, cardioAt('2026-11-12T10:02:00Z', { seconds: 60 })];

        expect(restStart(activeSets(events), at('2026-11-12T10:03:00Z'))).toEqual(
            at('2026-11-12T10:00:00Z'),
        );
        expect(
            restStart(
                activeSets([cardioAt('2026-11-12T10:00:00Z', { seconds: 60 })]),
                at('2026-11-12T10:01:00Z'),
            ),
        ).toBeUndefined();
    });

    it('restarts when the next set is logged', () => {
        const first = setAt('2026-11-12T10:00:00Z', [reps(8, 20)]);
        const second = setAt('2026-11-12T10:02:30Z', [reps(8, 20)]);

        expect(restStart([first, second], at('2026-11-12T10:02:30Z'))).toEqual(
            at('2026-11-12T10:02:30Z'),
        );
    });

    it('moves back to the set before when the latest set is voided', () => {
        const first = setAt('2026-11-12T10:00:00Z', [reps(8, 20)]);
        const second = setAt('2026-11-12T10:02:00Z', [reps(8, 20)]);
        const voided = voidSet(second.id, contextAt('2026-11-12T10:02:10Z'));

        expect(restStart(activeSets([first, second, voided]), at('2026-11-12T10:03:00Z'))).toEqual(
            at('2026-11-12T10:00:00Z'),
        );
        // And with nothing left, there is no rest at all.
        const alone = voidSet(first.id, contextAt('2026-11-12T10:02:20Z'));
        expect(
            restStart(activeSets([first, second, voided, alone]), at('2026-11-12T10:03:00Z')),
        ).toBeUndefined();
    });

    it('is not shown when the latest set is older than the idle limit', () => {
        const sets = [setAt('2026-11-12T10:00:00Z', [reps(8, 20)])];

        expect(restStart(sets, at('2026-11-12T10:10:00Z'))).toEqual(at('2026-11-12T10:00:00Z'));
        expect(restStart(sets, at('2026-11-12T10:10:01Z'))).toBeUndefined();
    });

    it('is not shown when there are no sets', () => {
        expect(restStart([], at('2026-11-12T10:00:00Z'))).toBeUndefined();
    });
});

describe('the current exercise', () => {
    it('is the primary exercise of the latest set', () => {
        const sets = [
            setAt('2026-11-12T10:00:00Z', [reps(5, 100, { exerciseId: DEADLIFT })]),
            setAt('2026-11-12T10:03:00Z', [reps(1, 12), reps(1, 12, { exerciseId: HAMMER_CURL })]),
        ];

        expect(currentExercise(sets, at('2026-11-12T10:04:00Z'))).toBe(CURL);
    });

    it('is gone with the rest, after the idle limit', () => {
        const sets = [setAt('2026-11-12T10:00:00Z', [reps(8, 20)])];
        const after = new Date(at('2026-11-12T10:00:00Z').getTime() + IDLE_LIMIT_MS + 1);

        expect(currentExercise(sets, after)).toBeUndefined();
        expect(currentExercise([], at('2026-11-12T10:00:00Z'))).toBeUndefined();
    });
});

describe('which rest alert applies', () => {
    const alerts = { sameExercise: 60, switchExercise: 180 };

    it('is the one between sets on the current exercise screen', () => {
        expect(restAlertFor(alerts, CURL, CURL)).toBe(60);
    });

    it('is the one between exercises on another exercise screen or any other page', () => {
        expect(restAlertFor(alerts, CURL, DEADLIFT)).toBe(180);
        expect(restAlertFor(alerts, CURL, undefined)).toBe(180);
    });

    it('is the one between exercises when there is no current exercise', () => {
        expect(restAlertFor(alerts, undefined, undefined)).toBe(180);
    });
});

describe('workout time', () => {
    it('starts at the first activity of the workout, cardio included', () => {
        const workouts = groupIntoWorkouts(
            [setAt('2026-11-12T10:15:00Z', [reps(8, 20)])],
            [cardioAt('2026-11-12T10:00:00Z', { seconds: 600 })],
        );

        expect(workoutTime(workouts, at('2026-11-12T10:16:00Z'))?.startedAt).toEqual(
            at('2026-11-12T10:00:00Z'),
        );
    });

    it('is running while the last activity is within the idle limit', () => {
        const workouts = groupIntoWorkouts([
            setAt('2026-11-12T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-12T10:20:00Z', [reps(8, 20)]),
        ]);

        expect(workoutTime(workouts, at('2026-11-12T10:29:00Z'))).toEqual({
            startedAt: at('2026-11-12T10:00:00Z'),
            endsAt: undefined,
            running: true,
        });
    });

    it('stops at the last activity after the idle limit, without the idle minutes', () => {
        const workouts = groupIntoWorkouts([
            setAt('2026-11-12T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-12T10:42:10Z', [reps(8, 20)]),
        ]);

        expect(workoutTime(workouts, at('2026-11-12T11:00:00Z'))).toEqual({
            startedAt: at('2026-11-12T10:00:00Z'),
            endsAt: at('2026-11-12T10:42:10Z'),
            running: false,
        });
    });

    it('resumes the same workout time when logging again within the 3-hour gap', () => {
        const sets = [
            setAt('2026-11-12T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-12T10:30:00Z', [reps(8, 20)]),
        ];
        const later = setAt('2026-11-12T11:30:00Z', [reps(8, 20)]);

        // Stopped after the pause...
        expect(workoutTime(groupIntoWorkouts(sets), at('2026-11-12T11:29:00Z'))?.running).toBe(
            false,
        );
        // ...and running again from the same start, pause included.
        expect(
            workoutTime(groupIntoWorkouts([...sets, later]), at('2026-11-12T11:31:00Z')),
        ).toEqual({ startedAt: at('2026-11-12T10:00:00Z'), endsAt: undefined, running: true });
    });

    it('starts a new workout time when logging after 3 hours', () => {
        const workouts = groupIntoWorkouts([
            setAt('2026-11-12T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-12T13:00:00Z', [reps(8, 20)]),
        ]);

        expect(workoutTime(workouts, at('2026-11-12T13:01:00Z'))?.startedAt).toEqual(
            at('2026-11-12T13:00:00Z'),
        );
    });

    it('stops at 0:00 for a workout with one activity', () => {
        const workouts = groupIntoWorkouts([setAt('2026-11-12T10:00:00Z', [reps(8, 20)])]);

        const time = workoutTime(workouts, at('2026-11-12T10:30:00Z'));

        expect(time?.running).toBe(false);
        expect(time?.endsAt).toEqual(time?.startedAt);
    });

    it('is not given outside a workout in progress', () => {
        expect(workoutTime([], at('2026-11-12T10:00:00Z'))).toBeUndefined();
        const workouts = groupIntoWorkouts([setAt('2026-11-12T10:00:00Z', [reps(8, 20)])]);
        expect(workoutTime(workouts, at('2026-11-12T13:00:00Z'))).toBeUndefined();
    });

    it('still gives a stopped workout time within 3 hours of the last activity', () => {
        const workouts = groupIntoWorkouts([
            setAt('2026-11-12T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-12T10:50:00Z', [reps(8, 20)]),
        ]);

        expect(workoutTime(workouts, at('2026-11-12T13:49:00Z'))?.endsAt).toEqual(
            at('2026-11-12T10:50:00Z'),
        );
    });
});

describe('rest and workout time', () => {
    it('give the same result for events stored out of order', () => {
        const sets = [
            setAt('2026-11-12T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-12T10:05:00Z', [reps(8, 20)]),
            setAt('2026-11-12T10:09:00Z', [reps(8, 20)]),
        ];
        const shuffled = [sets[2], sets[0], sets[1]].filter((set) => set !== undefined);
        const now = at('2026-11-12T10:10:00Z');

        expect(restStart(shuffled, now)).toEqual(restStart(sets, now));
        expect(workoutTime(groupIntoWorkouts(shuffled), now)).toEqual(
            workoutTime(groupIntoWorkouts(sets), now),
        );
    });

    it('use a 10-minute idle limit', () => {
        expect(IDLE_LIMIT_MS).toBe(600_000);
    });
});

describe('formatElapsed', () => {
    it('shows m:ss below an hour and h:mm:ss from an hour', () => {
        expect(formatElapsed(0)).toBe('0:00');
        expect(formatElapsed(83_999)).toBe('1:23');
        expect(formatElapsed(42 * 60_000 + 10_000)).toBe('42:10');
        expect(formatElapsed(3_600_000 + 5 * 60_000 + 7_000)).toBe('1:05:07');
    });

    it('shows 0:00 for a negative span', () => {
        expect(formatElapsed(-5000)).toBe('0:00');
    });
});
