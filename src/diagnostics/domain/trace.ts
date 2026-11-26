/*
 * The diagnostics trace: a timeline of what the app and the browser did, kept on the device so
 * that a problem seen on a phone (a tab that does not switch, a freeze) can be explained after
 * the fact. It is not part of the event log: it is never synced, never backed up, and nothing
 * else in the app reads it.
 */

/**
 * What a line is about. Each probe writes one or two kinds; the list grows with the probes.
 *
 * - `app`: diagnostics switched on, the app shown or hidden.
 * - `tap`: a finger on a control (`pointerdown`), and the click the browser made of it.
 * - `navigation`: the router starting, finishing, skipping or cancelling a page switch.
 * - `render`: Angular having updated the page, the browser about to draw it.
 * - `busy`: the main thread blocked by code for more than 50 ms (a long task).
 * - `slow`: an input the browser took long to handle or to show the result of.
 * - `error`: anything reported as an error.
 */
export type TraceKind = 'app' | 'tap' | 'navigation' | 'render' | 'busy' | 'slow' | 'error';

const TRACE_KINDS: readonly TraceKind[] = [
    'app',
    'tap',
    'navigation',
    'render',
    'busy',
    'slow',
    'error',
];

export interface TraceEntry {
    /** When it happened, in milliseconds since the epoch: the real time, never a test date. */
    readonly at: number;
    readonly kind: TraceKind;
    readonly text: string;
}

/** Enough for a few minutes of tapping around; older lines are dropped first. */
export const MAX_TRACE_ENTRIES = 500;

/** The trace with `entry` added at the end, keeping only the newest `max` entries. */
export function appendEntry(
    trace: readonly TraceEntry[],
    entry: TraceEntry,
    max = MAX_TRACE_ENTRIES,
): readonly TraceEntry[] {
    return [...trace, entry].slice(-max);
}

/**
 * One line of the trace: local time with milliseconds, the kind padded to one width, the text.
 * `16:02:07.481 tap        Train`. Milliseconds matter: the gaps between lines are the point.
 */
export function formatEntry(entry: TraceEntry): string {
    const time = new Date(entry.at);
    const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
    const clock = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
    return `${clock}.${pad(time.getMilliseconds(), 3)} ${entry.kind.padEnd(10)} ${entry.text}`;
}

/** The whole trace as text, oldest first, to copy and paste into a bug report. */
export function formatTrace(trace: readonly TraceEntry[]): string {
    return trace.map(formatEntry).join('\n');
}

/** Checks a value read back from storage, which may be from an older version or damaged. */
export function isTraceEntry(value: unknown): value is TraceEntry {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const { at, kind, text } = value as Record<string, unknown>;
    return (
        typeof at === 'number' &&
        typeof text === 'string' &&
        TRACE_KINDS.includes(kind as TraceKind)
    );
}
