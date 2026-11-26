import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Clock } from '@shared/application/clock.service';
import { EventLog } from '@shared/application/event-log.service';
import { DEVICE_ID, EventStore } from '@shared/application/event-store';
import { DeviceId, DomainEvent, EventId, IsoDateTime } from '@shared/domain/event';
import { SIGNED_OUT, SyncState } from '@sync/domain/sync-state';
import { GoogleSignIn, PulledPage, RemoteAnswer, SyncRemote, SyncStateStore } from './sync-ports';
import { SyncService } from './sync.service';

/*
 * The sync cycle against an in-memory stand-in for the server, which behaves like
 * reminder-server/cloudsync: a set of events per generation, a growing sequence number, and a
 * 409 for a device on an old generation.
 */

class FakeServer {
    generation = 1;
    stored: { seq: number; event: DomainEvent }[] = [];
    private seq = 0;
    online = true;

    push(generation: number, events: readonly DomainEvent[]): RemoteAnswer<void> {
        const problem = this.check(generation);
        if (problem !== undefined) {
            return problem;
        }
        for (const event of events) {
            if (!this.stored.some((row) => row.event.id === event.id)) {
                this.stored.push({ seq: ++this.seq, event });
            }
        }
        return { kind: 'ok', value: undefined };
    }

    pull(generation: number, after: number): RemoteAnswer<PulledPage> {
        const problem = this.check(generation);
        if (problem !== undefined) {
            return problem;
        }
        const rows = this.stored.filter((row) => row.seq > after);
        return {
            kind: 'ok',
            value: {
                events: rows.map((row) => row.event),
                cursor: rows.at(-1)?.seq ?? after,
                more: false,
            },
        };
    }

    deleteEverything(): RemoteAnswer<number> {
        if (!this.online) {
            return { kind: 'offline' };
        }
        this.stored = [];
        return { kind: 'ok', value: ++this.generation };
    }

    private check(generation: number): RemoteAnswer<never> | undefined {
        if (!this.online) {
            return { kind: 'offline' };
        }
        return generation === this.generation
            ? undefined
            : { kind: 'deleted', generation: this.generation };
    }
}

class FakeRemote extends SyncRemote {
    constructor(private readonly server: FakeServer) {
        super();
    }
    override signIn(): Promise<RemoteAnswer<number>> {
        return Promise.resolve(
            this.server.online
                ? { kind: 'ok', value: this.server.generation }
                : { kind: 'offline' },
        );
    }
    override signOut(): Promise<void> {
        return Promise.resolve();
    }
    override push(generation: number, events: readonly DomainEvent[]): Promise<RemoteAnswer<void>> {
        return Promise.resolve(this.server.push(generation, events));
    }
    override pull(generation: number, after: number): Promise<RemoteAnswer<PulledPage>> {
        return Promise.resolve(this.server.pull(generation, after));
    }
    override deleteEverything(): Promise<RemoteAnswer<number>> {
        return Promise.resolve(this.server.deleteEverything());
    }
}

class MemoryEventStore extends EventStore {
    events: DomainEvent[] = [];
    override loadAll(): Promise<readonly DomainEvent[]> {
        return Promise.resolve([...this.events]);
    }
    override append(events: readonly DomainEvent[]): Promise<void> {
        this.events.push(...events);
        return Promise.resolve();
    }
    override clear(): Promise<void> {
        this.events = [];
        return Promise.resolve();
    }
}

class MemoryStateStore extends SyncStateStore {
    state: SyncState = SIGNED_OUT;
    override load(): Promise<SyncState> {
        return Promise.resolve(this.state);
    }
    override save(state: SyncState): Promise<void> {
        this.state = state;
        return Promise.resolve();
    }
}

function event(id: string): DomainEvent {
    return {
        id: id as EventId,
        type: 'SetPerformed',
        version: 1,
        deviceId: 'device' as DeviceId,
        occurredAt: '2026-11-12T10:00:00.000Z' as IsoDateTime,
        recordedAt: '2026-11-12T10:00:00.000Z' as IsoDateTime,
    };
}

/** A token whose payload names an email; the fake server never checks it. */
const CREDENTIAL = `h.${btoa(JSON.stringify({ email: 'me@example.com' }))}.s`;

