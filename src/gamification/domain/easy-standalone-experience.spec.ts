import { SetPerformed, isStandalone, workoutSets } from '@training/domain/set';
import { groupIntoWorkouts } from '@training/domain/workout';
import { CURL, catalog, reps, setAt } from '../../testing/fixtures';
import { Experience, XP, experience } from './experience';
import { experienceHistory } from './experience-history';

const RULES = { lightSetWeight: 0.5, stallThreshold: 3 };

/** Experience as the app derives it: workouts from the workout sets, standalone sets beside. */
function experienceOf(sets: readonly SetPerformed[]): Experience {
    return experience(
        groupIntoWorkouts(workoutSets(sets)),
        catalog,
        undefined,
        RULES,
        sets.filter(isStandalone),
    );
}

const at = (day: number, hour = 10): string =>
    `2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;

const easy = (day: number, count: number, standalone = false): SetPerformed =>
    setAt(at(day), [reps(count, 20)], { effort: { kind: 'easy' }, standalone });

describe('experience for easy sets', () => {
    it('gives an easy set half a set, whatever the light set weight', () => {
        expect(experienceOf([easy(1, 10)]).progress.xp).toBe(XP.easySet);
    });

    it('pays an easy session for beating last time, not for matching it', () => {
        const matched = experienceOf([easy(1, 10), easy(2, 10)]);
        const beaten = experienceOf([easy(1, 10), easy(2, 11)]);

        expect(matched.progress.xp).toBe(2 * XP.easySet);
        expect(beaten.byReason.get('beaten')).toBe(XP.sessionBeaten);
        expect(beaten.byReason.get('rep-record')).toBe(XP.repRecord);
    });

    it('gives no stall-broken bonus to an easy session: it cannot end a stall', () => {
        const hard = (day: number, count: number): SetPerformed =>
            setAt(at(day), [reps(count, 20)]);
        const sets = [hard(1, 10), hard(2, 10), hard(3, 10), hard(4, 10), easy(5, 11)];

        expect(experienceOf(sets).byReason.get('stall-broken')).toBe(undefined);
    });
});

describe('experience for standalone sets', () => {
    it('earns like any set, and bonuses against standalone sessions only', () => {
        const sets = [
            setAt(at(1), [reps(30, 20)]),
            setAt(at(2), [reps(10, 20)], { standalone: true }),
            setAt(at(3), [reps(11, 20)], { standalone: true }),
        ];

        const earned = experienceOf(sets);

        expect(earned.byReason.get('set')).toBe(3 * XP.set);
        // 11 beats the standalone 10, although the workout had 30.
        expect(earned.byReason.get('beaten')).toBe(XP.sessionBeaten);
        expect(earned.byExercise[0]?.exerciseId).toBe(CURL);
    });

    it('lists standalone sets in the experience history, which still adds up to the total', () => {
        const sets = [
            setAt(at(1, 10), [reps(8, 20)]),
            easy(2, 10, true),
            setAt(at(2, 11), [reps(8, 20)], { standalone: true }),
            easy(3, 10, true),
        ];
        const earned = experienceOf(sets);

        const history = experienceHistory(earned.entries, groupIntoWorkouts(workoutSets(sets)));

        // Newest first: the two standalone mornings (the first of two sets), then the workout.
        expect(history.map((entry) => entry.startedAt)).toEqual([
            '2026-11-03T10:00:00.000Z',
            '2026-11-02T10:00:00.000Z',
            '2026-11-01T10:00:00.000Z',
        ]);
        expect(history.reduce((sum, entry) => sum + entry.xp, 0)).toBe(earned.progress.xp);
    });
});
