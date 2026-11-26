import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ScreenWakeLock } from '@shared/infrastructure/screen-wake-lock';
import { holdWakeLockWhile } from './wake-lock';

/** Records what was asked of it instead of talking to the browser. */
class RecordingLock implements Pick<ScreenWakeLock, 'hold' | 'release'> {
    held = false;
    hold(): void {
        this.held = true;
    }
    release(): void {
        this.held = false;
    }
}

describe('keeping the screen on', () => {
    it('holds the wake lock while workout time runs and releases it when it stops', () => {
        const running = signal(false);
        const lock = new RecordingLock();
        TestBed.runInInjectionContext(() => {
            holdWakeLockWhile(running, lock);
        });

        TestBed.tick();
        expect(lock.held).toBe(false);

        running.set(true);
        TestBed.tick();
        expect(lock.held).toBe(true);

        running.set(false);
        TestBed.tick();
        expect(lock.held).toBe(false);
    });
});
