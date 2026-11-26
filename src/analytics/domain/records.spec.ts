import { ExerciseId, SetupId } from '@catalog/domain/exercise';
import { DomainEvent } from '@shared/domain/event';
import { RepGroup, SetPerformed, activeSets, voidSet } from '@training/domain/set';
import { ExerciseSession, exerciseSessions, groupIntoWorkouts } from '@training/domain/workout';
import {
    CURL,
    HAMMER_CURL,
    PARTIAL,
    PULL_UP,
    catalog,
    contextAt,
    reps,
    setAt,
} from '../../testing/fixtures';
import { RecordKind, recordTable, recordsOf } from './records';

const MACHINE = 'machine-b' as SetupId;

function sessionsOf(
    events: readonly DomainEvent[],
    exerciseId: ExerciseId = CURL,
): readonly ExerciseSession[] {
    return exerciseSessions(groupIntoWorkouts(activeSets(events)), exerciseId);
}

function records(
    events: readonly DomainEvent[],
    exerciseId: ExerciseId = CURL,
): ReadonlyMap<string, RecordKind> {
    return recordsOf(sessionsOf(events, exerciseId), catalog);
}

/** A working set on day `day` of November, `minute` minutes past ten. */
function on(
    day: number,
    minute: number,
    groups: readonly RepGroup[],
    options: { kind?: 'working' | 'warmup'; setupId?: SetupId } = {},
): SetPerformed {
    const date = `2026-11-${String(day).padStart(2, '0')}T10:${String(minute).padStart(2, '0')}:00Z`;
    return setAt(date, groups, options);
}

describe('recordsOf', () => {
    it('makes the first set at the heaviest load the weight record, with any reps', () => {
        const first = on(1, 0, [reps(10, 20)]);
        const heavier = on(3, 0, [reps(2, 22.5)]);

        expect(records([first, heavier]).get(heavier.id)).toBe('both');
    });

    it('keeps the weight record on the first set at that load when later sets do more reps there', () => {
        const first = on(1, 0, [reps(8, 20)]);
        const heavy = on(3, 0, [reps(2, 25)]);
        const moreReps = on(5, 0, [reps(5, 25)]);
        const evenMore = on(7, 0, [reps(6, 25)]);

        const found = records([first, heavy, moreReps, evenMore]);

        expect(found.get(heavy.id)).toBe('weight');
        expect(found.get(evenMore.id)).toBe('reps');
        expect(found.size).toBe(2);
    });

    it('holds exactly one weight record and one rep record: a heavier set takes both over', () => {
        const sets = [on(1, 0, [reps(8, 20)]), on(3, 0, [reps(2, 25)]), on(3, 5, [reps(4, 25)])];
        const heavier = on(5, 0, [reps(1, 27.5)]);

        const found = records([...sets, heavier]);

        expect([...found]).toEqual([[heavier.id, 'both']]);
    });

    it('never gives a lighter set a record, however many reps (40 kg × 2, 40 kg × 40, 30 kg × 100)', () => {
        const weight = on(1, 0, [reps(2, 40)]);
        const repRecord = on(3, 0, [reps(40, 40)]);
        const manyLight = on(5, 0, [reps(100, 30)]);

        const found = records([weight, repRecord, manyLight]);

        expect(found.get(weight.id)).toBe('weight');
        expect(found.get(repRecord.id)).toBe('reps');
        expect(found.has(manyLight.id)).toBe(false);
    });

    it('leaves a tie with the earlier set', () => {
        const first = on(1, 0, [reps(8, 20)]);
        const same = on(3, 0, [reps(8, 20)]);

        const found = records([first, same]);

        expect(found.get(first.id)).toBe('both');
        expect(found.has(same.id)).toBe(false);
    });

    it('gives a setup with a single session no records', () => {
        expect(records([on(1, 0, [reps(8, 20)]), on(1, 5, [reps(9, 20)])]).size).toBe(0);
    });

    it('lets the first session hold the records once a second session exists', () => {
        const best = on(1, 0, [reps(8, 30)]);
        const lighter = on(3, 0, [reps(12, 20)]);

        const found = records([best, lighter]);

        expect(found.get(best.id)).toBe('both');
        expect(found.has(lighter.id)).toBe(false);
    });

    it('judges a set on another setup only against that setup’s history', () => {
        const usual = [on(1, 0, [reps(8, 40)]), on(3, 0, [reps(8, 40)])];
        const machineFirst = on(5, 0, [reps(8, 10)], { setupId: MACHINE });
        const machineSecond = on(7, 0, [reps(9, 10)], { setupId: MACHINE });

        const found = records([...usual, machineFirst, machineSecond]);

        expect(found.get(usual[0]?.id ?? '')).toBe('both');
        expect(found.get(machineFirst.id)).toBe('weight');
        expect(found.get(machineSecond.id)).toBe('reps');
    });

    it('lets warm-ups and voided sets never hold a record', () => {
        const first = on(1, 0, [reps(8, 20)]);
        const heavyWarmUp = on(3, 0, [reps(12, 30)], { kind: 'warmup' });
        const voided = on(3, 2, [reps(15, 20)]);
        const record = on(3, 5, [reps(9, 20)]);

        const found = records([
            first,
            heavyWarmUp,
            voided,
            voidSet(voided.id, contextAt(T(3))),
            record,
        ]);

        expect(found.has(heavyWarmUp.id)).toBe(false);
        expect(found.has(voided.id)).toBe(false);
        expect(found.get(first.id)).toBe('weight');
        expect(found.get(record.id)).toBe('reps');
    });

    it('lets partials never make or break a record', () => {
        const first = on(1, 0, [reps(8, 20), reps(6, 20, { technique: PARTIAL })]);
        // Same full reps, more partials: not a record.
        const morePartials = on(3, 0, [reps(8, 20), reps(10, 20, { technique: PARTIAL })]);
        // Only partials, heavier: never a record.
        const onlyPartials = on(3, 5, [reps(5, 30, { technique: PARTIAL })]);

        const found = records([first, morePartials, onlyPartials]);

        expect(found.get(first.id)).toBe('both');
        expect(found.size).toBe(1);
    });

    it('counts each exercise’s rep groups in a mixed-exercise set for that exercise only', () => {
        const first = on(1, 0, [reps(8, 20)]);
        // Alternating curl and hammer curl: 4 curls at 20 plus 4 hammer curls at 30. The hammer
        // curls are heavier, but they say nothing about the curl.
        const mixed = on(3, 0, [
            reps(1, 20),
            reps(1, 30, { exerciseId: HAMMER_CURL }),
            reps(1, 20),
            reps(1, 30, { exerciseId: HAMMER_CURL }),
        ]);

        const found = records([first, mixed]);

        expect(found.get(first.id)).toBe('both');
        expect(found.has(mixed.id)).toBe(false);
    });

    it('counts less assistance on a bodyweight exercise as heavier', () => {
        const assisted = on(1, 0, [reps(8, -20, { exerciseId: PULL_UP })]);
        const lessAssisted = on(3, 0, [reps(5, -15, { exerciseId: PULL_UP })]);

        const found = records([assisted, lessAssisted], PULL_UP);

        expect(found.get(lessAssisted.id)).toBe('both');
        expect(found.has(assisted.id)).toBe(false);
    });

    it('compares kg and lb sets in kg', () => {
        const kilograms = on(1, 0, [reps(8, 20)]);
        // 45 lb is about 20.4 kg: heavier.
        const pounds = on(3, 0, [reps(8, 45, { unit: 'lb' })]);

        expect(records([kilograms, pounds]).get(pounds.id)).toBe('both');
    });

    it('gives the same records for events stored out of order', () => {
        const sets = [
            on(1, 0, [reps(8, 20)]),
            on(3, 0, [reps(2, 22.5)]),
            on(3, 5, [reps(5, 22.5)]),
            on(5, 0, [reps(5, 22.5)]),
        ];

        expect([...records(sets.toReversed())].sort()).toEqual([...records(sets)].sort());
        expect(records(sets).size).toBe(2);
    });
});

