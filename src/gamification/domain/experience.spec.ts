import { IsoDateTime } from '@shared/domain/event';
import { SetPerformed } from '@training/domain/set';
import { CardioPerformed } from '@training/domain/cardio';
import { groupIntoWorkouts } from '@training/domain/workout';
import { CURL, HAMMER_CURL, RUNNING, cardioAt, catalog, reps, setAt } from '../../testing/fixtures';
import { XP, experience } from './experience';

const RULES = { lightSetWeight: 0.5, stallThreshold: 3 };

function xpOf(
    sets: readonly SetPerformed[],
    options: { cardio?: readonly CardioPerformed[]; epoch?: string; stallThreshold?: number } = {},
): number {
    return experience(
        groupIntoWorkouts(sets, options.cardio ?? []),
        catalog,
        options.epoch as IsoDateTime | undefined,
        { ...RULES, stallThreshold: options.stallThreshold ?? RULES.stallThreshold },
    ).progress.xp;
}

/** One session on the given day: one curl set per rep count, all at `load` kg. */
function session(day: number, load: number, ...repCounts: number[]): SetPerformed[] {
    return repCounts.map((count, index) =>
        setAt(
            `2026-11-${String(day).padStart(2, '0')}T10:${String(index * 5).padStart(2, '0')}:00Z`,
            [reps(count, load)],
        ),
    );
}

