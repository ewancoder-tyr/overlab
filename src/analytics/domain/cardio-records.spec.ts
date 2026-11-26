import { CardioPerformed } from '@training/domain/cardio';
import { CardioSession, cardioSessions, groupIntoWorkouts } from '@training/domain/workout';
import { RUNNING, STAIR_CLIMBER, TREADMILL, cardioAt } from '../../testing/fixtures';
import { CardioRecordKind, cardioRecordTable, cardioRecords } from './cardio-records';

interface Measures {
    meters?: number;
    seconds?: number;
    kcal?: number;
    incline?: number;
}

const day = (n: number, minute = 0): string =>
    `2026-11-${String(n).padStart(2, '0')}T10:${String(minute).padStart(2, '0')}:00Z`;

/** One bout per day, from day 1, of the running exercise unless said otherwise. */
function sessionsOf(measures: readonly Measures[], exercise = RUNNING): readonly CardioSession[] {
    const bouts = measures.map((entry, index) => cardioAt(day(index + 1), entry, exercise));
    return cardioSessions(groupIntoWorkouts([], bouts), exercise);
}

function kinds(sessions: readonly CardioSession[]): readonly (CardioRecordKind | undefined)[] {
    return cardioRecords(sessions).map((entry) => entry.record);
}

const run = (km: number, minutes: number): Measures => ({
    meters: km * 1000,
    seconds: minutes * 60,
});

describe('cardioRecords', () => {
    it('gives the first session no record: it is a baseline', () => {
        const [first] = cardioRecords(sessionsOf([run(5, 30)]));

        expect(first?.baseline).toBe(true);
        expect(first?.record).toBeUndefined();
    });

    it('makes a farther run than ever, at any speed, a distance record', () => {
        expect(kinds(sessionsOf([run(5, 25), run(6, 40)]))).toEqual([undefined, 'distance']);
    });

    it('makes a faster run than any earlier one at that distance or farther a speed record', () => {
        // 10 km at 12 km/h, then 5 km at 10 km/h, then 5 km at 12.5 km/h: the last is slower
        // than nothing that went as far, so it is a speed record though 10 km was farther.
        const sessions = sessionsOf([run(10, 50), run(5, 30), run(5, 24)]);

        expect(kinds(sessions)).toEqual([undefined, undefined, 'speed']);
    });

    it('does not count equalling the best as a record', () => {
        expect(kinds(sessionsOf([run(5, 30), run(5, 30), run(4, 24)]))).toEqual([
            undefined,
            undefined,
            undefined,
        ]);
    });

    it('judges a session on its bouts added up', () => {
        // Two 2.5 km runs in one workout make a 5 km session, which beats yesterday's 4 km.
        const bouts: CardioPerformed[] = [
            cardioAt(day(1), run(4, 24)),
            cardioAt(day(2, 0), run(2.5, 15)),
            cardioAt(day(2, 20), run(2.5, 15)),
        ];
        const sessions = cardioSessions(groupIntoWorkouts([], bouts), RUNNING);

        expect(kinds(sessions)).toEqual([undefined, 'distance']);
    });

    it('compares on what both sessions recorded, and a session with nothing in common is a baseline', () => {
        const entries = cardioRecords(sessionsOf([run(5, 30), { kcal: 300 }, run(6, 40)]));

        expect(entries.map((entry) => entry.baseline)).toEqual([true, true, false]);
        expect(entries.at(-1)?.record).toBe('distance');
    });

    it('judges a machine without distance on calories and burn rate', () => {
        const sessions = sessionsOf(
            [
                { seconds: 1800, kcal: 300 },
                { seconds: 2400, kcal: 360 }, // more calories: a calories record
                { seconds: 1200, kcal: 240 }, // 12 kcal/min, best rate below 360: a burn-rate record
                { seconds: 1800, kcal: 300 }, // matched before
            ],
            STAIR_CLIMBER,
        );

        expect(kinds(sessions)).toEqual([undefined, 'calories', 'burn-rate', undefined]);
    });

    it('makes the longest session a duration record when only time is recorded', () => {
        const sessions = sessionsOf([{ seconds: 1200 }, { seconds: 1500 }, { seconds: 1400 }]);

        expect(kinds(sessions)).toEqual([undefined, 'duration', undefined]);
    });
});

describe('cardioRecordTable', () => {
    it('keeps the best speed for each distance that nothing beats on both, farthest first', () => {
        const table = cardioRecordTable(
            sessionsOf([run(5, 30), run(10, 60), run(5, 24), run(8, 48), run(10, 55)]),
        );

        expect(table.map((row) => [row.totals.distanceMeters, row.totals.durationSeconds])).toEqual(
            [
                [10_000, 3300],
                [5000, 1440],
            ],
        );
    });

    it('has one row, the most, when only one measure is recorded', () => {
        const table = cardioRecordTable(sessionsOf([{ seconds: 1200 }, { seconds: 1500 }]));

        expect(table.map((row) => row.totals)).toEqual([{ durationSeconds: 1500 }]);
    });

    it('is empty until there are two sessions with the latest session’s measures', () => {
        expect(cardioRecordTable(sessionsOf([run(5, 30)]))).toEqual([]);
        expect(cardioRecordTable(sessionsOf([{ kcal: 300 }, run(5, 30)]))).toEqual([]);
    });
});

describe('cardio records on a treadmill', () => {
    const hill = (km: number, minutes: number, incline: number): Measures => ({
        ...run(km, minutes),
        incline,
    });

    it('marks a climb record when the climb is more than ever and the distance is not', () => {
        // 5 km at 2% (100 m), then the same run at 4% (200 m): no farther, no faster, steeper.
        const sessions = sessionsOf([hill(5, 30, 2), hill(5, 30, 4)], TREADMILL);

        expect(kinds(sessions)).toEqual([undefined, 'climb']);
    });

    it('prefers the distance record when the session is also the farthest', () => {
        const sessions = sessionsOf([hill(5, 30, 2), hill(6, 36, 4)], TREADMILL);

        expect(kinds(sessions)).toEqual([undefined, 'distance']);
    });

    it('gives no record for the same run on a flatter belt', () => {
        const sessions = sessionsOf([hill(5, 30, 4), hill(5, 30, 2)], TREADMILL);

        expect(kinds(sessions)).toEqual([undefined, undefined]);
    });
});
