import { Service, computed, effect, inject, untracked } from '@angular/core';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { CatalogService } from '@catalog/application/catalog.service';
import {
    BuddyActivity,
    cardioActivity,
    news,
    setActivity,
} from '@leaderboard/domain/buddy-activity';
import { Clock } from '@shared/application/clock.service';
import { EventLog } from '@shared/application/event-log.service';
import { DEVICE_ID } from '@shared/application/event-store';
import { Locale } from '@shared/application/locale.service';
import { LocalText } from '@shared/domain/language';
import { Result, fail, ok } from '@shared/domain/result';
import { CardioPerformed } from '@training/domain/cardio';
import { SetPerformed, isStandalone, primaryExerciseId } from '@training/domain/set';
import { TrainingService } from '@training/application/training.service';
import { BuddyPush, BuddyRemote } from './buddy-ports';
import { LeaderboardService, PROBLEM } from './leaderboard.service';

const BLOCKED: LocalText = {
    en: 'Notifications are blocked for OverLab. Allow them in the browser settings.',
    ru: 'Уведомления для OverLab заблокированы. Разрешите их в настройках браузера.',
};

const NOT_SET_UP: LocalText = {
    en: 'Notifications could not be set up. Check your connection and try again.',
    ru: 'Не удалось настроить уведомления. Проверьте подключение и попробуйте ещё раз.',
};

/**
 * Buddies: two people on the leaderboard who follow each other are told about each other's
 * sets, as they are logged. See docs/leaderboard.md, "Buddies".
 *
 * Following is blind and mutual. A follow alone does nothing and tells nobody; this device
 * never learns who follows its account, and the server answers a reported set the same way
 * whether anyone is listening. So all the app can show is whom *you* follow.
 *
 * Nothing here is an event and nothing is stored: a follow is a row on the server, like taking
 * part in the leaderboard, and what was done is worded here, pushed by the server and forgotten.
 */
@Service()
export class BuddiesService {
    private readonly leaderboard = inject(LeaderboardService);
    private readonly remote = inject(BuddyRemote);
    private readonly push = inject(BuddyPush);
    private readonly training = inject(TrainingService);
    private readonly analytics = inject(AnalyticsService);
    private readonly catalog = inject(CatalogService).catalog;
    private readonly clock = inject(Clock);
    private readonly log = inject(EventLog);
    private readonly deviceId = inject(DEVICE_ID);
    private readonly language = inject(Locale).language;

    /** Whether this device can be, and is, notified about buddies. */
    readonly notifications = this.push.state;

    /** Whether this account follows anyone, as the board last said. */
    readonly followsAnyone = computed(() =>
        (this.leaderboard.board()?.standings ?? []).some((row) => row.following),
    );

    /**
     * The ids of the sets and bouts already dealt with, told or not. `undefined` until the log
     * has been looked at once: whatever is in it by then was logged before, and is not news.
     */
    private known: Set<string> | undefined;
    /** Reports on their way to the server, so a slow one is not sent twice. */
    private readonly sending = new Set<string>();

    constructor() {
        // Keeps the server's idea of this device current: its address, and the language to
        // roast in. Runs at start-up and whenever either changes, only while it matters.
        effect(() => {
            const address = this.push.address();
            const language = this.language();
            if (address !== undefined && this.followsAnyone()) {
                untracked(() => void this.remote.registerDevice(address, language));
            }
        });

        // Tells the server about every fresh set and bout logged on this device.
        effect(() => {
            if (this.log.status() !== 'ready') {
                return;
            }
            const sets = this.training.sets();
            const cardio = this.training.cardio();
            // Without a mutual follow nobody is told anyway, and following someone is this
            // side's half of one, so a device that follows nobody need not report at all.
            const telling = this.leaderboard.reporting() && this.followsAnyone();
            // Read only to run again as time passes: a report that found no connection is
            // tried again on the next tick, for as long as the set is fresh.
            this.clock.now();
            untracked(() => {
                this.tellNews(sets, cardio, telling);
            });
        });
    }

