import { RUNNING, SAUNA, TREADMILL, cardioAt, catalog, contextAt } from '../../testing/fixtures';
import { CardioDraft, CardioPerformed, cardioTotals, performCardio } from './cardio';

const NOW = '2026-11-25T18:00:00Z';

const attempt = (draft: CardioDraft): ReturnType<typeof performCardio> =>
    performCardio(draft, catalog, contextAt(NOW));

const segment = (meters: number, seconds: number, incline?: number): CardioPerformed =>
    cardioAt(NOW, { meters, seconds, ...(incline === undefined ? {} : { incline }) }, TREADMILL);

describe('treadmill rule', () => {
    it('stores the incline of a segment exactly as it was set on the machine', () => {
        const result = attempt({
            exerciseId: TREADMILL,
            distance: { value: 1200, unit: 'm' },
            durationSeconds: 600,
            incline: 6.5,
        });

        expect(result.ok && result.value.incline).toBe(6.5);
    });

    it('gives every segment an incline: a flat one says 0', () => {
        const result = attempt({ exerciseId: TREADMILL, durationSeconds: 600 });

        expect(result.ok && result.value.incline).toBe(0);
    });

    it.each([
        ['between two detents', 6.3],
        ['below flat', -1],
        ['above the steepest machine', 40.5],
        ['not a number', Number.NaN],
    ])('rejects an incline %s', (_name, incline) => {
        expect(attempt({ exerciseId: TREADMILL, durationSeconds: 600, incline }).ok).toBe(false);
    });

    it('accepts the whole range, from flat to 40 in steps of 0.5', () => {
        for (const incline of [0, 0.5, 15, 39.5, 40]) {
            expect(attempt({ exerciseId: TREADMILL, durationSeconds: 60, incline }).ok).toBe(true);
        }
    });

    it('refuses an incline on any other exercise, and never adds one to it', () => {
        expect(attempt({ exerciseId: RUNNING, durationSeconds: 600, incline: 5 }).ok).toBe(false);

        const run = attempt({ exerciseId: RUNNING, durationSeconds: 600 });
        expect(run.ok && 'incline' in run.value).toBe(false);
    });

    it('adds the segments of a session up, like any bouts', () => {
        const totals = cardioTotals([segment(1000, 600), segment(2000, 720, 5)]);

        expect(totals).toMatchObject({ distanceMeters: 3000, durationSeconds: 1320 });
    });

    it("works out the climb: each segment's distance times its incline in percent", () => {
        // 1 km flat climbs nothing, 2 km at 5% climbs 100 m, 500 m at 10.5% climbs 52.5 m.
        const totals = cardioTotals([
            segment(1000, 600),
            segment(2000, 720, 5),
            segment(500, 300, 10.5),
        ]);

        expect(totals.climbMeters).toBe(152.5);
    });

    it('gives a flat session a climb of 0, so that it can be compared with a hilly one', () => {
        expect(cardioTotals([segment(3000, 1200)]).climbMeters).toBe(0);
    });

    it('gives the same climb however the same work is cut into segments', () => {
        const whole = cardioTotals([segment(3000, 900, 3.5)]);
        const cut = cardioTotals([
            segment(700, 210, 3.5),
            segment(1100, 330, 3.5),
            segment(1200, 360, 3.5),
        ]);

        expect(cut.climbMeters).toBe(whole.climbMeters);
    });

    it('has no climb without a distance, and none for exercises without an incline', () => {
        expect(
            cardioTotals([cardioAt(NOW, { seconds: 600, incline: 5 }, TREADMILL)]),
        ).not.toHaveProperty('climbMeters');
        expect(cardioTotals([cardioAt(NOW, { meters: 5000, seconds: 1800 })])).not.toHaveProperty(
            'climbMeters',
        );
    });
});

describe('timed exercise rule', () => {
    it('records a sauna as its time alone', () => {
        const result = attempt({ exerciseId: SAUNA, durationSeconds: 900 });

        expect(result.ok && result.value).toMatchObject({
            exerciseId: SAUNA,
            durationSeconds: 900,
        });
    });

    it.each([
        ['a distance', { distance: { value: 100, unit: 'm' as const }, durationSeconds: 900 }],
        ['calories', { calories: 100, durationSeconds: 900 }],
        ['no time', {}],
        ['an incline', { durationSeconds: 900, incline: 5 }],
    ])('refuses a sauna with %s', (_name, measures) => {
        expect(attempt({ exerciseId: SAUNA, ...measures }).ok).toBe(false);
    });
});
