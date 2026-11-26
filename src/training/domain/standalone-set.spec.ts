import { CURL, HAMMER_CURL, reps, setAt } from '../../testing/fixtures';
import { currentExercise, restStart } from './session-clock';
import { SetPerformed, isStandalone, workoutSets } from './set';
import {
    groupIntoWorkouts,
    standaloneHabits,
    standaloneInProgressSince,
    standaloneSessions,
} from './workout';

const standalone = (time: string, count: number, exerciseId = CURL): SetPerformed =>
    setAt(time, [reps(count, 0, { exerciseId })], { standalone: true });

describe('a standalone set', () => {
    it('is stored with the flag only when asked for', () => {
        expect(standalone('2026-11-01T07:00:00Z', 10).standalone).toBe(true);
        expect('standalone' in setAt('2026-11-01T07:00:00Z', [reps(10, 0)])).toBe(false);
        expect(
            'standalone' in setAt('2026-11-01T07:00:00Z', [reps(10, 0)], { standalone: false }),
        ).toBe(false);
    });

    it('is not part of any workout, even when logged in the middle of one', () => {
        const sets = [
            setAt('2026-11-01T10:00:00Z', [reps(8, 20)]),
            standalone('2026-11-01T10:05:00Z', 10),
            setAt('2026-11-01T10:10:00Z', [reps(8, 20)]),
            standalone('2026-11-02T07:00:00Z', 10),
        ];

        const workouts = groupIntoWorkouts(workoutSets(sets));

        expect(workouts).toHaveLength(1);
        expect(workouts[0]?.sets.some(isStandalone)).toBe(false);
        expect(workouts[0]?.endedAt).toBe('2026-11-01T10:10:00.000Z');
    });

    it('neither starts rest nor resets it, and is never the current exercise', () => {
        const workoutSet = setAt('2026-11-01T10:00:00Z', [reps(8, 20)]);
        const sets = [workoutSet, standalone('2026-11-01T10:03:00Z', 10, HAMMER_CURL)];
        const now = new Date('2026-11-01T10:04:00Z');

        expect(restStart(workoutSets(sets), now)).toEqual(new Date(workoutSet.occurredAt));
        expect(currentExercise(workoutSets(sets), now)).toBe(CURL);
        expect(restStart(workoutSets([standalone('2026-11-01T10:03:00Z', 10)]), now)).toBe(
            undefined,
        );
    });
});

describe('standaloneSessions', () => {
    it('makes one session of standalone sets of an exercise less than 3 hours apart', () => {
        const sets = [
            standalone('2026-11-01T07:00:00Z', 10),
            standalone('2026-11-01T07:20:00Z', 8),
            standalone('2026-11-01T19:00:00Z', 10),
        ];

        const sessions = standaloneSessions(sets, CURL);

        expect(sessions.map((session) => session.sets.length)).toEqual([2, 1]);
        expect(sessions[0]?.workoutStartedAt).toBe('2026-11-01T07:00:00.000Z');
    });

    it('keeps each exercise to its own sessions and leaves workout sets out', () => {
        const sets = [
            standalone('2026-11-01T07:00:00Z', 10),
            standalone('2026-11-01T07:05:00Z', 12, HAMMER_CURL),
            setAt('2026-11-01T07:10:00Z', [reps(8, 20)]),
        ];

        expect(standaloneSessions(sets, CURL)[0]?.sets).toHaveLength(1);
        expect(standaloneSessions(sets, HAMMER_CURL)[0]?.sets).toHaveLength(1);
    });

    it('does not depend on the order the sets were stored in', () => {
        const early = standalone('2026-11-01T07:00:00Z', 10);
        const late = standalone('2026-11-01T07:20:00Z', 8);

        expect(standaloneSessions([late, early], CURL)[0]?.sets).toEqual([early, late]);
    });

    it('is in progress while another set would still join the latest session', () => {
        const sessions = standaloneSessions([standalone('2026-11-01T07:00:00Z', 10)], CURL);

        expect(standaloneInProgressSince(sessions, new Date('2026-11-01T09:59:00Z'))).toBe(
            '2026-11-01T07:00:00.000Z',
        );
        expect(standaloneInProgressSince(sessions, new Date('2026-11-01T10:00:00Z'))).toBe(
            undefined,
        );
    });
});

describe('standaloneHabits', () => {
    it('lists the exercises done standalone in the last 30 days, never workout sets', () => {
        const sets = [
            standalone('2026-10-01T07:00:00Z', 10, HAMMER_CURL),
            standalone('2026-11-10T07:00:00Z', 10),
            setAt('2026-11-14T10:00:00Z', [reps(8, 20, { exerciseId: HAMMER_CURL })]),
        ];

        const habits = standaloneHabits(sets, new Date('2026-11-15T07:00:00Z'));

        expect([...habits.keys()]).toEqual([CURL]);
    });

    it('gives the sets of the standalone session in progress, and none once it is over', () => {
        const sets = [
            standalone('2026-11-14T07:00:00Z', 9),
            standalone('2026-11-15T07:00:00Z', 10),
            standalone('2026-11-15T07:20:00Z', 8),
        ];

        expect(standaloneHabits(sets, new Date('2026-11-15T08:00:00Z')).get(CURL)).toHaveLength(2);
        expect(standaloneHabits(sets, new Date('2026-11-15T12:00:00Z')).get(CURL)).toEqual([]);
    });
});
