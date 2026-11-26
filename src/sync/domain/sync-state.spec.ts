import { describe, expect, it } from 'vitest';
import { DeviceId, DomainEvent, EventId, IsoDateTime } from '@shared/domain/event';
import {
    SIGNED_OUT,
    confirm,
    keepOnDevice,
    pendingEvents,
    signedIn,
    signedOut,
    startOver,
} from './sync-state';

function event(id: string): DomainEvent {
    return {
        id: id as EventId,
        type: 'SetPerformed',
        version: 1,
        deviceId: 'phone' as DeviceId,
        occurredAt: '2026-11-12T10:00:00.000Z' as IsoDateTime,
        recordedAt: '2026-11-12T10:00:00.000Z' as IsoDateTime,
    };
}

const ids = (events: readonly DomainEvent[]): string[] => events.map((e) => e.id);
const log = [event('a'), event('b'), event('c')];

describe('sync state', () => {
    it('signing in makes everything already on the device pending, so it is uploaded', () => {
        const state = signedIn(SIGNED_OUT, 'me@example.com', 1);
        expect(ids(pendingEvents(log, state))).toEqual(['a', 'b', 'c']);
    });

    it('an event is pending until the server has confirmed it', () => {
        const state = confirm(signedIn(SIGNED_OUT, 'me@example.com', 1), ['a' as EventId]);
        expect(ids(pendingEvents(log, state))).toEqual(['b', 'c']);
    });

    it('pulling moves the cursor and confirms what was pulled', () => {
        const state = confirm(signedIn(SIGNED_OUT, 'me@example.com', 1), ['b' as EventId], 42);
        expect(state.cursor).toBe(42);
        expect(ids(pendingEvents(log, state))).toEqual(['a', 'c']);
    });

    it('events logged on a test date are never pushed, even after signing in again', () => {
        const kept = keepOnDevice(SIGNED_OUT, ['c' as EventId]);
        const again = signedIn(signedOut(signedIn(kept, 'me@example.com', 1)), 'me@example.com', 1);
        expect(ids(pendingEvents(log, again))).toEqual(['a', 'b']);
    });

    it('after "Delete everything" the device starts over at the new generation, still signed in', () => {
        const before = confirm(signedIn(SIGNED_OUT, 'me@example.com', 1), ['a' as EventId], 9);
        const after = startOver(before, 2);
        expect(after).toMatchObject({
            account: { email: 'me@example.com' },
            generation: 2,
            cursor: 0,
        });
        expect(after.confirmed.size).toBe(0);
    });

    it('signing out forgets the account and what the server had', () => {
        const state = signedOut(
            confirm(signedIn(SIGNED_OUT, 'me@example.com', 1), ['a' as EventId]),
        );
        expect(state.account).toBeUndefined();
        expect(state.confirmed.size).toBe(0);
    });
});
