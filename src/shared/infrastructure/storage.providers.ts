import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { DEVICE_ID, EventStore } from '@shared/application/event-store';
import { DeviceId } from '@shared/domain/event';
import { IndexedDbEventStore } from './indexed-db-event-store';

const DEVICE_ID_KEY = 'overlab:device-id';

/**
 * The device id is created once per installation and kept in localStorage. It is not a secret and
 * not a user id; it only tells devices apart when their logs are merged.
 */
function loadOrCreateDeviceId(): DeviceId {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing !== null) {
        return existing as DeviceId;
    }
    const created = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created as DeviceId;
}

/**
 * Asks the browser to exempt our data from automatic eviction under storage pressure.
 * Installed PWAs are normally granted this. It is best effort: export remains the real backup.
 */
function requestPersistentStorage(): void {
    void navigator.storage.persist().catch(() => undefined);
}

/** Wires the storage ports to their browser implementations. Called from `app.config.ts`. */
export function provideBrowserStorage(): EnvironmentProviders {
    requestPersistentStorage();
    return makeEnvironmentProviders([
        { provide: EventStore, useClass: IndexedDbEventStore },
        { provide: DEVICE_ID, useFactory: loadOrCreateDeviceId },
    ]);
}
