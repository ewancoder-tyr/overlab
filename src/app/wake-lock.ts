import { effect } from '@angular/core';
import { ScreenWakeLock } from '@shared/infrastructure/screen-wake-lock';

/**
 * Holds the wake lock whenever `running()` is true and releases it otherwise. An `effect` re-runs
 * whenever a signal it read changes, so the lock follows the workout by itself. Must be called in
 * an injection context, like every `effect`.
 */
export function holdWakeLockWhile(
    running: () => boolean,
    lock: Pick<ScreenWakeLock, 'hold' | 'release'>,
): void {
    effect(() => {
        if (running()) {
            lock.hold();
        } else {
            lock.release();
        }
    });
}