    /**
     * Follows a row of the board. On the first follow this also sets notifications up on this
     * device, which asks the browser's permission. A refusal does not undo the follow: the
     * other side still hears about this account's sets once they follow back.
     */
    async follow(id: string): Promise<Result<void>> {
        if (this.push.state() === 'off') {
            await this.push.turnOn();
        }
        const answer = await this.remote.follow(id);
        if (answer.kind !== 'ok') {
            return fail(PROBLEM[answer.kind]);
        }
        await this.leaderboard.refresh();
        return ok(undefined);
    }

    /** Stops following a row. That ends the telling in both directions, silently. */
    async unfollow(id: string): Promise<Result<void>> {
        const answer = await this.remote.unfollow(id);
        if (answer.kind !== 'ok') {
            return fail(PROBLEM[answer.kind]);
        }
        await this.leaderboard.refresh();
        // The last follow gone (and the board fetched, so that is certain): this device has
        // nothing left to be told, so the server may forget where to push to.
        const address = this.push.address();
        if (
            this.leaderboard.connection() === 'idle' &&
            !this.followsAnyone() &&
            address?.endpoint !== undefined
        ) {
            await this.remote.forgetDevice(address.endpoint);
            await this.push.turnOff();
        }
        return ok(undefined);
    }

    /**
     * Sets notifications up on this device: for a second phone of an account that already
     * follows someone, or after a refused permission was allowed again.
     */
    async turnOnHere(): Promise<Result<void>> {
        if ((await this.push.turnOn()) !== undefined) {
            return ok(undefined); // The effect above registers the address.
        }
        return fail(this.push.state() === 'blocked' ? BLOCKED : NOT_SET_UP);
    }

    private tellNews(
        sets: readonly SetPerformed[],
        cardio: readonly CardioPerformed[],
        telling: boolean,
    ): void {
        const everything = [...sets, ...cardio];
        if (this.known === undefined || !telling) {
            // Nothing is told now, and nothing of this is told later either.
            this.known = new Set(everything.map((event) => event.id));
            return;
        }
        const known = this.known;
        // The precise time, not the ticking signal: a set logged this second is not "future".
        const now = this.clock.currentTime();
        const toTell = new Set(
            news(everything, known, this.deviceId, now)
                .filter((event) => !this.sending.has(event.id))
                .map((event) => event.id),
        );
        for (const event of everything) {
            if (!toTell.has(event.id)) {
                // No news now means no news ever, unless it is on its way already.
                if (!this.sending.has(event.id)) {
                    known.add(event.id);
                }
                continue;
            }
            const activity =
                event.type === 'SetPerformed' ? this.describeSet(event) : this.describeBout(event);
            if (activity === undefined) {
                known.add(event.id);
            } else {
                void this.tell(activity);
            }
        }
    }

    private async tell(activity: BuddyActivity): Promise<void> {
        this.sending.add(activity.tag);
        const answer = await this.remote.report(activity);
        this.sending.delete(activity.tag);
        // Without a connection it stays unknown, to be tried again while it is fresh. Any
        // other answer settles it: told, or refused for good.
        if (answer.kind !== 'offline') {
            this.known?.add(activity.tag);
        }
    }

    /** A set with its record, judged in the history it belongs to (workout or standalone). */
    private describeSet(set: SetPerformed): BuddyActivity | undefined {
        const exerciseId = primaryExerciseId(set);
        if (exerciseId === undefined) {
            return undefined;
        }
        const sessions = isStandalone(set)
            ? this.training.standaloneSessionsOf(exerciseId)
            : this.training.sessionsOf(exerciseId);
        const record = this.analytics.recordsOf(sessions).has(set.id);
        return setActivity(set, this.catalog(), record);
    }

    /** A bout with the record of its session: cardio records belong to whole sessions. */
    private describeBout(bout: CardioPerformed): BuddyActivity | undefined {
        const sessions = this.training.cardioSessionsOf(bout.exerciseId);
        const index = sessions.findIndex((session) =>
            session.bouts.some((other) => other.id === bout.id),
        );
        // `cardioRecordsOf` answers one entry per session, in the same order.
        const record = this.analytics.cardioRecordsOf(sessions)[index]?.record !== undefined;
        return cardioActivity(bout, this.catalog(), record);
    }
}
