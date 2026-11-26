import { SetupId } from '@catalog/domain/exercise';
import { IsoDateTime } from '@shared/domain/event';
import { SetPerformed } from '@training/domain/set';
import { exerciseSessions, groupIntoWorkouts } from '@training/domain/workout';
import { CURL, catalog, reps, setAt } from '../../testing/fixtures';
import { SessionProgress, exerciseProgress } from './exercise-progress';
import { DEFAULT_STALL_THRESHOLD, isStalled, stalledFor, stalledForNow } from './stall';

const MACHINE = 'machine-b' as SetupId;

function progressOf(sets: readonly SetPerformed[]): readonly SessionProgress[] {
    return exerciseProgress(exerciseSessions(groupIntoWorkouts(sets), CURL), catalog);
}

const startOf = (day: number): IsoDateTime =>
    `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z` as IsoDateTime;

/** One session on the given day: one set per rep count, all at `load` kg. */
function session(
    day: number,
    load: number,
    repCounts: readonly number[],
    setupId?: SetupId,
): SetPerformed[] {
    return repCounts.map((count, index) =>
        setAt(
            `2026-11-${String(day).padStart(2, '0')}T10:${String(index * 5).padStart(2, '0')}:00Z`,
            [reps(count, load)],
            setupId === undefined ? {} : { setupId },
        ),
    );
}

/** A baseline of 8 at 20 kg, then sessions at 20 kg with the given total reps. */
function history(...totals: number[]): SetPerformed[] {
    return [
        session(1, 20, [8]),
        ...totals.map((total, index) => session(index + 2, 20, [total])),
    ].flat();
}

describe('stalledFor', () => {
    it('makes a stall of three finished sessions in a row that are same or down', () => {
        const count = stalledFor(progressOf(history(9, 9, 8, 8)), false);

        expect(count).toBe(3);
        expect(isStalled(count, DEFAULT_STALL_THRESHOLD)).toBe(true);
    });

    it('does not make a stall of two', () => {
        const count = stalledFor(progressOf(history(9, 9, 9)), false);

        expect(count).toBe(2);
        expect(isStalled(count, DEFAULT_STALL_THRESHOLD)).toBe(false);
    });

    it('ends the count at an up session', () => {
        expect(stalledFor(progressOf(history(8, 8, 9, 9)), false)).toBe(1);
    });

    it('ends the count at a baseline (a new setup)', () => {
        const sets = [
            ...history(8, 8, 8),
            ...session(10, 30, [8], MACHINE),
            ...session(12, 30, [8], MACHINE),
        ];

        expect(stalledFor(progressOf(sets), false)).toBe(1);
    });

    it('counts only the current setup’s sessions', () => {
        // Stalled on the usual setup, then two sessions on another machine in between, then back.
        const sets = [
            ...history(8, 8),
            ...session(10, 30, [8], MACHINE),
            ...session(11, 30, [9], MACHINE),
            ...session(12, 20, [8]),
        ];

        expect(stalledFor(progressOf(sets), false)).toBe(3);
    });

    it('ends the stall at once when the session in progress has beaten the last one', () => {
        expect(stalledFor(progressOf(history(8, 8, 8)), true)).toBe(0);
    });

    it('cannot stall, with the default threshold, an exercise with fewer than 4 sessions on its setup', () => {
        const count = stalledFor(progressOf(history(7, 7)), false);

        expect(isStalled(count, DEFAULT_STALL_THRESHOLD)).toBe(false);
    });

    it('stalls with a threshold of 2 after two sessions in a row without progress', () => {
        expect(isStalled(stalledFor(progressOf(history(8, 8)), false), 2)).toBe(true);
    });

    it('never stalls with a threshold of 0 (off)', () => {
        expect(isStalled(stalledFor(progressOf(history(8, 8, 8, 8, 8, 8)), false), 0)).toBe(false);
    });
});

describe('stalledForNow', () => {
    it('ignores an unfinished session in progress that is behind or level', () => {
        // Finished: 8, then 8, 8, 8 (three without progress). Today, in progress: 8 so far.
        const progress = progressOf(history(8, 8, 8, 8));

        expect(stalledForNow(progress, startOf(5))).toBe(3);
        // Once that workout is over it counts: four in a row.
        expect(stalledForNow(progress, undefined)).toBe(4);
    });

    it('ends the stall at once when the session in progress has beaten the last one', () => {
        const progress = progressOf(history(8, 8, 8, 9));

        expect(stalledForNow(progress, startOf(5))).toBe(0);
    });
});
