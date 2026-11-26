import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Clock } from '@shared/application/clock.service';
import { formatElapsed } from '@training/domain/session-clock';

const TICK_MS = 1000;

/** How long before the rest alert the clock says "get ready" (`soon`). */
const SOON_SECONDS = 10;

/**
 * A stopwatch that counts up from `since`. With `until` set it is frozen and shows `until - since`.
 *
 * It has no state of its own beyond "what time is it": the elapsed time is always computed from
 * the start, never by counting ticks, so a throttled or skipped tick cannot make it drift. It
 * ticks once a second only while running and while the page is visible, and does one fresh tick
 * on becoming visible again.
 *
 * Both the rest and the workout time use it. It only displays; the buzz lives in `RestAlert`.
 */
@Component({
    selector: 'olab-stopwatch',
    templateUrl: './stopwatch.component.html',
    styleUrl: './stopwatch.component.scss',
    host: {
        role: 'timer',
        '[attr.aria-label]': 'label() + " " + text()',
        '[class.stopwatch--soon]': 'soon()',
        '[class.stopwatch--alert]': 'alert()',
        '[class.stopwatch--stopped]': 'until() !== undefined',
    },
})
export class StopwatchComponent {
    private readonly clock = inject(Clock);
    private readonly document = inject(DOCUMENT);

    readonly since = input.required<Date>();
    /** Set when the stopwatch has stopped: it then shows the time from `since` to this. */
    readonly until = input<Date>();
    /** The eyebrow over the digits, e.g. "Rest". Also read out with the time. */
    readonly label = input.required<string>();
    /**
     * After this many seconds of a running count the digits turn yellow: the rest alert, meaning
     * "you can go now". 0 or unset never does.
     */
    readonly alertAfterSeconds = input(0);

    private readonly now = signal(this.clock.currentTime());
    private readonly visible = signal(this.document.visibilityState === 'visible');

    private readonly elapsedMs = computed(
        () => (this.until() ?? this.now()).getTime() - this.since().getTime(),
    );
    protected readonly text = computed(() => formatElapsed(this.elapsedMs()));
    protected readonly alert = computed(() => this.reached(this.alertAfterSeconds()));
    /**
     * The last seconds before the alert: "get ready". Only the big clock shows it (its icon and
     * digits turn yellow); a short alert (10 s or less) is `soon` from the start.
     */
    protected readonly soon = computed(
        () => !this.alert() && this.reached(Math.max(this.alertAfterSeconds() - SOON_SECONDS, 0)),
    );

    /** Whether a running count has reached this many seconds into an alert that is on at all. */
    private reached(seconds: number): boolean {
        return (
            this.until() === undefined &&
            this.alertAfterSeconds() > 0 &&
            this.elapsedMs() >= seconds * 1000
        );
    }

    constructor() {
        const onVisibility = (): void => {
            this.visible.set(this.document.visibilityState === 'visible');
        };
        this.document.addEventListener('visibilitychange', onVisibility);
        inject(DestroyRef).onDestroy(() => {
            this.document.removeEventListener('visibilitychange', onVisibility);
        });

        // Re-runs when the stopwatch starts again (a new `since`), stops, or the page is shown
        // or hidden. Each run starts from a fresh reading; `onCleanup` stops the previous
        // interval, also when the component is destroyed.
        effect((onCleanup) => {
            this.since(); // Read only so that a new start re-runs this effect with a fresh tick.
            if (this.until() !== undefined || !this.visible()) {
                return;
            }
            this.tick();
            const interval = setInterval(() => {
                this.tick();
            }, TICK_MS);
            onCleanup(() => {
                clearInterval(interval);
            });
        });
    }

    private tick(): void {
        this.now.set(this.clock.currentTime());
    }
}
