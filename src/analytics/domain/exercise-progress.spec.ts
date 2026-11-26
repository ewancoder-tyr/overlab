import { SetupId } from '@catalog/domain/exercise';
import { SetPerformed } from '@training/domain/set';
import { exerciseSessions, groupIntoWorkouts } from '@training/domain/workout';
import { CURL, PARTIAL, catalog, reps, setAt } from '../../testing/fixtures';
import { SessionProgress, exerciseProgress, summariseProgress } from './exercise-progress';

function progressOf(sets: readonly SetPerformed[]): readonly SessionProgress[] {
    return exerciseProgress(exerciseSessions(groupIntoWorkouts(sets), CURL), catalog);
}

/** One session on the given day: one set per rep count, all at `load` kg. */
function session(day: number, load: number, ...repCounts: number[]): SetPerformed[] {
    return repCounts.map((count, index) =>
        setAt(
            `2026-11-${String(day).padStart(2, '0')}T10:${String(index * 5).padStart(2, '0')}:00Z`,
            [reps(count, load)],
        ),
    );
}

describe('exerciseProgress', () => {
    it('judges the whole exercise: one more rep in any set makes the session better', () => {
        const progress = progressOf([...session(1, 22, 8, 8, 6, 5), ...session(3, 22, 8, 8, 6, 6)]);

        expect(progress.map((entry) => entry.verdict)).toEqual(['baseline', 'up']);
        expect(progress.map((entry) => entry.reps)).toEqual([27, 28]);
    });

    it('is the same when every set matches last time', () => {
        const progress = progressOf([...session(1, 22, 8, 8, 6, 5), ...session(3, 22, 8, 8, 6, 5)]);

        expect(progress.at(-1)?.verdict).toBe('same');
    });

    it('is down when a rep is lost and nothing makes up for it', () => {
        const progress = progressOf([...session(1, 22, 8, 8, 6, 5), ...session(3, 22, 8, 8, 6, 4)]);

        expect(progress.at(-1)?.verdict).toBe('down');
    });

    it('counts total reps at a load, however they are split across sets', () => {
        const progress = progressOf([...session(1, 22, 8, 8, 6, 5), ...session(3, 22, 9, 8, 6, 4)]);

        expect(progress.at(-1)?.verdict).toBe('same');
    });

    it('is up when some of the work moved to a heavier load, even with fewer reps overall', () => {
        const progress = progressOf([...session(1, 22, 8, 8, 6, 5), ...session(3, 24, 6, 5, 5)]);

        expect(progress.at(-1)?.verdict).toBe('up');
        expect(progress.at(-1)?.loadInKilograms).toBe(24);
    });

    it('does not let extra partials make up for fewer full reps', () => {
        const progress = progressOf([
            ...session(1, 22, 8, 8),
            setAt('2026-11-03T10:00:00Z', [reps(8, 22)]),
            setAt('2026-11-03T10:05:00Z', [reps(7, 22), reps(5, 22, { technique: PARTIAL })]),
        ]);

        expect(progress.at(-1)?.verdict).toBe('down');
        expect(progress.at(-1)?.reps).toBe(15);
    });

    it('ignores warm-up sets', () => {
        const progress = progressOf([
            ...session(1, 22, 8, 8),
            setAt('2026-11-03T09:55:00Z', [reps(12, 10)], { kind: 'warmup' }),
            ...session(3, 22, 8, 8),
        ]);

        expect(progress.at(-1)?.verdict).toBe('same');
        expect(progress.at(-1)?.sets).toHaveLength(2);
    });

    it('starts a new baseline on a different setup', () => {
        const progress = progressOf([
            setAt('2026-11-01T10:00:00Z', [reps(8, 44)]),
            setAt('2026-11-03T10:00:00Z', [reps(8, 30)], { setupId: 'other-gym' as SetupId }),
        ]);

        expect(progress.map((entry) => entry.verdict)).toEqual(['baseline', 'baseline']);
    });

    it('leaves out sessions that were warm-ups only', () => {
        expect(
            progressOf([setAt('2026-11-01T10:00:00Z', [reps(12, 10)], { kind: 'warmup' })]),
        ).toEqual([]);
    });
});

describe('summariseProgress', () => {
    it('counts improved sessions and the current streak', () => {
        const progress = progressOf([
            setAt('2026-11-01T10:00:00Z', [reps(8, 20)]), // baseline
            setAt('2026-11-03T10:00:00Z', [reps(9, 20)]), // up
            setAt('2026-11-05T10:00:00Z', [reps(8, 20)]), // down
            setAt('2026-11-07T10:00:00Z', [reps(9, 20)]), // up
            setAt('2026-11-09T10:00:00Z', [reps(6, 22.5)]), // up
        ]);

        expect(summariseProgress(progress)).toEqual({ compared: 4, improved: 3, streak: 2 });
    });

    it('has nothing to report for a single session', () => {
        expect(
            summariseProgress(progressOf([setAt('2026-11-01T10:00:00Z', [reps(8, 20)])])),
        ).toEqual({
            compared: 0,
            improved: 0,
            streak: 0,
        });
    });
});
