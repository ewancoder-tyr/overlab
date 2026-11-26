import {
    EnvironmentProviders,
    inject,
    makeEnvironmentProviders,
    provideAppInitializer,
} from '@angular/core';
import { DiagnosticsStore, TRACE_PROBES } from '@diagnostics/application/diagnostics-ports';
import { Diagnostics } from '@diagnostics/application/diagnostics.service';
import {
    ErrorProbe,
    LongTaskProbe,
    NavigationProbe,
    SlowInputProbe,
    TapProbe,
    VisibilityProbe,
} from './browser-probes';
import { LocalStorageDiagnosticsStore } from './local-storage-diagnostics-store';

/**
 * Wires diagnostics to the browser. Called from `app.config.ts`.
 *
 * `multi: true` collects every provider of `TRACE_PROBES` into one array, so adding a probe is
 * one more line here and nothing else changes.
 */
export function provideDiagnostics(): EnvironmentProviders {
    return makeEnvironmentProviders([
        { provide: DiagnosticsStore, useClass: LocalStorageDiagnosticsStore },
        { provide: TRACE_PROBES, multi: true, useClass: VisibilityProbe },
        { provide: TRACE_PROBES, multi: true, useClass: TapProbe },
        { provide: TRACE_PROBES, multi: true, useClass: NavigationProbe },
        { provide: TRACE_PROBES, multi: true, useClass: LongTaskProbe },
        { provide: TRACE_PROBES, multi: true, useClass: SlowInputProbe },
        { provide: TRACE_PROBES, multi: true, useClass: ErrorProbe },
        // Created at start-up, not when Settings first opens: with diagnostics on, the trace
        // must cover everything from the launch.
        provideAppInitializer(() => {
            inject(Diagnostics);
        }),
    ]);
}
