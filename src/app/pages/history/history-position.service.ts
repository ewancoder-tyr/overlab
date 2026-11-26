import { Service, signal } from '@angular/core';
import { DayKey } from '@training/domain/day-history';

/**
 * Remembers which day the History page was on.
 *
 * The page itself cannot: opening an exercise's statistics from it destroys the component, and
 * coming back builds a new one, which would open on the latest day again instead of the day
 * you were reading. A service lives as long as the app, so it keeps the day across that trip.
 *
 * In memory only, and not in the address: every address is a step on the back trail
 * (`back-navigation.ts`), and back must not walk through every day you swiped past.
 */
@Service()
export class HistoryPosition {
    /** The day last shown, or `undefined` to open on the latest day with something logged. */
    readonly day = signal<DayKey | undefined>(undefined);

    /** Start afresh: the next visit opens on the latest day. Week does this for its link. */
    forget(): void {
        this.day.set(undefined);
    }
}
