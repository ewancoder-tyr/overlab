import { contextAt } from '../../testing/fixtures';
import { byOccurrence, envelope, isDomainEvent, mergeEvents } from './event';

describe('event envelope', () => {
    it('records when it happened separately from when it was logged (backfilling)', () => {
        const event = envelope(
            'Something',
            1,
            contextAt('2026-11-11T18:00:00Z'),
            new Date('2026-11-09T07:30:00Z'),
        );

        expect(event.occurredAt).toBe('2026-11-09T07:30:00.000Z');
        expect(event.recordedAt).toBe('2026-11-11T18:00:00.000Z');
    });

    it('logged in the past: happened at the moment gone back to, recorded at the real time', () => {
        const event = envelope('Something', 1, {
            ...contextAt('2026-11-09T07:30:00Z'),
            recordedAt: new Date('2026-11-25T18:00:00Z'),
        });

        expect(event.occurredAt).toBe('2026-11-09T07:30:00.000Z');
        expect(event.recordedAt).toBe('2026-11-25T18:00:00.000Z');
    });

    it('orders events by occurrence, then id, regardless of storage order', () => {
        const late = envelope('A', 1, contextAt('2026-11-11T10:00:00Z'));
        const earlyOne = envelope('A', 1, contextAt('2026-11-11T09:00:00Z'));
        const earlyTwo = envelope('A', 1, contextAt('2026-11-11T09:00:00Z'));

        const sorted = [late, earlyTwo, earlyOne].sort(byOccurrence);

        expect(sorted).toEqual([earlyOne, earlyTwo, late]);
    });
});

describe('mergeEvents', () => {
    it('is a set union by id: merging the same events twice changes nothing', () => {
        const first = envelope('A', 1, contextAt('2026-11-11T09:00:00Z'));
        const second = envelope('A', 1, contextAt('2026-11-11T10:00:00Z'));

        const once = mergeEvents([first], [first, second]);
        const twice = mergeEvents(once.events, [first, second]);

        expect(once.events).toEqual([first, second]);
        expect(once.added).toEqual([second]);
        expect(twice.added).toEqual([]);
    });
});

describe('isDomainEvent', () => {
    it('accepts a real event and rejects malformed input', () => {
        const event = envelope('A', 1, contextAt('2026-11-11T09:00:00Z'));

        expect(isDomainEvent(event)).toBe(true);
        expect(isDomainEvent(null)).toBe(false);
        expect(isDomainEvent({ ...event, occurredAt: 'yesterday' })).toBe(false);
        expect(isDomainEvent({ id: 'x', type: 'A' })).toBe(false);
    });
});
