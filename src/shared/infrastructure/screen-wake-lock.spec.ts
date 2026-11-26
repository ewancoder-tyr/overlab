import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenWakeLock, WakeLockHost } from './screen-wake-lock';

/*
 * The wake lock against a fake `navigator.wakeLock`. A real sentinel is released by the browser
 * when the page is hidden; the fake does the same when `hide()` is called.
 */

class FakeSentinel extends EventTarget {
    released = false;
    release(): Promise<void> {
        this.released = true;
        this.dispatchEvent(new Event('release'));
        return Promise.resolve();
    }
}

class FakeWakeLock {
    readonly sentinels: FakeSentinel[] = [];
    refuse = false;

    request(): Promise<WakeLockSentinel> {
        if (this.refuse) {
            return Promise.reject(new DOMException('Battery saver', 'NotAllowedError'));
        }
        const sentinel = new FakeSentinel();
        this.sentinels.push(sentinel);
        return Promise.resolve(sentinel as unknown as WakeLockSentinel);
    }

    /** How many locks are held right now. */
    get active(): number {
        return this.sentinels.filter((sentinel) => !sentinel.released).length;
    }
}

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(state: DocumentVisibilityState): void {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
}

/** Lets the awaited request inside the wrapper finish. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the screen wake lock', () => {
    beforeEach(() => {
        visibility = 'visible';
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => visibility,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is held after hold() and released after release()', async () => {
        const fake = new FakeWakeLock();
        const lock = new ScreenWakeLock({ wakeLock: fake }, document);

        lock.hold();
        lock.hold(); // Holding twice takes one lock, not two.
        await settle();
        expect(fake.active).toBe(1);

        lock.release();
        await settle();
        expect(fake.active).toBe(0);
    });

    it('is requested again on becoming visible while still held', async () => {
        const fake = new FakeWakeLock();
        const lock = new ScreenWakeLock({ wakeLock: fake }, document);
        lock.hold();
        await settle();

        // The browser drops the lock when the page is hidden.
        setVisibility('hidden');
        await fake.sentinels[0]?.release();
        setVisibility('visible');
        await settle();

        expect(fake.sentinels).toHaveLength(2);
        expect(fake.active).toBe(1);
    });

    it('is not requested again on becoming visible once released', async () => {
        const fake = new FakeWakeLock();
        const lock = new ScreenWakeLock({ wakeLock: fake }, document);
        lock.hold();
        await settle();
        lock.release();

        setVisibility('hidden');
        setVisibility('visible');
        await settle();

        expect(fake.active).toBe(0);
    });

    it('does nothing and does not throw when the API is missing', async () => {
        const lock = new ScreenWakeLock({} satisfies WakeLockHost, document);

        expect(() => {
            lock.hold();
            lock.release();
        }).not.toThrow();
        await settle();
    });

    it('does not throw when the request is refused', async () => {
        const fake = new FakeWakeLock();
        fake.refuse = true;
        const lock = new ScreenWakeLock({ wakeLock: fake }, document);

        expect(() => {
            lock.hold();
        }).not.toThrow();
        await settle();
        expect(fake.active).toBe(0);
    });
});
