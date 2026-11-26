import { describe, expect, it } from 'vitest';
import { appendEntry, formatEntry, formatTrace, isTraceEntry, TraceEntry } from './trace';

// Built from local time, so the expected text does not depend on the machine's time zone.
const AT = new Date(2026, 10, 13, 16, 2, 7, 81).getTime();
const TAP: TraceEntry = { at: AT, kind: 'tap', text: 'Train' };

describe('appendEntry', () => {
    it('adds the entry at the end', () => {
        const first: TraceEntry = { at: AT - 1, kind: 'app', text: 'on' };
        expect(appendEntry([first], TAP)).toEqual([first, TAP]);
    });

    it('keeps only the newest entries once the trace is full', () => {
        const trace = [1, 2, 3].map((n): TraceEntry => ({ at: n, kind: 'app', text: `${n}` }));
        expect(appendEntry(trace, TAP, 3).map((entry) => entry.text)).toEqual(['2', '3', 'Train']);
    });
});

describe('formatEntry', () => {
    it('shows local time to the millisecond, the kind and the text', () => {
        expect(formatEntry(TAP)).toBe('16:02:07.081 tap        Train');
    });
});

describe('formatTrace', () => {
    it('puts one entry per line, oldest first', () => {
        const later: TraceEntry = { at: AT + 1000, kind: 'navigation', text: 'end /exercises' };
        expect(formatTrace([TAP, later]).split('\n')).toEqual([
            '16:02:07.081 tap        Train',
            '16:02:08.081 navigation end /exercises',
        ]);
    });
});

describe('isTraceEntry', () => {
    it('accepts an entry', () => {
        expect(isTraceEntry(TAP)).toBe(true);
    });

    it('rejects anything else read back from storage', () => {
        expect(isTraceEntry(null)).toBe(false);
        expect(isTraceEntry('16:02 tap Train')).toBe(false);
        expect(isTraceEntry({ ...TAP, kind: 'unknown' })).toBe(false);
        expect(isTraceEntry({ ...TAP, at: '16:02' })).toBe(false);
    });
});
