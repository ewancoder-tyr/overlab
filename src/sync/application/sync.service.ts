import { Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { Clock } from '@shared/application/clock.service';
import { EventLog } from '@shared/application/event-log.service';
import { EventId, isDomainEvent } from '@shared/domain/event';
import { LocalText } from '@shared/domain/language';
import { Result, fail, ok } from '@shared/domain/result';
import { emailInIdToken } from '@sync/domain/id-token';
import {
    SIGNED_OUT,
    SyncState,
    confirm,
    keepOnDevice,
    pendingEvents,
    signedIn,
    signedOut,
    startOver,
} from '@sync/domain/sync-state';
import { SyncConnection, syncStatus } from '@sync/domain/sync-status';
import { RemoteAnswer, SyncRemote, SyncStateStore } from './sync-ports';

/** Events per push request. Keeps a first upload of years of history to a few requests. */
const PUSH_BATCH = 500;
/** How long after a change to wait before pushing, so a burst of edits goes up as one request. */
const SETTLE_MS = 2_000;

/** What the user is told when an action needs the server and the server said no. */
const NEEDS_SERVER: Record<Exclude<RemoteAnswer<unknown>['kind'], 'ok'>, LocalText> = {
    offline: {
        en: 'This needs an internet connection. Try again when you are online.',
        ru: 'Для этого нужен интернет. Попробуйте снова, когда будете в сети.',
    },
    'signed-out': {
        en: 'Your sign-in has expired. Sign in again and retry.',
        ru: 'Вход истёк. Войдите снова и повторите.',
    },
    deleted: {
        en: 'Your cloud copy was just deleted on another device. Try again.',
        ru: 'Облачную копию только что удалили на другом устройстве. Попробуйте снова.',
    },
    failed: {
        en: 'The server could not do this right now. Try again later.',
        ru: 'Сервер сейчас не смог это сделать. Попробуйте позже.',
    },
};

/**
 * Keeps this device's event log in step with the cloud copy. See docs/sync.md, "Sync".
 *
 * The rule that keeps the app offline-first: this service is never between the user and the
 * event log. Logging a set writes to IndexedDB as always. Sync runs beside it, reading the log
 * to find what to push and merging what it pulls, whenever there is a chance to.
 *
 * Every operation runs one at a time (`exclusively`): a sign-out never lands in the middle of a
 * push, and two triggers firing together never push the same events twice.
 */
@Service()
export class SyncService {
    private readonly log = inject(EventLog);
    private readonly clock = inject(Clock);
    private readonly remote = inject(SyncRemote);
    private readonly store = inject(SyncStateStore);

    private readonly state = signal<SyncState>(SIGNED_OUT);
    /** False until the stored state has been read: until then nothing may be pushed. */
    private readonly loaded = signal(false);
    private readonly connection = signal<SyncConnection>('idle');
    private readonly lastSyncedAt = signal<Date | undefined>(undefined);

    /** Who this device is signed in as, or undefined. */
    readonly account = computed(() => this.state().account);
    /** How many events are only on this device so far. */
    readonly pending = computed(() => pendingEvents(this.log.events(), this.state()).length);
    readonly status = computed(() =>
        syncStatus(
            this.state(),
            this.pending(),
            this.clock.pretending() ? 'paused' : this.connection(),
            this.lastSyncedAt(),
        ),
    );

    /** The chain every operation waits its turn in. */
    private queue: Promise<unknown> = Promise.resolve();
    /** True while a sync cycle is waiting in the queue, so further requests can join it. */
    private cycleQueued = false;
    private settleTimer: ReturnType<typeof setTimeout> | undefined;
    /** Events already seen in the log, to tell the user's new events from everything else. */
    private readonly seen = new Set<EventId>();
    private primed = false;

    constructor() {
        void this.store.load().then((state) => {
            this.state.set(state);
            this.loaded.set(true);
        });

        // Runs whenever the log changes or the test date is switched. It does two things with
        // the events the user just added (not the ones sync itself pulled, which are marked as
        // seen before they are merged): keeps them on the device if a test date is on, and
        // otherwise schedules a push.
        effect(() => {
            const events = this.log.events();
            const pretending = this.clock.pretending();
            if (!this.loaded() || this.log.status() !== 'ready') {
                return;
            }
            const fresh = events
                .filter((event) => !this.seen.has(event.id))
                .map((event) => event.id);
            // On the first run every event is "new"; those are history, not the user's latest.
            const firstRun = !this.primed;
            this.primed = true;
            for (const id of fresh) {
                this.seen.add(id);
            }
            // `untracked`: the state written here must not become a reason for this effect to
            // run again.
            untracked(() => {
                if (pretending && !firstRun && fresh.length > 0) {
                    void this.update((state) => keepOnDevice(state, fresh));
                } else {
                    this.syncSoon();
                }
            });
        });
    }

    /**
     * Pushes what is pending, then pulls what is new. Safe to call at any moment and as often
     * as you like: it does nothing when signed out, and calls that arrive while one is waiting
     * join it.
     */
    syncNow(): Promise<void> {
        if (this.cycleQueued) {
            return this.queue.then(() => undefined);
        }
        this.cycleQueued = true;
        return this.exclusively(async () => {
            this.cycleQueued = false;
            await this.cycle();
        });
    }

    /** Signs in with an ID token from Google's button. Everything on the device is then pushed. */
    async signIn(credential: string): Promise<Result<void>> {
        const result = await this.exclusively(async () => {
            const answer = await this.remote.signIn(credential);
            if (answer.kind !== 'ok') {
                return fail(NEEDS_SERVER[answer.kind]);
            }
            const email = emailInIdToken(credential) ?? '';
            await this.update((state) => signedIn(state, email, answer.value));
            this.connection.set('idle');
            return ok(undefined);
        });
        void this.syncNow();
        return result;
    }

    /** Signs out. The device keeps its data unless `erase`; the cloud copy is untouched either way. */
    signOut(erase: boolean): Promise<void> {
        return this.exclusively(async () => {
            if (this.state().account !== undefined) {
                // Best effort: offline, the cookie stays, but this device no longer uses it.
                await this.remote.signOut();
            }
            if (erase) {
                await this.log.clear();
                await this.update(() => SIGNED_OUT);
            } else {
                await this.update(signedOut);
            }
            this.connection.set('idle');
            this.lastSyncedAt.set(undefined);
        });
    }

    /**
     * Deletes the cloud copy and this device's data. Other devices erase theirs when they next
     * sync. Nothing is erased here unless the server confirmed the delete, or the next pull would
     * bring it all back.
     */
    deleteEverything(): Promise<Result<void>> {
        return this.exclusively(async () => {
            const answer = await this.remote.deleteEverything();
            if (answer.kind !== 'ok') {
                return fail(NEEDS_SERVER[answer.kind]);
            }
            await this.log.clear();
            await this.update((state) => startOver(state, answer.value));
            this.connection.set('idle');
            this.lastSyncedAt.set(this.clock.currentTime());
            return ok(undefined);
        });
    }

    private syncSoon(): void {
        clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => {
            void this.syncNow();
        }, SETTLE_MS);
    }

    private async cycle(): Promise<void> {
        if (!this.loaded() || this.log.status() !== 'ready' || this.state().account === undefined) {
            return;
        }
        if (this.clock.pretending()) {
            return; // Shown as "paused"; the effect syncs again once the test date is off.
        }
        this.connection.set('syncing');
        const problem = (await this.pushAll()) ?? (await this.pullAll());
        switch (problem?.kind) {
            case undefined:
                this.connection.set('idle');
                this.lastSyncedAt.set(this.clock.currentTime());
                return;
            case 'deleted':
                // "Delete everything" was pressed on another device: follow it, then pull the
                // (empty, or newer) copy at once.
                await this.log.clear();
                await this.update((state) => startOver(state, problem.generation));
                this.connection.set('idle');
                this.syncSoon();
                return;
            case 'signed-out':
                this.connection.set('expired');
                return;
            case 'offline':
            case 'failed':
                this.connection.set(problem.kind);
                return;
        }
    }

    /** Pushes pending events in batches. Answers the problem that stopped it, if any. */
    private async pushAll(): Promise<RemoteAnswer<never> | undefined> {
        for (;;) {
            const batch = pendingEvents(this.log.events(), this.state()).slice(0, PUSH_BATCH);
            if (batch.length === 0) {
                return undefined;
            }
            const answer = await this.remote.push(this.state().generation, batch);
            if (answer.kind !== 'ok') {
                return answer;
            }
            await this.update((state) =>
                confirm(
                    state,
                    batch.map((event) => event.id),
                ),
            );
        }
    }

    /** Pulls page by page from the cursor. Answers the problem that stopped it, if any. */
    private async pullAll(): Promise<RemoteAnswer<never> | undefined> {
        for (;;) {
            const answer = await this.remote.pull(this.state().generation, this.state().cursor);
            if (answer.kind !== 'ok') {
                return answer;
            }
            // The server stores whatever devices sent; check each event as an import would.
            const events = answer.value.events.filter(isDomainEvent);
            for (const event of events) {
                this.seen.add(event.id);
            }
            // Merge first, then move the cursor: if the app dies in between, the next pull
            // fetches the page again, and merging it twice changes nothing.
            await this.log.merge(events);
            const ids = events.map((event) => event.id);
            await this.update((state) => confirm(state, ids, answer.value.cursor));
            if (!answer.value.more) {
                return undefined;
            }
        }
    }

    private exclusively<T>(work: () => Promise<T>): Promise<T> {
        const result = this.queue.then(work);
        // The chain itself must survive a failure, or one error would block sync forever.
        this.queue = result.catch((error: unknown) => {
            console.error('Sync failed', error);
        });
        return result;
    }

    private async update(change: (state: SyncState) => SyncState): Promise<void> {
        const next = change(this.state());
        this.state.set(next);
        await this.store.save(next);
    }
}
