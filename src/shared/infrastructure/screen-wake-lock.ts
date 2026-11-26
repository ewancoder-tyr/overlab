/** The part of `navigator` this wrapper uses, so tests can hand in a fake. */
export interface WakeLockHost {
    readonly wakeLock?: Pick<WakeLock, 'request'>;
}

/**
 * Keeps the screen on while held (the Screen Wake Lock API), so the phone does not lock between
 * sets.
 *
 * Two quirks of the API shape this class:
 * - The browser drops the lock by itself whenever the page is hidden. So `hold()` is a wish that
 *   lasts until `release()`, and the lock is requested again each time the page becomes visible.
 * - It may be missing (old iOS) or refuse (battery saver). Keeping the screen on is a nicety, so
 *   every failure is swallowed and nothing is ever shown to the user.
 */
export class ScreenWakeLock {
    private held = false;
    private sentinel: WakeLockSentinel | undefined;
    /** True while a request is on its way, so two quick calls do not take two locks. */
    private requesting = false;

    constructor(
        private readonly host: WakeLockHost = navigator,
        private readonly doc: Document = document,
    ) {
        doc.addEventListener('visibilitychange', () => {
            if (this.held && this.isVisible()) {
                void this.request();
            }
        });
    }

    /** Keeps the screen on from now until `release()`. Calling it again does nothing. */
    hold(): void {
        this.held = true;
        void this.request();
    }

    release(): void {
        this.held = false;
        const sentinel = this.sentinel;
        this.sentinel = undefined;
        sentinel?.release().catch(() => undefined);
    }

    private async request(): Promise<void> {
        const wakeLock = this.host.wakeLock;
        if (wakeLock === undefined || this.requesting || this.sentinel !== undefined) {
            return;
        }
        if (!this.isVisible()) {
            return; // A hidden page is always refused; it is tried again on becoming visible.
        }
        this.requesting = true;
        try {
            const sentinel = await wakeLock.request('screen');
            if (!this.held) {
                // Released while the request was on its way.
                await sentinel.release();
                return;
            }
            this.sentinel = sentinel;
            // The browser releases it when the page is hidden; forget it then, so the next
            // `visibilitychange` asks again.
            sentinel.addEventListener('release', () => {
                if (this.sentinel === sentinel) {
                    this.sentinel = undefined;
                }
            });
        } catch {
            // Refused or unsupported: the screen simply locks as usual.
        } finally {
            this.requesting = false;
        }
    }

    private isVisible(): boolean {
        return this.doc.visibilityState === 'visible';
    }
}
