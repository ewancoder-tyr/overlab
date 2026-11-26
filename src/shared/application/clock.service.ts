import { Service, computed, signal } from '@angular/core';

const TICK_MS = 30_000;

/**
 * The current time as a signal that ticks every 30 seconds.
 *
 * Time-dependent projections ("is there a workout in progress?", "the last 7 days") read this
 * signal, so they recompute as time passes even when no new event arrives.
 *
 * It is also the app's ONLY source of the current time, which is what makes the two features
 * below possible: shift this clock and the whole app, including the timestamps of new events,
 * believes it is another moment.
 * - The **test date** (developer settings) pretends it is another day, for trying things out.
 *   What is logged then is fake, so sync pauses.
 * - **Logging in the past** (History page) goes back to a moment to log what was really done
 *   then. Those events are real: they sync as always, stamped with when they happened
 *   (`occurredAt`, this clock) and when they were typed in (`recordedAt`, `realTime()`).
 */
@Service()
export class Clock {
    /** How far the app's clock is from the real one. 0 unless it is shifted (see above). */
    private readonly offsetMs = signal(0);
    private readonly current = signal(new Date());

    readonly now = this.current.asReadonly();
    /** Why the clock is shifted, if it is. The two never combine: the later choice wins. */
    private readonly shift = signal<'test' | 'past' | undefined>(undefined);
    /** True while the app pretends that it is another day (the test date). */
    readonly pretending = computed(() => this.shift() === 'test');
    /** True while the user is logging something done earlier (see `logInThePast`). */
    readonly inThePast = computed(() => this.shift() === 'past');

    constructor() {
        setInterval(() => {
            this.refresh();
        }, TICK_MS);
    }

    /**
     * The time at this very moment. The `now` signal can be up to 30 seconds old, which is fine
     * for views but not for stamping a new event.
     */
    currentTime(): Date {
        return new Date(Date.now() + this.offsetMs());
    }

    /**
     * The device's real time, whatever the clock pretends. Only for what must say when it was
     * really written: the `recordedAt` of an event logged in the past and the date of a backup.
     * Everything else must use `currentTime()`.
     */
    realTime(): Date {
        return new Date();
    }

    /** Forces an immediate update, e.g. right after logging a set. */
    refresh(): void {
        this.current.set(this.currentTime());
    }

    /**
     * For testing: makes the app believe today is `date` (`YYYY-MM-DD`), at the real time of day.
     * Kept in memory only, so reloading the app always returns to the real date.
     */
    pretendTodayIs(date: string): void {
        // A date-time without a zone is read as local time: midnight of that day, here.
        const day = new Date(`${date}T00:00`);
        if (Number.isNaN(day.getTime())) {
            return;
        }
        const real = new Date();
        const pretended = new Date(real);
        pretended.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
        this.offsetMs.set(pretended.getTime() - real.getTime());
        this.shift.set('test');
        this.refresh();
    }

    /**
     * Goes back to `moment` to log what was done then. The clock keeps running from there, so
     * sets logged one after another stay in the order they were typed. A moment that is not in
     * the past is refused: nothing can be logged ahead of time.
     *
     * @returns whether the clock moved.
     */
    logInThePast(moment: Date): boolean {
        const offset = moment.getTime() - Date.now();
        if (Number.isNaN(offset) || offset >= 0) {
            return false;
        }
        this.offsetMs.set(offset);
        this.shift.set('past');
        this.refresh();
        return true;
    }

    backToRealTime(): void {
        this.offsetMs.set(0);
        this.shift.set(undefined);
        this.refresh();
    }
}
