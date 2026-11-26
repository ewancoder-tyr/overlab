import { Service, inject, signal } from '@angular/core';
import { DomainEvent, EventContext, mergeEvents } from '@shared/domain/event';
import { Clock } from './clock.service';
import { DEVICE_ID, EventStore } from './event-store';

export type EventLogStatus = 'loading' | 'ready' | 'failed';

/**
 * The in-memory copy of the event log, exposed as a signal.
 *
 * Every projection in the app is a `computed()` that ultimately reads `events`, so appending one
 * event automatically refreshes every view that depends on it. This service is the only writer.
 *
 * `@Service()` registers the class as an application-wide singleton.
 */
@Service()
export class EventLog {
    private readonly store = inject(EventStore);
    private readonly deviceId = inject(DEVICE_ID);
    private readonly clock = inject(Clock);

    private readonly state = signal<readonly DomainEvent[]>([]);
    private readonly currentStatus = signal<EventLogStatus>('loading');

    /** All events, in no particular order. Projections sort when order matters. */
    readonly events = this.state.asReadonly();
    readonly status = this.currentStatus.asReadonly();

    /** Called once at start-up (see `app.config.ts`). */
    async load(): Promise<void> {
        try {
            this.state.set(await this.store.loadAll());
            this.currentStatus.set('ready');
        } catch (error) {
            // Never fall back to an empty log silently: that would look like data loss and,
            // worse, invite the user to start logging on top of a store we could not read.
            console.error('Could not load the event log', error);
            this.currentStatus.set('failed');
        }
    }

    /** What event factories need to stamp a new event. */
    context(): EventContext {
        return {
            deviceId: this.deviceId,
            // From the app's clock, never `new Date()`: see the test date in `Clock`.
            now: this.clock.currentTime(),
            // Logging in the past: it happened then, but it is written down today.
            ...(this.clock.inThePast() ? { recordedAt: this.clock.realTime() } : {}),
            newId: () => crypto.randomUUID(),
        };
    }

    /** Persists first, then publishes: the UI never shows an event that is not safely stored. */
    async append(event: DomainEvent): Promise<void> {
        await this.store.append([event]);
        this.state.update((events) => [...events, event]);
    }

    /**
     * Adds events from a backup (and later from sync), skipping the ones already present.
     * @returns how many events were new.
     */
    async merge(incoming: readonly DomainEvent[]): Promise<number> {
        const { events, added } = mergeEvents(this.state(), incoming);
        if (added.length > 0) {
            await this.store.append(added);
            this.state.set(events);
        }
        return added.length;
    }

    /** Erases the whole log on this device. Irreversible. */
    async clear(): Promise<void> {
        await this.store.clear();
        this.state.set([]);
    }
}
