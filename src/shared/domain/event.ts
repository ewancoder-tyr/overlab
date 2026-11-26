import { Branded } from './brand';

export type EventId = Branded<string, 'EventId'>;
export type DeviceId = Branded<string, 'DeviceId'>;

/** A point in time as an ISO 8601 UTC string, e.g. `2026-11-11T18:30:00.000Z`. */
export type IsoDateTime = Branded<string, 'IsoDateTime'>;

/**
 * The envelope shared by every event in the system. See docs/architecture.md, "Events".
 *
 * Events are immutable facts: once appended to the log they are never changed or removed.
 *
 * @typeParam TType - the event name as a string literal type, e.g. `'SetPerformed'`. It acts as the
 *   discriminator when narrowing a union of events.
 * @typeParam TId - a more specific id type when other events need to reference this one.
 */
export interface DomainEvent<TType extends string = string, TId extends EventId = EventId> {
    readonly id: TId;
    readonly type: TType;
    /** Schema version of this event type. Bumped only for incompatible changes. */
    readonly version: number;
    /** The device that created the event. Needed to merge logs from several devices. */
    readonly deviceId: DeviceId;
    /** When it happened. Earlier than `recordedAt` when the user backfills a past workout. */
    readonly occurredAt: IsoDateTime;
    /** When it was logged. */
    readonly recordedAt: IsoDateTime;
}

/**
 * Everything an event factory needs from the outside world.
 *
 * Passing this in (instead of calling `new Date()` and `crypto.randomUUID()` inside the domain)
 * keeps factories pure and makes tests deterministic.
 */
export interface EventContext {
    readonly deviceId: DeviceId;
    readonly now: Date;
    /**
     * When the event is really being written down, if that is not `now`: set while the user
     * logs something done earlier, when `now` is that earlier moment. Becomes `recordedAt`.
     */
    readonly recordedAt?: Date;
    readonly newId: () => string;
}

export function toIso(date: Date): IsoDateTime {
    return date.toISOString() as IsoDateTime;
}

/** Builds the envelope part of a new event. `occurredAt` defaults to "now". */
export function envelope<TType extends string>(
    type: TType,
    version: number,
    context: EventContext,
    occurredAt: Date = context.now,
): DomainEvent<TType> {
    return {
        id: context.newId() as EventId,
        type,
        version,
        deviceId: context.deviceId,
        occurredAt: toIso(occurredAt),
        recordedAt: toIso(context.recordedAt ?? context.now),
    };
}

/**
 * Canonical ordering of events: by the time they happened, with the id as a tie-breaker.
 *
 * The tie-breaker makes the order total and identical on every device, no matter in which order
 * the events were stored or synced. ISO 8601 UTC strings sort chronologically as plain strings.
 */
export function byOccurrence(a: DomainEvent, b: DomainEvent): number {
    if (a.occurredAt !== b.occurredAt) {
        return a.occurredAt < b.occurredAt ? -1 : 1;
    }
    if (a.id === b.id) {
        return 0;
    }
    return a.id < b.id ? -1 : 1;
}

/**
 * Minimal structural check used when reading events from outside the app (import, sync).
 * It validates the envelope only; projections are responsible for tolerating unknown payloads.
 */
export function isDomainEvent(value: unknown): value is DomainEvent {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate['id'] === 'string' &&
        typeof candidate['type'] === 'string' &&
        typeof candidate['version'] === 'number' &&
        typeof candidate['deviceId'] === 'string' &&
        typeof candidate['occurredAt'] === 'string' &&
        typeof candidate['recordedAt'] === 'string' &&
        !Number.isNaN(Date.parse(candidate['occurredAt'])) &&
        !Number.isNaN(Date.parse(candidate['recordedAt']))
    );
}

/**
 * Merges events into an existing log as a set union keyed by event id.
 * Returns the merged log and how many events were actually new.
 */
export function mergeEvents(
    existing: readonly DomainEvent[],
    incoming: readonly DomainEvent[],
): { readonly events: readonly DomainEvent[]; readonly added: readonly DomainEvent[] } {
    const knownIds = new Set(existing.map((event) => event.id));
    const added: DomainEvent[] = [];
    for (const event of incoming) {
        if (!knownIds.has(event.id)) {
            knownIds.add(event.id);
            added.push(event);
        }
    }
    return { events: added.length === 0 ? existing : [...existing, ...added], added };
}
