import { Service, computed, inject, signal } from '@angular/core';
import { Diagnostics } from '@diagnostics/application/diagnostics.service';
import { Clock } from '@shared/application/clock.service';

/** How many taps on the About heading reveal the developer settings. */
export const DEVELOPER_TAPS = 10;

/**
 * Whether Settings shows its developer section: tools for trying the app out and tracking down
 * problems (demo data, a test date, a test notification, diagnostics), hidden from everyday use.
 *
 * Tapping the About heading ten times reveals it, as on an Android phone. The taps are counted
 * here rather than in the page, because a page component is destroyed when the user switches
 * tabs: a service lives as long as the app, so the section stays open until a reload. It is not
 * stored anywhere; nothing about it is a preference or an event.
 */
@Service()
export class DeveloperMode {
    private readonly clock = inject(Clock);
    private readonly diagnostics = inject(Diagnostics);
    private readonly taps = signal(0);

    /**
     * Also open, without any taps, while a test date or diagnostics is on: whatever is switched
     * on here must stay in reach to be switched off again, even after a reload.
     */
    readonly unlocked = computed(
        () =>
            this.taps() >= DEVELOPER_TAPS || this.clock.pretending() || this.diagnostics.enabled(),
    );

    /** Taps still needed, shown as a hint over the last few; undefined once open. */
    readonly tapsLeft = computed(() =>
        this.unlocked() ? undefined : DEVELOPER_TAPS - this.taps(),
    );

    tap(): void {
        this.taps.update((taps) => Math.min(taps + 1, DEVELOPER_TAPS));
    }
}
