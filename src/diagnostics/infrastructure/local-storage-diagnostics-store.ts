import { DiagnosticsStore } from '@diagnostics/application/diagnostics-ports';
import { isTraceEntry, TraceEntry } from '@diagnostics/domain/trace';

const ENABLED_KEY = 'overlab-diagnostics-enabled';
const TRACE_KEY = 'overlab-diagnostics-trace';

/** How long to gather new lines before writing them. */
const SAVE_DELAY_MS = 2000;

/**
 * Keeps diagnostics in `localStorage`: small, per device, and readable before anything else has
 * loaded.
 *
 * Writing to `localStorage` blocks the page while it runs, and a burst of taps adds lines many
 * times a second. Writing the whole trace every time would slow down the very thing being
 * measured, so the trace is written at most every two seconds, and at once when the app is
 * hidden (the last chance before the phone may close it).
 *
 * Every access may throw (private mode, storage full or blocked); diagnostics then still work
 * for this run, in memory only.
 */
export class LocalStorageDiagnosticsStore extends DiagnosticsStore {
    private pending: readonly TraceEntry[] | undefined;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        super();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.flush();
            }
        });
    }

    override loadEnabled(): boolean {
        return read(ENABLED_KEY) === 'true';
    }

    override saveEnabled(enabled: boolean): void {
        write(ENABLED_KEY, String(enabled));
    }

    override loadTrace(): readonly TraceEntry[] {
        try {
            const parsed: unknown = JSON.parse(read(TRACE_KEY) ?? '[]');
            return Array.isArray(parsed) ? parsed.filter(isTraceEntry) : [];
        } catch {
            return [];
        }
    }

    override saveTrace(trace: readonly TraceEntry[]): void {
        this.pending = trace;
        this.timer ??= setTimeout(() => {
            this.flush();
        }, SAVE_DELAY_MS);
    }

    private flush(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
        if (this.pending !== undefined) {
            write(TRACE_KEY, JSON.stringify(this.pending));
            this.pending = undefined;
        }
    }
}

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // See the class comment: the trace stays in memory.
    }
}
