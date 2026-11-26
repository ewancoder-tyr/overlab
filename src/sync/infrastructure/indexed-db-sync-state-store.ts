import { SyncStateStore } from '@sync/application/sync-ports';
import { SIGNED_OUT, SyncState } from '@sync/domain/sync-state';

/*
 * The sync bookkeeping lives in its own IndexedDB database, not beside the events. That keeps
 * the event database untouched by sync (no schema version bump) and makes removing sync a matter
 * of deleting one database.
 */
const DATABASE_NAME = 'overlab-sync';
const STATE = 'state';
/** The whole state is one record: a few thousand ids at most, written only when it changes. */
const KEY = 'current';

export class IndexedDbSyncStateStore extends SyncStateStore {
    private database: Promise<IDBDatabase> | undefined;

    override async load(): Promise<SyncState> {
        try {
            const database = await this.open();
            const request = database.transaction(STATE, 'readonly').objectStore(STATE).get(KEY);
            const stored = await new Promise<unknown>((resolve, reject) => {
                request.onsuccess = () => {
                    resolve(request.result);
                };
                request.onerror = () => {
                    reject(request.error ?? new Error('Could not read the sync state'));
                };
            });
            return isSyncState(stored) ? stored : SIGNED_OUT;
        } catch (error) {
            // Losing the bookkeeping loses no data: signed out, the events are all still here.
            console.error('Could not read the sync state', error);
            return SIGNED_OUT;
        }
    }

    override async save(state: SyncState): Promise<void> {
        const database = await this.open();
        const transaction = database.transaction(STATE, 'readwrite');
        // IndexedDB stores a Set as it is (the "structured clone" of a value), so no conversion.
        transaction.objectStore(STATE).put(state, KEY);
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => {
                resolve();
            };
            transaction.onerror = () => {
                reject(transaction.error ?? new Error('Could not save the sync state'));
            };
        });
    }

    private open(): Promise<IDBDatabase> {
        this.database ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE_NAME, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore(STATE);
            };
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error ?? new Error('Could not open the sync database'));
            };
        });
        return this.database;
    }
}

function isSyncState(value: unknown): value is SyncState {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const state = value as Record<string, unknown>;
    return (
        typeof state['generation'] === 'number' &&
        typeof state['cursor'] === 'number' &&
        state['confirmed'] instanceof Set &&
        state['localOnly'] instanceof Set
    );
}
