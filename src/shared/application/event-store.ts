import { InjectionToken } from '@angular/core';
import { DeviceId, DomainEvent } from '@shared/domain/event';

/**
 * Port: where events are persisted. The application layer depends on this abstraction and the
 * infrastructure layer provides the implementation (IndexedDB today).
 *
 * It is an abstract class rather than an interface because TypeScript interfaces do not exist at
 * runtime, while Angular's dependency injection needs a runtime value to use as the lookup key.
 */
export abstract class EventStore {
    abstract loadAll(): Promise<readonly DomainEvent[]>;

    /**
     * Persists events atomically: either all of them are stored or none.
     * Must be idempotent: storing an event whose id already exists is a no-op.
     */
    abstract append(events: readonly DomainEvent[]): Promise<void>;

    /**
     * Erases everything stored on this device. This is not a domain operation (events are never
     * deleted individually); it exists for "start over" and for removing demo data.
     */
    abstract clear(): Promise<void>;
}

/** The random id of this installation. Provided by the infrastructure layer. */
export const DEVICE_ID = new InjectionToken<DeviceId>('DEVICE_ID');
