import { Injectable, computed, inject } from '@angular/core';
import { BuddyNotifications, BuddyPush } from '@leaderboard/application/buddy-ports';
import { PushSubscriptions } from '@shared/infrastructure/push-subscriptions';

/**
 * Buddies' notifications through Web Push. The browser's one subscription is shared with the
 * gym reminders, so buddies only claim it while they use it (see `PushSubscriptions`).
 */
@Injectable()
export class PushBuddyChannel extends BuddyPush {
    private readonly push = inject(PushSubscriptions);
    private readonly subscription = this.push.subscriptionFor('buddies');

    readonly state = computed<BuddyNotifications>(() => {
        if (!this.push.supported || this.push.permission() === undefined) {
            return 'unsupported';
        }
        if (this.push.permission() === 'denied') {
            return 'blocked';
        }
        return this.subscription() === null ? 'off' : 'on';
    });

    // `toJSON` gives the address and the two keys the server encrypts messages with.
    readonly address = computed(() => this.subscription()?.toJSON());

    override async turnOn(): Promise<PushSubscriptionJSON | undefined> {
        return (await this.push.claim('buddies'))?.toJSON();
    }

    override turnOff(): Promise<void> {
        return this.push.release('buddies');
    }
}
