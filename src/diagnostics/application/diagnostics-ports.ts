import { InjectionToken } from '@angular/core';
import { TraceEntry, TraceKind } from '@diagnostics/domain/trace';

/** Adds a line to the trace. `at` defaults to now; observers pass the time the browser measured. */
export type TraceRecorder = (kind: TraceKind, text: string, at?: number) => void;

/**
 * One thing worth watching: taps, page switches, long tasks, errors. A probe starts listening
 * when diagnostics are switched on and must stop completely when they are switched off, so that
 * the app runs exactly as without diagnostics.
 *
 * To watch something new, write a probe and add it to `TRACE_PROBES` in `provideDiagnostics()`.
 */
export interface TraceProbe {
    /** Starts listening; answers the function that stops it. */
    start(record: TraceRecorder): () => void;
}

/** Every probe of the app. A multi-provider: each probe is provided under this token. */
export const TRACE_PROBES = new InjectionToken<readonly TraceProbe[]>('trace probes');

/** Port: where this device keeps the trace and the on/off switch between runs. */
export abstract class DiagnosticsStore {
    abstract loadEnabled(): boolean;
    abstract saveEnabled(enabled: boolean): void;
    abstract loadTrace(): readonly TraceEntry[];
    abstract saveTrace(trace: readonly TraceEntry[]): void;
}
