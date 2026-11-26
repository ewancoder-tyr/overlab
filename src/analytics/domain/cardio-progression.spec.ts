import { CardioTotals } from '@training/domain/cardio';
import { CardioSession, cardioSessions, groupIntoWorkouts } from '@training/domain/workout';
import { RUNNING, TREADMILL, cardioAt } from '../../testing/fixtures';
import {
    cardioHistory,
    cardioPace,
    compareCardio,
    matchedOrBeaten,
    speedKmh,
} from './cardio-progression';

/** Shorthand: a session's totals from metres, seconds and kcal. */
const totals = (meters?: number, seconds?: number, kcal?: number): CardioTotals => ({
    ...(meters === undefined ? {} : { distanceMeters: meters }),
    ...(seconds === undefined ? {} : { durationSeconds: seconds }),
    ...(kcal === undefined ? {} : { calories: kcal }),
});

/** Last time in every example: 5 km in 30 minutes, which is 10 km/h. */
const LAST = totals(5000, 30 * 60);

describe('cardio progression rule', () => {
    it.each([
        ['farther at the same speed', totals(5500, 33 * 60), 'up', ['up', 'same']],
        ['the same distance faster', totals(5000, 28 * 60), 'up', ['same', 'up']],
        ['farther and faster', totals(6000, 34 * 60), 'up', ['up', 'up']],
        ['exactly the same', totals(5000, 30 * 60), 'same', ['same', 'same']],
        ['farther but slower', totals(6000, 40 * 60), 'mixed', ['up', 'down']],
        ['faster but shorter', totals(3000, 15 * 60), 'mixed', ['down', 'up']],
        ['shorter and slower', totals(4000, 26 * 60), 'down', ['down', 'down']],
        ['the same distance slower', totals(5000, 32 * 60), 'down', ['same', 'down']],
    ] as const)(
        'judges distance and speed together: %s is %s',
        (_name, today, outcome, [distance, speed]) => {
            expect(compareCardio(today, LAST)).toEqual({
                outcome,
                axes: [
                    { axis: 'distance', direction: distance },
                    { axis: 'speed', direction: speed },
                ],
            });
        },
    );

    it('keeps calories out of the verdict when there is a distance', () => {
        const last = totals(5000, 30 * 60, 400);
        const fartherButFewerCalories = totals(5500, 33 * 60, 390);

        expect(compareCardio(fartherButFewerCalories, last)?.outcome).toBe('up');
    });

    it('compares distance alone when one of the sessions has no time', () => {
        expect(compareCardio(totals(5200), LAST)).toEqual({
            outcome: 'up',
            axes: [{ axis: 'distance', direction: 'up' }],
        });
    });

    it('compares time alone when that is all both have: longer is better', () => {
        expect(compareCardio(totals(undefined, 35 * 60), totals(undefined, 30 * 60))).toEqual({
            outcome: 'up',
            axes: [{ axis: 'duration', direction: 'up' }],
        });
    });

    it('lets calories stand in for distance when there is time but no distance', () => {
        const last = totals(undefined, 20 * 60, 200); // 10 kcal a minute
        const longerSameRate = totals(undefined, 25 * 60, 250);
        const longerButLazier = totals(undefined, 30 * 60, 240);

        expect(compareCardio(longerSameRate, last)).toEqual({
            outcome: 'up',
            axes: [
                { axis: 'calories', direction: 'up' },
                { axis: 'burn-rate', direction: 'same' },
            ],
        });
        expect(compareCardio(longerButLazier, last)?.outcome).toBe('mixed');
    });

    it('compares calories alone when that is all both have', () => {
        expect(
            compareCardio(totals(undefined, undefined, 380), totals(5000, undefined, 400)),
        ).toEqual({ outcome: 'down', axes: [{ axis: 'calories', direction: 'down' }] });
    });

    it('is a new baseline when the sessions have nothing in common', () => {
        expect(compareCardio(totals(undefined, undefined, 400), totals(5000))).toBeUndefined();
    });
});

describe('cardio match rule', () => {
    it.each([
        ['exactly the same run', totals(5000, 30 * 60), true],
        ['farther at the same speed', totals(5500, 33 * 60), true],
        ['the same distance faster', totals(5000, 28 * 60), true],
        ['farther but slower (a trade)', totals(6000, 40 * 60), false],
        ['the same distance one second slower', totals(5000, 30 * 60 + 1), false],
        ['shorter and slower', totals(4000, 26 * 60), false],
    ] as const)('matching last time is enough: %s reaches it: %s', (_name, today, reached) => {
        const outcome = compareCardio(today, LAST)?.outcome;

        expect(outcome !== undefined && matchedOrBeaten(outcome)).toBe(reached);
    });
});

describe('speedKmh', () => {
    it('is derived from distance and time, and unknown without either', () => {
        expect(speedKmh(totals(5000, 30 * 60))).toBe(10);
        expect(speedKmh(totals(5000))).toBeUndefined();
        expect(speedKmh(totals(undefined, 1800))).toBeUndefined();
    });
});

