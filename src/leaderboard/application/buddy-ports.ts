import { Signal } from '@angular/core';
import { BuddyActivity } from '@leaderboard/domain/buddy-activity';
import { Language } from '@shared/domain/language';
import { LeaderboardAnswer } from './leaderboard-ports';

/** Port: the buddies routes of the server (see `reminder-server/leaderboard/buddies.go`). */
export abstract class BuddyRemote {
    /** Follows the row of the board with this public id. */
    abstract follow(id: string): Promise<LeaderboardAnswer<void>>;
    abstract unfollow(id: string): Promise<LeaderboardAnswer<void>>;
    /** Tells the server where to push to on this device, and in which language. */
    abstract registerDevice(
        address: PushSubscriptionJSON,
        language: Language,
    ): Promise<LeaderboardAnswer<void>>;
    abstract forgetDevice(endpoint: string): Promise<LeaderboardAnswer<void>>;
    /**
     * "I just did this." The server answers the same whether or not anyone is told, so `ok`
     * means only that it arrived.
     */
    abstract report(activity: BuddyActivity): Promise<LeaderboardAnswer<void>>;
}

/**
 * Whether this device can be notified about buddies.
 * - `unsupported`: no push here (not installed as an app, an old browser, the single-file build).
 * - `blocked`: the user refused notifications for this site in the browser.
 * - `off` / `on`: possible, and not yet (or already) set up on this device.
 */
export type BuddyNotifications = 'unsupported' | 'blocked' | 'off' | 'on';

/** Port: this device's push subscription, as far as buddies use it. */
export abstract class BuddyPush {
    abstract readonly state: Signal<BuddyNotifications>;
    /** Where to push to, while buddies use the subscription; `undefined` otherwise. */
    abstract readonly address: Signal<PushSubscriptionJSON | undefined>;
    /**
     * Sets notifications up on this device, asking the browser's permission the first time
     * (so it must follow a tap). `undefined` when that did not work; `state` says why.
     */
    abstract turnOn(): Promise<PushSubscriptionJSON | undefined>;
    /** Buddies no longer need the subscription. */
    abstract turnOff(): Promise<void>;
}
