import { SetupId } from '@catalog/domain/exercise';
import { SetId, SetPerformed } from '@training/domain/set';
import { exerciseSessions, groupIntoWorkouts } from '@training/domain/workout';
import { CURL, PARTIAL, PULL_UP, catalog, reps, setAt } from '../../testing/fixtures';
import { Progression, compareSets, sessionProgression } from './progression';

const BEFORE = '2026-11-09T10:00:00Z';
const NOW = '2026-11-11T10:00:00Z';

describe('compareSets', () => {
    it('is up with more reps at the same load', () => {
        const previous = setAt(BEFORE, [reps(8, 20)]);
        const current = setAt(NOW, [reps(9, 20)]);

        expect(compareSets(current, previous, catalog)).toBe('up');
    });

    it('is up with a heavier load, even with fewer reps', () => {
        const previous = setAt(BEFORE, [reps(10, 20)]);
        const current = setAt(NOW, [reps(6, 22.5)]);

        expect(compareSets(current, previous, catalog)).toBe('up');
    });

    it('is down with a lighter load, even with more reps', () => {
        const previous = setAt(BEFORE, [reps(6, 22.5)]);
        const current = setAt(NOW, [reps(12, 20)]);

        expect(compareSets(current, previous, catalog)).toBe('down');
    });

    it('is same for identical work', () => {
        const previous = setAt(BEFORE, [reps(8, 20)]);
        const current = setAt(NOW, [reps(8, 20)]);

        expect(compareSets(current, previous, catalog)).toBe('same');
    });

    it('is down with fewer full reps, however many partials are added', () => {
        const previous = setAt(BEFORE, [reps(5, 20)]);
        const current = setAt(NOW, [reps(4, 20), reps(10, 20, { technique: PARTIAL })]);

        expect(compareSets(current, previous, catalog)).toBe('down');
    });

    it('is up with the same full reps and more partials', () => {
        const previous = setAt(BEFORE, [reps(5, 20), reps(2, 20, { technique: PARTIAL })]);
        const current = setAt(NOW, [reps(5, 20), reps(3, 20, { technique: PARTIAL })]);

        expect(compareSets(current, previous, catalog)).toBe('up');
    });

    it('treats an alternating pattern like the same reps entered as blocks', () => {
        const blocks = setAt(BEFORE, [reps(2, 20), reps(2, 20, { technique: PARTIAL })]);
        const alternating = setAt(NOW, [
            reps(1, 20),
            reps(1, 20, { technique: PARTIAL }),
            reps(1, 20),
            reps(1, 20, { technique: PARTIAL }),
        ]);

        expect(compareSets(alternating, blocks, catalog)).toBe('same');
    });

    it('is up with less assistance on a bodyweight exercise', () => {
        const previous = setAt(BEFORE, [reps(6, -20, { exerciseId: PULL_UP })]);
        const current = setAt(NOW, [reps(6, -15, { exerciseId: PULL_UP })]);

        expect(compareSets(current, previous, catalog)).toBe('up');
    });

    it('compares across units by converting to kilograms', () => {
        const previous = setAt(BEFORE, [reps(8, 20)]);
        const current = setAt(NOW, [reps(8, 45, { unit: 'lb' })]); // 45 lb is about 20.4 kg

        expect(compareSets(current, previous, catalog)).toBe('up');
    });
});

describe('sessionProgression', () => {
    /** Progression of the latest curl session among `sets`, compared with the earlier ones. */
    function progressionOfLatest(sets: readonly SetPerformed[]): ReadonlyMap<SetId, Progression> {
        const sessions = exerciseSessions(groupIntoWorkouts(sets), CURL);
        const latest = sessions.at(-1);
        if (latest === undefined) {
            throw new Error('Test fixture has no curl session');
        }
        return sessionProgression(latest, sessions.slice(0, -1), catalog);
    }

    it('compares each working set with the same-numbered set of the previous session', () => {
        const up = setAt('2026-11-11T10:00:00Z', [reps(9, 20)]);
        const down = setAt('2026-11-11T10:05:00Z', [reps(6, 20)]);
        const extra = setAt('2026-11-11T10:10:00Z', [reps(5, 20)]);
        const progression = progressionOfLatest([
            setAt('2026-11-09T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-09T10:05:00Z', [reps(7, 20)]),
            up,
            down,
            extra,
        ]);

        expect(progression.get(up.id)).toBe('up');
        expect(progression.get(down.id)).toBe('down');
        expect(progression.get(extra.id)).toBe('extra');
    });

    it('is a baseline when there is no earlier session', () => {
        const first = setAt(NOW, [reps(8, 20)]);
        const progression = progressionOfLatest([first]);

        expect(progression.get(first.id)).toBe('baseline');
    });

    it('is a baseline on a new setup, even though the load dropped', () => {
        const newMachine = 'other-gym' as SetupId;
        const first = setAt(NOW, [reps(8, 30)], { setupId: newMachine });
        const progression = progressionOfLatest([setAt(BEFORE, [reps(8, 44)]), first]);

        expect(progression.get(first.id)).toBe('baseline');
    });

    it('resumes the old history when returning to an earlier setup', () => {
        const otherGym = 'other-gym' as SetupId;
        const back = setAt('2026-11-11T10:00:00Z', [reps(9, 44)]);
        const progression = progressionOfLatest([
            setAt('2026-11-07T10:00:00Z', [reps(8, 44)]),
            setAt('2026-11-09T10:00:00Z', [reps(8, 30)], { setupId: otherGym }),
            back,
        ]);

        expect(progression.get(back.id)).toBe('up');
    });

    it('skips warm-up sets on both sides', () => {
        const working = setAt('2026-11-11T10:05:00Z', [reps(9, 20)]);
        const warmUp = setAt('2026-11-11T10:00:00Z', [reps(10, 10)], { kind: 'warmup' });
        const progression = progressionOfLatest([
            setAt('2026-11-09T10:00:00Z', [reps(10, 10)], { kind: 'warmup' }),
            setAt('2026-11-09T10:05:00Z', [reps(8, 20)]),
            warmUp,
            working,
        ]);

        expect(progression.get(working.id)).toBe('up');
        expect(progression.has(warmUp.id)).toBe(false);
    });

    it('compares a light set like any working set: easy on purpose is still judged', () => {
        const light = setAt('2026-11-11T10:00:00Z', [reps(8, 12)], { effort: { kind: 'light' } });
        const progression = progressionOfLatest([
            setAt('2026-11-09T10:00:00Z', [reps(8, 20)]),
            light,
        ]);

        expect(progression.get(light.id)).toBe('down');
    });
});
