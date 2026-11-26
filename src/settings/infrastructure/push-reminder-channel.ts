import { Injectable, computed, inject } from '@angular/core';
import { LocalText } from '@shared/domain/language';
import { Result, fail, ok } from '@shared/domain/result';
import { PushSubscriptions } from '@shared/infrastructure/push-subscriptions';
import {
    ReminderChannel,
    ReminderChannelState,
    ReminderPlan,
} from '@settings/application/reminder-channel';

/** Served by the reminder server through the same host as the app (see deploy/nginx.conf). */
const API = 'api/reminders';

const OFFLINE: LocalText = {
    en: 'Could not reach the reminder server. Check your connection and try again.',
    ru: 'Не удалось связаться с сервером напоминаний. Проверьте подключение и попробуйте ещё раз.',
};

const BLOCKED: LocalText = {
    en: 'Notifications are blocked for OverLab. Allow them in the browser settings.',
    ru: 'Уведомления для OverLab заблокированы. Разрешите их в настройках браузера.',
};

/**
 * What to tell the user when the server says no, by HTTP status. The server's own error text
 * is English and meant for whoever reads its logs, so the app words the few cases a user can
 * actually meet itself.
 */
function refusal(status: number): LocalText {
    switch (status) {
        case 404:
        case 410:
            return {
                en: 'This device is no longer registered. Switch reminders off and on again.',
                ru: 'Это устройство больше не зарегистрировано. Выключите и снова включите напоминания.',
            };
        case 503:
            return {
                en: 'The reminder server is full. Try again later.',
                ru: 'Сервер напоминаний переполнен. Попробуйте позже.',
            };
        default:
            return {
                en: `The reminder server refused the request (${status}).`,
                ru: `Сервер напоминаний отклонил запрос (${status}).`,
            };
    }
}

/**
 * Reminders through Web Push.
 *
 * Three parties are involved. The browser asks its vendor's push service (Google's, for Chrome)
 * for a subscription: an address that messages can be posted to. We hand that address to our
 * reminder server together with the plan. On a gym day the server posts a message to the
 * address, the push service wakes the phone, and Angular's service worker shows the
 * notification, even with the app closed.
 */
@Injectable()
export class PushReminderChannel extends ReminderChannel {
    /**
     * The browser's one subscription is shared with the buddies' notifications, so it is not
     * ours to make and drop: reminders claim it while they are on (see `PushSubscriptions`).
     */
    private readonly push = inject(PushSubscriptions);

    /** The subscription while reminders are on, or `null`. */
    private readonly subscription = this.push.subscriptionFor('reminders');

    readonly state = computed<ReminderChannelState>(() => {
        if (!this.push.supported || this.push.permission() === undefined) {
            return 'unsupported';
        }
        if (this.push.permission() === 'denied') {
            return 'blocked';
        }
        return this.subscription() === null ? 'off' : 'on';
    });

    async enable(plan: ReminderPlan): Promise<Result<void>> {
        // Shows the browser's permission prompt the first time.
        const subscription = await this.push.claim('reminders');
        if (subscription === undefined) {
            return fail(this.push.permission() === 'denied' ? BLOCKED : OFFLINE);
        }
        return this.register(subscription, plan);
    }

    update(plan: ReminderPlan): Promise<Result<void>> {
        const subscription = this.subscription();
        return subscription === null
            ? Promise.resolve(ok(undefined))
            : this.register(subscription, plan);
    }

    async disable(): Promise<Result<void>> {
        const subscription = this.subscription();
        if (subscription === null) {
            return ok(undefined);
        }
        // Tell the server first, while we still know the address to forget. If it cannot be
        // reached we go on anyway: the server drops a dead address by itself the next time it
        // tries to use it.
        await this.send('DELETE', 'device', { endpoint: subscription.endpoint });
        await this.push.release('reminders');
        return ok(undefined);
    }

    sendTest(): Promise<Result<void>> {
        const subscription = this.subscription();
        return subscription === null
            ? Promise.resolve(fail({ en: 'Reminders are not on.', ru: 'Напоминания не включены.' }))
            : this.send('POST', 'test', { endpoint: subscription.endpoint });
    }

    private register(subscription: PushSubscription, plan: ReminderPlan): Promise<Result<void>> {
        return this.send('PUT', 'device', {
            // `toJSON` gives the address and the two keys the server encrypts messages with.
            subscription: subscription.toJSON(),
            schedule: plan.schedule,
            time: plan.time,
            hype: plan.hype,
            solo: plan.solo,
            language: plan.language,
            // The server runs in UTC; it needs the zone to know when it is 15:00 here.
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
    }

    private async send(method: string, path: string, body: unknown): Promise<Result<void>> {
        try {
            const response = await fetch(`${API}/${path}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return response.ok ? ok(undefined) : fail(refusal(response.status));
        } catch {
            return fail(OFFLINE);
        }
    }
}