describe('experience', () => {
    it('gives every working set the same experience, whatever the weight', () => {
        expect(xpOf(session(1, 10, 8, 8))).toBe(2 * XP.set);
        expect(xpOf(session(1, 100, 8, 8))).toBe(2 * XP.set);
    });

    it('gives a warm-up nothing and a light set the light set weight', () => {
        const sets = [
            setAt('2026-11-01T10:00:00Z', [reps(10, 5)], { kind: 'warmup' }),
            setAt('2026-11-01T10:05:00Z', [reps(10, 5)], { effort: { kind: 'light' } }),
        ];

        expect(xpOf(sets)).toBe(XP.set / 2);
    });

    it('gives a set to failure 12 instead of 10, and says so', () => {
        const sets = [
            setAt('2026-11-01T10:00:00Z', [reps(8, 20)], { effort: { kind: 'failure' } }),
            setAt('2026-11-01T10:05:00Z', [reps(8, 20)], {
                effort: { kind: 'reps-in-reserve', repsInReserve: 1 },
            }),
        ];
        const result = experience(groupIntoWorkouts(sets), catalog, undefined, RULES);

        expect(XP.set + XP.failure).toBe(12);
        expect(Object.fromEntries(result.byReason)).toEqual({ set: 20, failure: 2 });
    });

    it('splits a mixed set between its exercises by their share of its reps', () => {
        const mixed = setAt('2026-11-01T10:00:00Z', [
            reps(6, 10),
            reps(2, 10, { exerciseId: HAMMER_CURL }),
        ]);
        const result = experience(groupIntoWorkouts([mixed]), catalog, undefined, RULES);

        expect(result.byExercise.map((entry) => [entry.exerciseId, entry.progress.xp])).toEqual([
            [CURL, 7.5],
            [HAMMER_CURL, 2.5],
        ]);
    });

    it('pays for a beaten session, and a heavier set than ever as a weight record', () => {
        // Day 3 beats day 1 with more reps (a rep record at 20 kg), day 5 goes heavier.
        const base = xpOf(session(1, 20, 8));
        const beaten = xpOf([...session(1, 20, 8), ...session(3, 20, 9)]);
        const heavier = xpOf([...session(1, 20, 8), ...session(3, 20, 9), ...session(5, 22, 5)]);

        expect(base).toBe(XP.set);
        expect(beaten - base).toBe(XP.set + XP.sessionBeaten + XP.repRecord);
        expect(heavier - beaten).toBe(XP.set + XP.sessionBeaten + XP.weightRecord);
    });

    it('treats the first session on a setup as a baseline with no record bonus', () => {
        expect(xpOf(session(1, 100, 10))).toBe(XP.set);
    });

    it('pays every set that sets a new best, several in one session included', () => {
        const sets = [
            ...session(1, 20, 8),
            setAt('2026-11-03T10:00:00Z', [reps(8, 21)]),
            setAt('2026-11-03T10:05:00Z', [reps(8, 22)]),
            setAt('2026-11-03T10:10:00Z', [reps(9, 22)]),
        ];
        const result = experience(groupIntoWorkouts(sets), catalog, undefined, RULES);

        // Two weight records and a rep record on day 3, and the session beaten once.
        expect(Object.fromEntries(result.byReason)).toEqual({
            set: 4 * XP.set,
            'weight-record': 2 * XP.weightRecord,
            'rep-record': XP.repRecord,
            beaten: XP.sessionBeaten,
        });
    });

    it('keeps a record bonus once a later, heavier set takes the record over', () => {
        const before = xpOf([...session(1, 20, 8), ...session(3, 22, 8)]);
        const after = xpOf([...session(1, 20, 8), ...session(3, 22, 8), ...session(5, 24, 8)]);

        expect(after - before).toBe(XP.set + XP.sessionBeaten + XP.weightRecord);
    });

    it('pays extra for the session that breaks a stall', () => {
        // Three sessions level with the first make a stall at the threshold of 3; day 9 breaks it.
        const stalled = [
            ...session(1, 20, 8),
            ...session(3, 20, 8),
            ...session(5, 20, 8),
            ...session(7, 20, 8),
        ];
        const broken = [...stalled, ...session(9, 20, 9)];
        const gain = xpOf(broken) - xpOf(stalled);

        expect(gain).toBe(XP.set + XP.sessionBeaten + XP.repRecord + XP.stallBroken);
        // With stalls switched off there is no stall to break.
        expect(xpOf(broken, { stallThreshold: 0 }) - xpOf(stalled, { stallThreshold: 0 })).toBe(
            XP.set + XP.sessionBeaten + XP.repRecord,
        );
    });

    it('counts only what happened after the latest reset, judged against all of history', () => {
        const sets = [...session(1, 20, 8), ...session(3, 20, 9)];

        // Day 1 is before the reset; day 3 still beat it, and still holds the rep record.
        expect(xpOf(sets, { epoch: '2026-11-02T00:00:00.000Z' })).toBe(
            XP.set + XP.sessionBeaten + XP.repRecord,
        );
        expect(xpOf(sets, { epoch: '2026-11-04T00:00:00.000Z' })).toBe(0);
    });

    it('gives cardio a point a minute, and a bonus for matching last time', () => {
        const cardio = [
            cardioAt('2026-11-01T10:00:00Z', { meters: 5000, seconds: 1800 }),
            cardioAt('2026-11-03T10:00:00Z', { meters: 5000, seconds: 1800 }),
        ];
        const result = experience(groupIntoWorkouts([], cardio), catalog, undefined, RULES);

        expect(result.byExercise[0]?.exerciseId).toBe(RUNNING);
        expect(result.progress.xp).toBe(60 * XP.cardioMinute + XP.cardioMatched);
    });

    it('gives a cardio record its bonus', () => {
        const cardio = [
            cardioAt('2026-11-01T10:00:00Z', { meters: 5000, seconds: 1800 }),
            cardioAt('2026-11-03T10:00:00Z', { meters: 6000, seconds: 1800 }),
        ];

        expect(xpOf([], { cardio })).toBe(
            60 * XP.cardioMinute + XP.cardioMatched + XP.cardioRecord,
        );
    });

    it('lists exercises with the most experience first, each with its level', () => {
        const sets = [
            ...session(1, 20, 8),
            setAt('2026-11-01T10:30:00Z', [reps(8, 10, { exerciseId: HAMMER_CURL })]),
            setAt('2026-11-01T10:35:00Z', [reps(8, 10, { exerciseId: HAMMER_CURL })]),
        ];
        const result = experience(groupIntoWorkouts(sets), catalog, undefined, RULES);

        expect(result.byExercise.map((entry) => entry.exerciseId)).toEqual([HAMMER_CURL, CURL]);
        expect(result.byExercise[0]?.progress.level).toBe(2);
        expect(result.progress.level).toBe(1);
    });
});