describe('recordTable', () => {
    it('keeps only rows that nothing beats on both load and reps, heaviest first', () => {
        const sets = [
            on(1, 0, [reps(9, 100)]),
            on(1, 5, [reps(8, 95)]), // beaten by 100 × 9
            on(3, 0, [reps(6, 105)]),
            on(3, 5, [reps(5, 105)]), // beaten by 105 × 6
            on(5, 0, [reps(3, 110)]),
            on(5, 5, [reps(9, 100)]), // a tie: the row keeps the first date
        ];

        const table = recordTable(sessionsOf(sets), undefined, catalog);

        expect(table.map((row) => [row.kilograms, row.reps])).toEqual([
            [110, 3],
            [105, 6],
            [100, 9],
        ]);
        expect(table.at(-1)?.occurredAt).toBe(T(1));
    });

    it('is empty while the setup has only one session', () => {
        const sets = [on(1, 0, [reps(8, 20)]), on(1, 5, [reps(10, 20)])];

        expect(recordTable(sessionsOf(sets), undefined, catalog)).toEqual([]);
    });

    it('lists only the given setup', () => {
        const sets = [
            on(1, 0, [reps(8, 40)]),
            on(3, 0, [reps(8, 10)], { setupId: MACHINE }),
            on(5, 0, [reps(9, 10)], { setupId: MACHINE }),
        ];

        const table = recordTable(sessionsOf(sets), MACHINE, catalog);

        expect(table.map((row) => [row.kilograms, row.reps])).toEqual([[10, 9]]);
    });
});

/** Ten o'clock on day `day` of November, as stored. */
function T(day: number): string {
    return `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`;
}
