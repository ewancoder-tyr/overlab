import { contextAt } from '../../testing/fixtures';
import { createBackup, parseBackup } from './backup';
import { envelope } from './event';

describe('backup', () => {
    it('round-trips the event log through JSON', () => {
        const events = [envelope('A', 1, contextAt('2026-11-11T09:00:00Z'))];
        const text = JSON.stringify(createBackup(events, new Date('2026-11-11T12:00:00Z')));

        expect(parseBackup(text)).toEqual({ ok: true, value: events });
    });

    it.each([
        ['text that is not JSON', 'hello'],
        ['JSON that is not a backup', '{"events": []}'],
        ['a newer format version', '{"format":"overlab-events","formatVersion":2,"events":[]}'],
        [
            'entries that are not events',
            '{"format":"overlab-events","formatVersion":1,"events":[{}]}',
        ],
    ])('rejects %s', (_name, text) => {
        expect(parseBackup(text).ok).toBe(false);
    });
});
