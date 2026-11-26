import { CURL, RUNNING, cardioAt, catalog, contextAt } from '../../testing/fixtures';
import { ExerciseId } from '@catalog/domain/exercise';
import { CardioDraft, activeCardio, cardioTotals, performCardio, voidCardio } from './cardio';

const NOW = '2026-11-12T18:00:00Z';

const attempt = (draft: Partial<CardioDraft>): ReturnType<typeof performCardio> =>
    performCardio({ exerciseId: RUNNING, ...draft }, catalog, contextAt(NOW));

describe('performCardio', () => {
    it('records distance, time and calories as entered', () => {
        const result = attempt({
            distance: { value: 5230, unit: 'm' },
            durationSeconds: 1880,
            calories: 412,
        });

        expect(result.ok && result.value).toMatchObject({
            type: 'CardioPerformed',
            version: 1,
            exerciseId: RUNNING,
            distance: { value: 5230, unit: 'm' },
            durationSeconds: 1880,
            calories: 412,
        });
    });

    it.each([
        ['only a distance', { distance: { value: 5000, unit: 'm' } }],
        ['only a time', { durationSeconds: 1800 }],
        ['only calories', { calories: 400 }],
    ] as const)('accepts %s: any one measure is enough', (_name, draft) => {
        const result = attempt(draft);

        expect(result.ok).toBe(true);
        // What was left out is absent from the event, not stored as an empty value.
        expect(Object.keys(result.ok ? result.value : {})).toEqual(
            expect.not.arrayContaining(
                ['distance', 'durationSeconds', 'calories'].filter((key) => !(key in draft)),
            ),
        );
    });

    it('requires at least one of distance, time or calories', () => {
        expect(attempt({})).toEqual({
            ok: false,
            error: expect.objectContaining({
                en: 'Enter at least one of distance, time or calories.',
            }) as unknown,
        });
    });

    it.each([
        ['a zero distance', { distance: { value: 0, unit: 'm' } }],
        ['a fractional distance', { distance: { value: 5000.5, unit: 'm' } }],
        ['a distance that is not a number', { distance: { value: Number.NaN, unit: 'm' } }],
        ['a negative time', { durationSeconds: -60 }],
        ['more than a day', { durationSeconds: 24 * 60 * 60 + 1 }],
        ['fractional calories', { calories: 400.5 }],
    ] as const)('rejects %s', (_name, draft) => {
        expect(attempt(draft).ok).toBe(false);
    });

    it('rejects an exercise that is not cardio, and one the catalog does not know', () => {
        expect(attempt({ exerciseId: CURL, durationSeconds: 600 }).ok).toBe(false);
        expect(attempt({ exerciseId: 'unknown' as ExerciseId, durationSeconds: 600 }).ok).toBe(
            false,
        );
    });

    it('rejects cardio in the future', () => {
        const tomorrow = new Date('2026-11-13T18:00:00Z');

        expect(attempt({ durationSeconds: 600, occurredAt: tomorrow }).ok).toBe(false);
    });
});

describe('activeCardio', () => {
    it('leaves out voided bouts and sorts by when they happened, not by storage order', () => {
        const first = cardioAt('2026-11-10T10:00:00Z', { meters: 3000 });
        const mistake = cardioAt('2026-11-11T10:00:00Z', { meters: 30000 });
        const second = cardioAt('2026-11-12T10:00:00Z', { meters: 4000 });
        const voided = voidCardio(mistake.id, contextAt(NOW));

        expect(activeCardio([second, voided, mistake, first])).toEqual([first, second]);
    });
});

describe('cardioTotals', () => {
    it('adds up the bouts of a session', () => {
        const bouts = [
            cardioAt(NOW, { meters: 3000, seconds: 900, kcal: 250 }),
            cardioAt(NOW, { meters: 2000, seconds: 660, kcal: 170 }),
        ];

        expect(cardioTotals(bouts)).toEqual({
            distanceMeters: 5000,
            durationSeconds: 1560,
            calories: 420,
        });
    });

    it('has a measure only when every bout recorded it', () => {
        const bouts = [
            cardioAt(NOW, { meters: 3000, seconds: 900 }),
            cardioAt(NOW, { seconds: 600, kcal: 150 }),
        ];

        // A distance from one bout out of two would make the session look shorter than it was.
        expect(cardioTotals(bouts)).toEqual({ durationSeconds: 1500 });
    });

    it('is empty for no bouts', () => {
        expect(cardioTotals([])).toEqual({});
    });
});
