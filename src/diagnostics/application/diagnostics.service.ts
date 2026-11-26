import { Service, effect, inject, signal, untracked } from '@angular/core';
import { appendEntry, TraceEntry, TraceKind } from '@diagnostics/domain/trace';
import { DiagnosticsStore, TRACE_PROBES } from './diagnostics-ports';

/**
 * Diagnostics: an on-device trace of what the app and the browser do, for explaining a problem
 * seen on a phone. Off by default; the switch is in the developer settings.
 *
 * The switch is a fact about one device, like reminders, not a preference: it is kept in the
 * device's own storage and never becomes an event, so it is neither synced nor backed up.
 */
@Service()
export class Diagnostics {
    private readonly store = inject(DiagnosticsStore);
    private readonly probes = inject(TRACE_PROBES);

    private readonly on = signal(this.store.loadEnabled());
    private readonly trace = signal(this.store.loadTrace());

    readonly enabled = this.on.asReadonly();
    /** Oldest first. */
    readonly entries = this.trace.asReadonly();

    constructor() {
        // The probes run exactly while diagnostics are on. Switching off runs `onCleanup`, which
        // stops every probe. `untracked`: whatever a probe reads while starting must not make
        // this effect re-run and restart them all.
        effect((onCleanup) => {
            if (!this.on()) {
                return;
            }
            const stops = untracked(() => {
                this.record('app', 'diagnostics on');
                return this.probes.map((probe) => probe.start(this.record));
            });
            onCleanup(() => {
                for (const stop of stops) {
                    stop();
                }
            });
        });
    }

    setEnabled(enabled: boolean): void {
        this.on.set(enabled);
        this.store.saveEnabled(enabled);
    }

    clear(): void {
        this.trace.set([]);
        this.store.saveTrace([]);
    }

    /**
     * An arrow function rather than a method, so probes can be handed `this.record` on its own
     * and still have `this` bound to the service.
     *
     * `Date.now()` and not the app's `Clock`: the trace must show the real time even while a
     * test date is on.
     */
    readonly record = (kind: TraceKind, text: string, at = Date.now()): void => {
        const entry: TraceEntry = { at, kind, text };
        this.trace.update((trace) => appendEntry(trace, entry));
        this.store.saveTrace(this.trace());
    };
}
