import { SetupId } from '@catalog/domain/exercise';
import { SetPerformed } from '@training/domain/set';
import { ExerciseSession } from '@training/domain/workout';
import { IsoDateTime } from '@shared/domain/event';
import { CURL, catalog, reps, setAt } from '../../testing/fixtures';
import { sessionPace } from './session-pace';

const BEFORE = '2026-11-09T10:00:00Z';
const NOW = '2026-11-11T10:00:00Z';

function session(time: string, sets: readonly SetPerformed[]): ExerciseSession {
    return { exerciseId: CURL, workoutStartedAt: time as IsoDateTime, sets };
}

/** Working sets of the given rep counts, all at 22 kg. */
const sets = (time: string, ...counts: number[]): SetPerformed[] =>
    counts.map((count) => setAt(time, [reps(count, 22)]));

describe('sessionPace', () => {
    const last = session(BEFORE, sets(BEFORE, 8, 8, 6, 5));

    it('before the first set, points at the first set of last time', () => {
        const pace = sessionPace(undefined, [last], catalog);

        expect(pace.next).toBe(last.sets[0]);
        expect(pace.soFar).toBeUndefined();
        expect(pace.session).toBeUndefined();
    });

    it('compares the sets so far with the same number of sets from last time', () => {
        const ahead = sessionPace(session(NOW, sets(NOW, 9, 8)), [last], catalog);
        const level = sessionPace(session(NOW, sets(NOW, 9, 7)), [last], catalog);
        const behind = sessionPace(session(NOW, sets(NOW, 8, 7)), [last], catalog);

        expect(ahead.soFar).toBe('up');
        // The split across sets does not matter: 9 + 7 is the same work as 8 + 8.
        expect(level.soFar).toBe('same');
        expect(behind.soFar).toBe('down');
    });

    it('points at the set of last time that the next set lines up with', () => {
        const pace = sessionPace(session(NOW, sets(NOW, 9, 8)), [last], catalog);

        expect(pace.next).toBe(last.sets[2]);
    });

    it('judges the session as a whole: ahead so far is not yet a beaten session', () => {
        const pace = sessionPace(session(NOW, sets(NOW, 9, 8)), [last], catalog);

        expect(pace.soFar).toBe('up');
        expect(pace.session).toBe('down');
    });

    it('has beaten last time once the total work is higher, with no set left to line up', () => {
        const pace = sessionPace(session(NOW, sets(NOW, 8, 8, 6, 6)), [last], catalog);

        expect(pace.session).toBe('up');
        expect(pace.next).toBeUndefined();
    });

    it('has beaten last time with any reps at a heavier load', () => {
        const heavier = session(NOW, [setAt(NOW, [reps(3, 24)])]);

        expect(sessionPace(heavier, [last], catalog).session).toBe('up');
    });

    it('ignores warm-up sets on both sides', () => {
        const warmUp = (time: string): SetPerformed =>
            setAt(time, [reps(10, 10)], { kind: 'warmup' });
        const previous = session(BEFORE, [warmUp(BEFORE), ...sets(BEFORE, 8, 8)]);
        const current = session(NOW, [warmUp(NOW), ...sets(NOW, 8)]);

        const pace = sessionPace(current, [previous], catalog);

        expect(pace.previous).toHaveLength(2);
        expect(pace.current).toHaveLength(1);
        expect(pace.soFar).toBe('same');
    });

    it('is a new baseline when there is no earlier session', () => {
        const pace = sessionPace(session(NOW, sets(NOW, 8)), [], catalog);

        expect(pace.previous).toEqual([]);
        expect(pace.soFar).toBeUndefined();
        expect(pace.next).toBeUndefined();
    });

    it('compares only within the same setup: a new setup is a new baseline', () => {
        const otherGym = 'other-gym' as SetupId;
        const current = session(NOW, [setAt(NOW, [reps(8, 22)], { setupId: otherGym })]);

        const pace = sessionPace(current, [last], catalog);

        expect(pace.previous).toEqual([]);
        expect(pace.soFar).toBeUndefined();
    });
});
