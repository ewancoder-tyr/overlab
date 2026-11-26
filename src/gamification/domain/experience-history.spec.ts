import { IsoDateTime } from '@shared/domain/event';
import { SetPerformed } from '@training/domain/set';
import { groupIntoWorkouts } from '@training/domain/workout';
import { CURL, HAMMER_CURL, RUNNING, cardioAt, catalog, reps, setAt } from '../../testing/fixtures';
import { Experience, experience } from './experience';
import { WorkoutExperience, experienceHistory } from './experience-history';

const RULES = { lightSetWeight: 0.5, stallThreshold: 3 };

/** One curl session on the given day: one set per rep count, all at `load` kg. */
function session(day: number, load: number, ...repCounts: number[]): SetPerformed[] {
    return repCounts.map((count, index) =>
        setAt(
            `2026-11-${String(day).padStart(2, '0')}T10:${String(index * 5).padStart(2, '0')}:00Z`,
            [reps(count, load)],
        ),
    );
}

function historyOf(
    sets: readonly SetPerformed[],
    epoch?: string,
): { result: Experience; history: readonly WorkoutExperience[] } {
    const workouts = groupIntoWorkouts(sets);
    const result = experience(workouts, catalog, epoch as IsoDateTime | undefined, RULES);
    return { result, history: experienceHistory(result.entries, workouts) };
}

describe('experienceHistory', () => {
    it('lists each workout newest first, with what each reason earned and how often', () => {
        // Day 2 beats day 1 with a heavier set: a weight record and a beaten session.
        const { history } = historyOf([...session(1, 20, 8, 8), ...session(2, 22, 8, 8)]);

        expect(history.map((workout) => workout.startedAt)).toEqual([
            '2026-11-02T10:00:00.000Z',
            '2026-11-01T10:00:00.000Z',
        ]);
        expect(history[0]?.xp).toBe(100);
        expect(history[0]?.exercises).toEqual([
            {
                exerciseId: CURL,
                xp: 100,
                reasons: [
                    { reason: 'weight-record', count: 1, xp: 50 },
                    { reason: 'beaten', count: 1, xp: 30 },
                    { reason: 'set', count: 2, xp: 20 },
                ],
                levelBefore: 2,
                levelAfter: 4,
            },
        ]);
        // The first session is the baseline: just its sets.
        expect(history[1]?.exercises[0]?.reasons).toEqual([{ reason: 'set', count: 2, xp: 20 }]);
    });

    it('always adds up to the total experience', () => {
        const { result, history } = historyOf([
            ...session(1, 20, 8, 8),
            ...session(2, 20, 9, 8),
            ...session(3, 22, 6),
        ]);

        expect(history.reduce((sum, workout) => sum + workout.xp, 0)).toBe(result.progress.xp);
    });

    it("tells the character's level before and after each workout", () => {
        // Five sets are 50 XP, the start of level 2.
        const { history } = historyOf(session(1, 20, 8, 8, 8, 8, 8));

        expect(history[0]).toMatchObject({ xp: 50, levelBefore: 1, levelAfter: 2 });
    });

    it('counts a mixed set once per exercise, split by its share of the reps', () => {
        const alternating = setAt('2026-11-01T10:00:00Z', [
            reps(1, 10),
            reps(1, 10, { exerciseId: HAMMER_CURL }),
            reps(1, 10),
            reps(1, 10, { exerciseId: HAMMER_CURL }),
        ]);
        const { history } = historyOf([alternating]);

        expect(history[0]?.exercises.map((line) => [line.exerciseId, line.reasons])).toEqual([
            [CURL, [{ reason: 'set', count: 1, xp: 5 }]],
            [HAMMER_CURL, [{ reason: 'set', count: 1, xp: 5 }]],
        ]);
    });

    it('lists nothing from before the latest reset', () => {
        const { history } = historyOf(
            [...session(1, 20, 8), ...session(2, 20, 8)],
            '2026-11-01T12:00:00Z',
        );

        expect(history.map((workout) => workout.startedAt)).toEqual(['2026-11-02T10:00:00.000Z']);
    });

    it('lists cardio by its minutes', () => {
        const workouts = groupIntoWorkouts(
            [],
            [cardioAt('2026-11-01T10:00:00Z', { seconds: 1800 })],
        );
        const result = experience(workouts, catalog, undefined, RULES);

        expect(experienceHistory(result.entries, workouts)[0]?.exercises).toMatchObject([
            { exerciseId: RUNNING, xp: 30, reasons: [{ reason: 'cardio-time', count: 1, xp: 30 }] },
        ]);
    });
});
