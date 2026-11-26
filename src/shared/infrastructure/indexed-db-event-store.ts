import { EventStore } from '@shared/application/event-store';
import { DomainEvent } from '@shared/domain/event';

const DATABASE_NAME = 'overlab';
const DATABASE_VERSION = 1;
const EVENTS = 'events';

/**
 * Wraps an IndexedDB request in a promise. IndexedDB predates promises and reports results through
 * `onsuccess` / `onerror` callbacks.
 */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onerror = () => {
            reject(request.error ?? new Error('IndexedDB request failed'));
        };
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onerror = () => {
            reject(transaction.error ?? new Error('IndexedDB transaction failed'));
        };
        transaction.onabort = () => {
            reject(transaction.error ?? new Error('IndexedDB transaction was aborted'));
        };
    });
}

/**
 * Stores the event log in IndexedDB, the browser's built-in transactional database.
 *
 * Compared with localStorage it has no practical size limit for our purposes, does not block the
 * UI thread, and its transactions make a multi-event append atomic.
 */
export class IndexedDbEventStore extends EventStore {
    // The connection is opened once, lazily, and shared by all operations.
    private database: Promise<IDBDatabase> | undefined;

    private open(): Promise<IDBDatabase> {
        this.database ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
            // Runs when the database is created or `DATABASE_VERSION` is raised: the only place
            // where the schema (object stores and indexes) may be changed.
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(EVENTS)) {
                    request.result.createObjectStore(EVENTS, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error ?? new Error('Could not open the database'));
            };
        });
        return this.database;
    }

    override async loadAll(): Promise<readonly DomainEvent[]> {
        const database = await this.open();
        const store = database.transaction(EVENTS, 'readonly').objectStore(EVENTS);
        return promisify(store.getAll() as IDBRequest<DomainEvent[]>);
    }

    override async append(events: readonly DomainEvent[]): Promise<void> {
        const database = await this.open();
        const transaction = database.transaction(EVENTS, 'readwrite');
        const store = transaction.objectStore(EVENTS);
        for (const event of events) {
            // `put` overwrites by key, which makes re-appending an existing event a no-op
            // (events are immutable, so the stored value is identical).
            store.put(event);
        }
        await transactionDone(transaction);
    }

    override async clear(): Promise<void> {
        const database = await this.open();
        const transaction = database.transaction(EVENTS, 'readwrite');
        transaction.objectStore(EVENTS).clear();
        await transactionDone(transaction);
    }
}
