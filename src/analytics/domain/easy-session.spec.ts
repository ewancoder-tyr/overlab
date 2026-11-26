import { SetPerformed } from '@training/domain/set';
import { exerciseSessions, groupIntoWorkouts, standaloneSessions } from '@training/domain/workout';
import { CURL, catalog, reps, setAt } from '../../testing/fixtures';
import { SessionProgress, SessionVerdict, exerciseProgress } from './exercise-progress';
import { sessionPace } from './session-pace';
import { stalledFor, stalledForNow } from './stall';
import { weeklyVolume } from './weekly-volume';

const at = (day: number, minute = 0): string =>
    `2026-11-${String(day).padStart(2, '0')}T10:${String(minute).padStart(2, '0')}:00Z`;

const easy = (day: number, count: number, minute = 0): SetPerformed =>
    setAt(at(day, minute), [reps(count, 20)], { effort: { kind: 'easy' } });
const hard = (day: number, count: number, minute = 0): SetPerformed =>
    setAt(at(day, minute), [reps(count, 20)]);

const progressOf = (sets: readonly SetPerformed[]): readonly SessionProgress[] =>
    exerciseProgress(exerciseSessions(groupIntoWorkouts(sets), CURL), catalog);

describe('an easy set', () => {
    it('counts as no set in weekly volume, but its reps count', () => {
        const volume = weeklyVolume([easy(10, 12)], catalog, new Date(at(11)));
        const biceps = volume.find((each) => each.muscleGroup.id === 'biceps');

        expect(biceps?.sets).toBe(0);
        expect(biceps?.reps).toBe(12);
        expect(biceps?.byExercise).toEqual([]);
    });

    it('counts in weekly volume once done with real effort, standalone or not', () => {
        const set = setAt(at(10), [reps(12, 20)], { standalone: true });
        const volume = weeklyVolume([set], catalog, new Date(at(11)));

        expect(volume.find((each) => each.muscleGroup.id === 'biceps')?.sets).toBe(1);
    });

    it('is compared like any working set: 10, 10, 11 is baseline, same, up', () => {
        const progress = progressOf([easy(1, 10), easy(2, 10), easy(3, 11)]);

        expect(progress.map((entry) => entry.verdict)).toEqual(['baseline', 'same', 'up']);
        expect(progress.every((entry) => entry.easy)).toBe(true);
    });
});

describe('an easy session', () => {
    it('is one whose working sets are all easy: one set of real effort makes it a real one', () => {
        const progress = progressOf([easy(1, 10), easy(2, 10), hard(2, 10, 5)]);

        expect(progress.map((entry) => entry.easy)).toEqual([true, false]);
    });

    it('never stalls: holding the same easy reps is the plan', () => {
        const progress = progressOf([easy(1, 10), easy(2, 10), easy(3, 10), easy(4, 10)]);

        expect(stalledFor(progress, false)).toBe(0);
    });

    it('is skipped by the stall count: easy, hard, hard, easy, hard, all level, is a stall of 3', () => {
        const progress = progressOf([
            easy(1, 10),
            hard(2, 10),
            hard(3, 10),
            easy(4, 10),
            hard(5, 10),
        ]);

        expect(stalledFor(progress, false)).toBe(3);
    });

    it('does not end a stall by beating last time the easy way', () => {
        const progress = progressOf([hard(1, 10), hard(2, 10), hard(3, 10), easy(4, 11)]);

        expect(progress.at(-1)?.verdict).toBe('up');
        expect(stalledFor(progress, false)).toBe(2);
        // The same while that easy session is still in progress.
        expect(stalledForNow(progress, progress.at(-1)?.startedAt)).toBe(2);
    });

    it('is told to the logging screen, where level with last time is then a success', () => {
        const sessions = exerciseSessions(groupIntoWorkouts([easy(1, 10), easy(2, 10)]), CURL);

        const pace = sessionPace(sessions[1], sessions.slice(0, 1), catalog);

        expect(pace.easy).toBe(true);
        expect(pace.session).toBe('same');
    });
});

describe('standalone sessions', () => {
    it('are compared among themselves, never with workout sessions', () => {
        const sets = [
            setAt(at(1), [reps(30, 20)]),
            setAt(at(2), [reps(10, 20)], { standalone: true }),
            setAt(at(3), [reps(11, 20)], { standalone: true }),
        ];

        const standalone = exerciseProgress(standaloneSessions(sets, CURL), catalog);

        // Not "down" against the 30 of the workout: the first standalone session is a baseline.
        expect(standalone.map((entry) => entry.verdict)).toEqual(['baseline', 'up']);
    });

    it('add up within a session: 10 + 8 is matched by 9 + 9, and 10 alone is behind', () => {
        const morning = [
            setAt('2026-11-01T07:00:00Z', [reps(10, 20)], { standalone: true }),
            setAt('2026-11-01T07:20:00Z', [reps(8, 20)], { standalone: true }),
        ];
        const verdictOf = (...evening: number[]): SessionVerdict | undefined =>
            exerciseProgress(
                standaloneSessions(
                    [
                        ...morning,
                        ...evening.map((count, index) =>
                            setAt(`2026-11-01T19:0${index}:00Z`, [reps(count, 20)], {
                                standalone: true,
                            }),
                        ),
                    ],
                    CURL,
                ),
                catalog,
            ).at(-1)?.verdict;

        expect(verdictOf(9, 9)).toBe('same');
        expect(verdictOf(10)).toBe('down');
    });
});
