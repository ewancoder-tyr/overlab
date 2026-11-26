import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Clock } from '@shared/application/clock.service';
import { CURL, DEADLIFT } from '../../testing/fixtures';
import { Buzzer } from './buzzer';
import { RestAlert } from './rest-alert.service';
import { TrainingService } from './training.service';

/*
 * The rest alert against fake time. Vitest's fake timers move both `setTimeout` and `Date.now()`,
 * so the fake clock below simply reads `Date.now()`.
 */

const SET_AT = new Date('2026-11-12T10:00:00Z');

class CountingBuzzer extends Buzzer {
    count = 0;
    override buzz(): void {
        this.count++;
    }
    override tap(): void {
        // Logging feedback, not part of the rest alert.
    }
}

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(state: DocumentVisibilityState): void {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
}

function start(
    alertSeconds: number,
    switchSeconds = 180,
): {
    buzzer: CountingBuzzer;
    rest: ReturnType<typeof signal<Date | undefined>>;
    alert: RestAlert;
} {
    const buzzer = new CountingBuzzer();
    const rest = signal<Date | undefined>(SET_AT);
    TestBed.configureTestingModule({
        providers: [
            { provide: Buzzer, useValue: buzzer },
            { provide: Clock, useValue: { currentTime: () => new Date(Date.now()) } },
            {
                provide: TrainingService,
                useValue: { restStart: rest, currentExercise: signal(CURL) },
            },
        ],
    });
    const alert = TestBed.inject(RestAlert);
    alert.setAlerts({ sameExercise: alertSeconds, switchExercise: switchSeconds });
    // On the current exercise's screen, unless a test moves elsewhere.
    alert.setViewing(CURL);
    TestBed.tick(); // Runs the effect that sets the timer.
    return { buzzer, rest, alert };
}

/** Moves time on and lets effects react to any signal that changed meanwhile. */
function wait(ms: number): void {
    vi.advanceTimersByTime(ms);
    TestBed.tick();
}

describe('the rest alert', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(SET_AT);
        visibility = 'visible';
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => visibility,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        TestBed.resetTestingModule();
    });

    it('buzzes once when the rest crosses the alert time', () => {
        const { buzzer, alert } = start(60);

        wait(59_000);
        expect(buzzer.count).toBe(0);
        expect(alert.rang()).toBe(false);

        wait(1000);
        expect(buzzer.count).toBe(1);
        expect(alert.rang()).toBe(true);

        wait(5 * 60_000);
        expect(buzzer.count).toBe(1);
    });

    it('buzzes again for the next rest, after the next set', () => {
        const { buzzer, rest } = start(60);
        wait(60_000);

        rest.set(new Date(Date.now()));
        TestBed.tick();
        wait(60_000);

        expect(buzzer.count).toBe(2);
    });

    it('does not buzz when the app is opened after the alert time', () => {
        vi.setSystemTime(SET_AT.getTime() + 70_000);
        const { buzzer } = start(60);

        wait(10 * 60_000);

        expect(buzzer.count).toBe(0);
    });

    it('does not buzz when the app is returned to after the alert time', () => {
        const { buzzer } = start(60);
        wait(30_000);

        setVisibility('hidden');
        wait(60_000);
        setVisibility('visible');
        wait(60_000);

        expect(buzzer.count).toBe(0);
    });

    it('does not buzz when off', () => {
        const { buzzer, alert } = start(0);

        wait(10 * 60_000);

        expect(buzzer.count).toBe(0);
        expect(alert.rang()).toBe(false);
    });

    it('waits for the alert between exercises anywhere but the current exercise', () => {
        const { buzzer, alert } = start(60, 180);
        alert.setViewing(undefined); // The Train list.
        TestBed.tick();

        wait(120_000);
        expect(buzzer.count).toBe(0);
        expect(alert.alertSeconds()).toBe(180);

        wait(60_000);
        expect(buzzer.count).toBe(1);
    });

    it('uses the alert between exercises on another exercise screen', () => {
        const { buzzer, alert } = start(60, 180);
        alert.setViewing(DEADLIFT);
        TestBed.tick();

        wait(60_000);
        expect(buzzer.count).toBe(0);
        wait(120_000);
        expect(buzzer.count).toBe(1);
    });

    it('can buzz once more at the longer alert after leaving the current exercise', () => {
        const { buzzer, alert } = start(60, 180);
        wait(60_000);
        expect(buzzer.count).toBe(1);

        alert.setViewing(undefined);
        TestBed.tick();
        wait(120_000);
        expect(buzzer.count).toBe(2);

        // Back and forth never repeats a moment already rung.
        alert.setViewing(CURL);
        TestBed.tick();
        alert.setViewing(undefined);
        TestBed.tick();
        wait(5 * 60_000);
        expect(buzzer.count).toBe(2);
    });

    it('does not buzz the short alert when coming back to the current exercise after it', () => {
        const { buzzer, alert } = start(60, 180);
        alert.setViewing(undefined);
        TestBed.tick();
        wait(90_000);

        alert.setViewing(CURL);
        TestBed.tick();
        wait(60_000);

        expect(buzzer.count).toBe(0);
        expect(alert.alertSeconds()).toBe(60);
    });
});
