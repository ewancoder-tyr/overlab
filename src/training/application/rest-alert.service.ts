import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, computed, effect, inject, signal } from '@angular/core';
import { ExerciseId } from '@catalog/domain/exercise';
import { Clock } from '@shared/application/clock.service';
import { RestAlerts, restAlertFor } from '@training/domain/session-clock';
import { Buzzer } from './buzzer';
import { TrainingService } from './training.service';

/**
 * A timer that fires up to this late still counts as "on time". Later than that, the page was
 * asleep (a locked phone, a background tab) and buzzing now would be about a moment long gone.
 */
const LATE_TOLERANCE_MS = 3000;

/**
 * The rest alert: one buzz when the rest reaches the rest alert time.
 *
 * There are two alert times (see `restAlertFor`): a short one while the current exercise's
 * logging screen is open, a longer one anywhere else. Which one applies changes as the user moves
 * between pages, so the logging screen reports which exercise it shows (`viewing`).
 *
 * It lives in one root service rather than in the stopwatch, so that it buzzes whichever page is
 * open and only once even when two stopwatches are on screen. It never counts ticks: it computes
 * the moment of the alert from the start of the rest and sets one timer for it.
 *
 * The rule "never buzz if the app is opened after that moment" falls out of the same design:
 * a timer is only set for a moment still in the future, and a timer that fires much too late
 * (the page was frozen) is ignored.
 */
@Service()
export class RestAlert {
    private readonly training = inject(TrainingService);
    private readonly clock = inject(Clock);
    private readonly buzzer = inject(Buzzer);
    private readonly document = inject(DOCUMENT);

    // Only a placeholder: the real values arrive from the preferences (see `app.config.ts`).
    private readonly alerts = signal<RestAlerts>({ sameExercise: 60, switchExercise: 180 });

    /** The exercise whose logging screen is open, or `undefined` on any other page. */
    private readonly viewingExercise = signal<ExerciseId | undefined>(undefined);
    /** The same, read-only, for whatever else follows the exercise on screen. */
    readonly viewing = this.viewingExercise.asReadonly();

    /** After how many seconds of the current rest to buzz, here and now, or 0 for never. */
    readonly alertSeconds = computed(() =>
        restAlertFor(this.alerts(), this.training.currentExercise(), this.viewingExercise()),
    );

    private readonly visible = signal(this.isVisible());

    /**
     * The rest and alert time the alert last went off for, so each rest buzzes at most once per
     * alert time: walking from the current exercise (buzzed at 1:00) to the list can still buzz
     * at 3:00, but going back and forth never buzzes the same moment twice.
     */
    private readonly rangFor = signal<string | undefined>(undefined);

    /**
     * True once the current rest has buzzed. The rest stopwatch announces it to screen readers;
     * colour is never the only signal.
     */
    readonly rang = computed(() => {
        const start = this.training.restStart();
        return start !== undefined && this.rangFor() === ringKey(start, this.alertSeconds());
    });

    constructor() {
        const onVisibility = (): void => {
            this.visible.set(this.isVisible());
        };
        this.document.addEventListener('visibilitychange', onVisibility);
        inject(DestroyRef).onDestroy(() => {
            this.document.removeEventListener('visibilitychange', onVisibility);
        });

        effect((onCleanup) => {
            const start = this.training.restStart();
            const seconds = this.alertSeconds();
            // A hidden page cannot be relied on to run timers, and nobody is looking at it.
            // The timer is set again (or not, if the moment has passed) on becoming visible.
            if (start === undefined || seconds === 0 || !this.visible()) {
                return;
            }
            const key = ringKey(start, seconds);
            if (this.rangFor() === key) {
                return;
            }
            const alertAt = start.getTime() + seconds * 1000;
            const delay = alertAt - this.clock.currentTime().getTime();
            if (delay < 0) {
                return; // Opened, or returned to, after the moment had passed.
            }
            const timer = setTimeout(() => {
                this.ring(key, alertAt);
            }, delay);
            onCleanup(() => {
                clearTimeout(timer);
            });
        });
    }

    /**
     * The rest alerts are preferences, which belong to the settings context; training must not
     * depend on them, so the app shell hands the values in (see `app.config.ts`).
     */
    setAlerts(alerts: RestAlerts): void {
        this.alerts.set(alerts);
    }

    /**
     * Called by the logging screen with its exercise while it is open, and with `undefined` when
     * it closes. A page reports itself rather than this service reading the router, so training
     * needs no knowledge of the app's routes.
     */
    setViewing(exerciseId: ExerciseId | undefined): void {
        this.viewingExercise.set(exerciseId);
    }

    private ring(key: string, alertAt: number): void {
        const late = this.clock.currentTime().getTime() - alertAt;
        if (!this.isVisible() || late > LATE_TOLERANCE_MS) {
            return;
        }
        this.rangFor.set(key);
        this.buzzer.buzz();
    }

    private isVisible(): boolean {
        return this.document.visibilityState === 'visible';
    }
}

function ringKey(restStart: Date, seconds: number): string {
    return `${String(restStart.getTime())}/${String(seconds)}`;
}
