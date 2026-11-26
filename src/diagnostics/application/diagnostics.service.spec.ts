import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TraceEntry } from '@diagnostics/domain/trace';
import { DiagnosticsStore, TRACE_PROBES, TraceProbe, TraceRecorder } from './diagnostics-ports';
import { Diagnostics } from './diagnostics.service';

class MemoryStore extends DiagnosticsStore {
    enabled = false;
    trace: readonly TraceEntry[] = [];
    override loadEnabled(): boolean {
        return this.enabled;
    }
    override saveEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }
    override loadTrace(): readonly TraceEntry[] {
        return this.trace;
    }
    override saveTrace(trace: readonly TraceEntry[]): void {
        this.trace = trace;
    }
}

/** A probe the test can fire by hand, and that says whether it is running. */
class ManualProbe implements TraceProbe {
    record: TraceRecorder | undefined;
    start(record: TraceRecorder): () => void {
        this.record = record;
        return () => {
            this.record = undefined;
        };
    }
}

function setUp(enabled: boolean): {
    diagnostics: Diagnostics;
    store: MemoryStore;
    probe: ManualProbe;
} {
    const store = new MemoryStore();
    store.enabled = enabled;
    const probe = new ManualProbe();
    TestBed.configureTestingModule({
        providers: [
            { provide: DiagnosticsStore, useValue: store },
            { provide: TRACE_PROBES, multi: true, useValue: probe },
        ],
    });
    const diagnostics = TestBed.inject(Diagnostics);
    TestBed.tick(); // Runs the effect that starts the probes.
    return { diagnostics, store, probe };
}

describe('Diagnostics', () => {
    it('is off by default and starts no probe', () => {
        const { probe, diagnostics } = setUp(false);
        expect(diagnostics.enabled()).toBe(false);
        expect(probe.record).toBeUndefined();
    });

    it('starts the probes when switched on and stops them when switched off', () => {
        const { diagnostics, probe } = setUp(false);
        diagnostics.setEnabled(true);
        TestBed.tick();
        expect(probe.record).toBeDefined();
        diagnostics.setEnabled(false);
        TestBed.tick();
        expect(probe.record).toBeUndefined();
    });

    it('remembers the switch on this device', () => {
        const { diagnostics, store } = setUp(false);
        diagnostics.setEnabled(true);
        expect(store.enabled).toBe(true);
    });

    it('starts recording at launch when it was left on', () => {
        const { diagnostics, probe } = setUp(true);
        probe.record?.('tap', 'Train', 1000);
        expect(diagnostics.entries().map((entry) => entry.text)).toEqual([
            'diagnostics on',
            'Train',
        ]);
    });

    it('saves what probes record, and clears it', () => {
        const { diagnostics, store, probe } = setUp(true);
        probe.record?.('tap', 'Train', 1000);
        expect(store.trace.at(-1)).toEqual({ at: 1000, kind: 'tap', text: 'Train' });
        diagnostics.clear();
        expect(diagnostics.entries()).toEqual([]);
        expect(store.trace).toEqual([]);
    });
});
