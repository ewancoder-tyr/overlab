import { Service, Signal, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';

/** What the device's push subscription is used for. */
export type PushUse = 'reminders' | 'buddies';

/** The reminder server's public key is served through the same host as the app. */
const KEY_URL = 'api/reminders/key';

const USES_KEY = 'overlab:push-uses';

/**
 * The browser's one push subscription, shared by everything that sends this device
 * notifications: the gym reminders and the buddies' sets.
 *
 * A browser gives a site a single subscription (one address to post messages to), yet the two
 * features are switched on and off separately. So each **claims** the subscription while it
 * uses it, and the subscription is given up only when nobody claims it any more. Without this,
 * following a buddy would switch the gym reminders on, and switching the reminders off would
 * silence the buddies.
 *
 * The claims are facts about this device, like the subscription itself, so they are kept in
 * `localStorage`, not in the event log.
 *
 * `SwPush` is Angular's wrapper around the browser's Push API.
 */
@Service()
export class PushSubscriptions {
    private readonly push = inject(SwPush);

    /** The browser's current subscription, or `null`. Angular exposes it as an RxJS stream. */
    private readonly subscription = toSignal(this.push.subscription, { initialValue: null });

    /**
     * Who claims the subscription. Nothing stored means a device from before buddies, where a
     * subscription could only have been made for reminders.
     */
    private readonly uses = signal<ReadonlySet<PushUse>>(storedUses() ?? new Set(['reminders']));

    /**
     * `false` when there is no service worker: development, the single-file build, or a
     * browser without support.
     */
    readonly supported = this.push.isEnabled;

    /**
     * The browser offers no event for a permission change, so this is our own copy, refreshed
     * after every action that can change it. `undefined` where notifications do not exist.
     */
    private readonly currentPermission = signal(readPermission());
    readonly permission = this.currentPermission.asReadonly();

    /** The subscription, but only while `use` claims it; `null` otherwise. */
    subscriptionFor(use: PushUse): Signal<PushSubscription | null> {
        return computed(() => (this.uses().has(use) ? this.subscription() : null));
    }

    /**
     * Subscribes (showing the browser's permission prompt the first time, so call it from a
     * tap) and records that `use` needs the subscription. `undefined` when it could not be
     * done: `permission()` then says whether the user refused.
     */
    async claim(use: PushUse): Promise<PushSubscription | undefined> {
        // Before buddies nothing was stored. Settle now whether reminders were on, while the
        // only subscription there can be is theirs.
        const uses = new Set<PushUse>(
            storedUses() ?? ((await existingSubscription()) ? ['reminders'] : []),
        );
        let subscription: PushSubscription;
        try {
            const response = await fetch(KEY_URL);
            const { publicKey } = (await response.json()) as { publicKey: string };
            subscription = await this.push.requestSubscription({ serverPublicKey: publicKey });
        } catch {
            this.currentPermission.set(readPermission());
            return undefined;
        }
        this.currentPermission.set(readPermission());
        this.keep(uses.add(use));
        return subscription;
    }

    /** `use` no longer needs the subscription. It is given up when nobody else does either. */
    async release(use: PushUse): Promise<void> {
        const uses = new Set(this.uses());
        uses.delete(use);
        this.keep(uses);
        if (uses.size === 0 && this.subscription() !== null) {
            // Failing to unsubscribe leaves an address nobody posts to: harmless.
            await this.push.unsubscribe().catch(() => undefined);
        }
    }

    private keep(uses: ReadonlySet<PushUse>): void {
        this.uses.set(uses);
        try {
            localStorage.setItem(USES_KEY, JSON.stringify([...uses]));
        } catch {
            // Storage is full or blocked: the claims last until the app is closed.
        }
    }
}

function storedUses(): Set<PushUse> | undefined {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(USES_KEY) ?? 'null');
        if (Array.isArray(value)) {
            return new Set(value.filter((use) => use === 'reminders' || use === 'buddies'));
        }
    } catch {
        // Unreadable or blocked: as good as never stored.
    }
    return undefined;
}

/**
 * Whether the browser holds a subscription right now. Asked directly rather than through
 * `SwPush`, whose stream has no value until the service worker is ready.
 */
async function existingSubscription(): Promise<boolean> {
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        // `undefined` without a service worker, `null` without a subscription.
        return subscription !== undefined && subscription !== null;
    } catch {
        return false;
    }
}

/** `undefined` where the Notification API does not exist at all. */
function readPermission(): NotificationPermission | undefined {
    return 'Notification' in globalThis ? Notification.permission : undefined;
}