describe('cardioPace', () => {
    const sessionsOf = (
        ...bouts: ReturnType<typeof cardioAt>[]
    ): ReturnType<typeof cardioSessions> => cardioSessions(groupIntoWorkouts([], bouts), RUNNING);

    it('judges a session as a whole: two bouts today are added up before comparing', () => {
        const [last, today] = sessionsOf(
            cardioAt('2026-11-10T10:00:00Z', { meters: 5000, seconds: 1800 }),
            cardioAt('2026-11-12T10:00:00Z', { meters: 3000, seconds: 1080 }),
            cardioAt('2026-11-12T10:30:00Z', { meters: 2500, seconds: 900 }),
        );

        const pace = cardioPace(today, last === undefined ? [] : [last]);

        expect(pace.current).toEqual({ distanceMeters: 5500, durationSeconds: 1980 });
        expect(pace.comparison?.outcome).toBe('up'); // 5.5 km at the same 10 km/h
        expect(pace.previousStartedAt).toBe(last?.workoutStartedAt);
    });

    it('has nothing to compare before the first bout of the day, or the first time ever', () => {
        const [last] = sessionsOf(cardioAt('2026-11-10T10:00:00Z', { meters: 5000 }));

        expect(cardioPace(undefined, last === undefined ? [] : [last])).toEqual({
            previousStartedAt: last?.workoutStartedAt,
            previous: { distanceMeters: 5000 },
        });
        expect(cardioPace(last, [])).toEqual({ current: { distanceMeters: 5000 } });
    });
});

describe('cardioHistory', () => {
    it('judges every session against the one before it', () => {
        const sessions = cardioSessions(
            groupIntoWorkouts(
                [],
                [
                    cardioAt('2026-11-08T10:00:00Z', { meters: 5000, seconds: 1800 }),
                    cardioAt('2026-11-10T10:00:00Z', { meters: 5500, seconds: 1980 }),
                    cardioAt('2026-11-12T10:00:00Z', { meters: 5000, seconds: 1900 }),
                ],
            ),
            RUNNING,
        );

        expect(cardioHistory(sessions).map((entry) => entry.comparison?.outcome)).toEqual([
            undefined,
            'up',
            'down',
        ]);
    });
});

describe('cardio progression rule on a treadmill', () => {
    /** A treadmill session's totals: metres, seconds and metres climbed. */
    const hill = (meters: number, seconds: number, climb: number): CardioTotals => ({
        distanceMeters: meters,
        durationSeconds: seconds,
        climbMeters: climb,
    });
    const LAST_HILL = hill(5000, 30 * 60, 100);

    it.each([
        ['the same run with more climb', hill(5000, 30 * 60, 150), 'up', 'up'],
        ['exactly the same', hill(5000, 30 * 60, 100), 'same', 'same'],
        ['the same run with less climb', hill(5000, 30 * 60, 50), 'down', 'down'],
        ['farther and faster but flatter', hill(6000, 34 * 60, 0), 'mixed', 'down'],
    ] as const)('adds climb as a third axis: %s is %s', (_name, today, outcome, climb) => {
        const comparison = compareCardio(today, LAST_HILL);

        expect(comparison?.outcome).toBe(outcome);
        expect(comparison?.axes.map((axis) => axis.axis)).toEqual(['distance', 'speed', 'climb']);
        expect(comparison?.axes.at(-1)?.direction).toBe(climb);
    });

    it('leaves climb out when either session has none (anything but a treadmill)', () => {
        expect(compareCardio(hill(5000, 30 * 60, 100), LAST)?.axes).toHaveLength(2);
    });

    it('beats last time by running the inclined part longer and the flat part shorter', () => {
        const day = (flatMinutes: number, inclinedMinutes: number): CardioSession | undefined =>
            cardioSessions(
                groupIntoWorkouts(
                    [],
                    [
                        // Walk, run flat, run at 5%: 6 km/h, then 9 km/h (150 m a minute).
                        cardioAt(
                            '2026-11-24T18:00:00Z',
                            { meters: 1000, seconds: 600, incline: 0 },
                            TREADMILL,
                        ),
                        cardioAt(
                            '2026-11-24T18:10:00Z',
                            { meters: flatMinutes * 150, seconds: flatMinutes * 60, incline: 0 },
                            TREADMILL,
                        ),
                        cardioAt(
                            '2026-11-24T18:30:00Z',
                            {
                                meters: inclinedMinutes * 150,
                                seconds: inclinedMinutes * 60,
                                incline: 5,
                            },
                            TREADMILL,
                        ),
                    ],
                ),
                TREADMILL,
            )[0];

        // Same distance, same time, same speed; only more of it was uphill.
        const { comparison } = cardioPace(
            day(15, 15),
            [day(20, 10)].flatMap((each) => each ?? []),
        );

        expect(comparison?.outcome).toBe('up');
        expect(comparison?.axes).toEqual([
            { axis: 'distance', direction: 'same' },
            { axis: 'speed', direction: 'same' },
            { axis: 'climb', direction: 'up' },
        ]);
    });
});