/** One device: a fresh app with empty storage, talking to the shared server. */
async function device(server: FakeServer): Promise<{ sync: SyncService; log: EventLog }> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        providers: [
            { provide: EventStore, useValue: new MemoryEventStore() },
            { provide: DEVICE_ID, useValue: 'device' as DeviceId },
            { provide: SyncRemote, useValue: new FakeRemote(server) },
            { provide: SyncStateStore, useValue: new MemoryStateStore() },
            { provide: GoogleSignIn, useValue: {} },
        ],
    });
    const log = TestBed.inject(EventLog);
    await log.load();
    const sync = TestBed.inject(SyncService);
    await Promise.resolve(); // Lets the stored sync state load.
    return { sync, log };
}

describe('SyncService', () => {
    let server: FakeServer;

    beforeEach(() => {
        server = new FakeServer();
    });

    it('signing in uploads what was logged before, signed out and offline', async () => {
        const phone = await device(server);
        await phone.log.append(event('a'));
        await phone.sync.signIn(CREDENTIAL);
        await phone.sync.syncNow();

        expect(server.stored.map((row) => row.event.id)).toEqual(['a']);
        expect(phone.sync.status()).toMatchObject({ kind: 'backed-up' });
    });

    it('logging offline keeps everything, and it all goes up when the network is back', async () => {
        const phone = await device(server);
        await phone.sync.signIn(CREDENTIAL);
        server.online = false;
        await phone.log.append(event('a'));
        await phone.sync.syncNow();

        expect(phone.log.events().map((e) => e.id)).toEqual(['a']);
        expect(phone.sync.status()).toMatchObject({
            kind: 'waiting',
            pending: 1,
            reason: 'offline',
        });

        server.online = true;
        await phone.sync.syncNow();
        expect(server.stored.map((row) => row.event.id)).toEqual(['a']);
        expect(phone.sync.pending()).toBe(0);
    });

    it('a new device pulls the whole history', async () => {
        server.push(1, [event('a'), event('b')]);
        const tablet = await device(server);
        await tablet.sync.signIn(CREDENTIAL);
        await tablet.sync.syncNow();

        expect(tablet.log.events().map((e) => e.id)).toEqual(['a', 'b']);
        expect(tablet.sync.pending()).toBe(0);
    });

    it('a device that missed "Delete everything" erases itself instead of pushing the old history back', async () => {
        const tablet = await device(server);
        await tablet.log.append(event('a'));
        await tablet.sync.signIn(CREDENTIAL);
        await tablet.sync.syncNow();

        server.deleteEverything(); // Pressed on another device.
        await tablet.log.append(event('b')); // Logged before the tablet heard of it.
        await tablet.sync.syncNow();

        expect(server.stored).toEqual([]);
        expect(tablet.log.events()).toEqual([]);
        expect(tablet.sync.account()).toEqual({ email: 'me@example.com' });
    });

    it('"Delete everything" offline deletes nothing, not even on this device', async () => {
        const phone = await device(server);
        await phone.log.append(event('a'));
        await phone.sync.signIn(CREDENTIAL);
        await phone.sync.syncNow();
        server.online = false;

        const result = await phone.sync.deleteEverything();
        expect(result.ok).toBe(false);
        expect(phone.log.events().map((e) => e.id)).toEqual(['a']);
        expect(server.stored).toHaveLength(1);
    });

    it('what is logged on a test date stays on the device, also after the test date is off', async () => {
        const phone = await device(server);
        await phone.sync.signIn(CREDENTIAL);
        await phone.log.append(event('real'));
        TestBed.tick(); // Runs effects: the service sees the log as it is now.

        TestBed.inject(Clock).pretendTodayIs('2026-12-01');
        await phone.log.append(event('pretend'));
        TestBed.tick();
        await phone.sync.syncNow();
        expect(phone.sync.status()).toMatchObject({ kind: 'waiting', reason: 'paused' });

        TestBed.inject(Clock).backToRealTime();
        await phone.sync.syncNow();
        expect(server.stored.map((row) => row.event.id)).toEqual(['real']);
        expect(phone.sync.status()).toMatchObject({ kind: 'backed-up' });
    });

    it('erasing this device signs it out and leaves the cloud copy', async () => {
        const phone = await device(server);
        await phone.log.append(event('a'));
        await phone.sync.signIn(CREDENTIAL);
        await phone.sync.syncNow();

        await phone.sync.signOut(true);
        expect(phone.log.events()).toEqual([]);
        expect(phone.sync.account()).toBeUndefined();
        expect(server.stored).toHaveLength(1);
    });
});
