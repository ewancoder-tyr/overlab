import { DomainEvent, EventId } from '@shared/domain/event';

/** Who this device is signed in as. The email is only for display; the server keys on Google's id. */
export interface SyncAccount {
    readonly email: string;
}

/**
 * What this device remembers about syncing. It is bookkeeping about the log, never part of it:
 * the events themselves stay in the event log, and this only says which of them the server has.
 */
export interface SyncState {
    /** Undefined when signed out. */
    readonly account: SyncAccount | undefined;
    /** The cloud copy's generation this device is in step with. See "Delete everything". */
    readonly generation: number;
    /** The server's sequence number up to which this device has pulled. */
    readonly cursor: number;
    /** Events the server is known to hold: pushed and acknowledged, or pulled from it. */
    readonly confirmed: ReadonlySet<EventId>;
    /** Events that must never leave this device: those logged while a test date was on. */
    readonly localOnly: ReadonlySet<EventId>;
}

export const SIGNED_OUT: SyncState = {
    account: undefined,
    generation: 0,
    cursor: 0,
    confirmed: new Set(),
    localOnly: new Set(),
};

/**
 * A fresh start with an account: nothing confirmed, pull from the beginning. Everything already
 * on the device becomes pending and is pushed, which is how signing in uploads it. What must
 * stay on the device still does.
 */
export function signedIn(state: SyncState, email: string, generation: number): SyncState {
    return { ...SIGNED_OUT, localOnly: state.localOnly, account: { email }, generation };
}

/** Signed out, keeping the device's data (and so what must stay on it). */
export function signedOut(state: SyncState): SyncState {
    return { ...SIGNED_OUT, localOnly: state.localOnly };
}

/**
 * The events to push: everything in the log the server has not confirmed, except the ones that
 * must stay on this device.
 */
export function pendingEvents(
    events: readonly DomainEvent[],
    state: SyncState,
): readonly DomainEvent[] {
    return events.filter(
        (event) => !state.confirmed.has(event.id) && !state.localOnly.has(event.id),
    );
}

/** Records that the server holds these events, and optionally how far this device has pulled. */
export function confirm(
    state: SyncState,
    ids: Iterable<EventId>,
    cursor: number = state.cursor,
): SyncState {
    return { ...state, cursor, confirmed: new Set([...state.confirmed, ...ids]) };
}

/** Marks events that must never be pushed (see `localOnly`). */
export function keepOnDevice(state: SyncState, ids: Iterable<EventId>): SyncState {
    return { ...state, localOnly: new Set([...state.localOnly, ...ids]) };
}

/**
 * After "Delete everything", here or on another device: the copy this device knew is gone, so it
 * starts over at the new generation with an empty log. Still signed in.
 */
export function startOver(state: SyncState, generation: number): SyncState {
    return { ...SIGNED_OUT, account: state.account, generation };
}
