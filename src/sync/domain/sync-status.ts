import { SyncState } from './sync-state';

/**
 * How the last attempt to reach the server went.
 *
 * - `idle`: no attempt yet, or the last one worked.
 * - `offline`: the server could not be reached at all (no network, or the request failed).
 * - `expired`: the server no longer recognises this device's sign-in.
 * - `failed`: the server answered with an error.
 * - `paused`: sync is held back on purpose, while a test date is on.
 */
export type SyncConnection = 'idle' | 'syncing' | 'offline' | 'expired' | 'failed' | 'paused';

/** What the status line in Settings tells the user. */
export type SyncStatus =
    | { readonly kind: 'signed-out' }
    /** Nothing pending: everything on this device is in the cloud copy. */
    | { readonly kind: 'backed-up'; readonly at: Date | undefined }
    /** Some events are only on this device so far, and why they have not gone up yet. */
    | {
          readonly kind: 'waiting';
          readonly pending: number;
          readonly reason: Exclude<SyncConnection, 'idle'>;
      };

/**
 * The status is about the user's data, not about the network: "backed up" is a promise that this
 * device holds nothing the cloud copy lacks, so it is only shown when nothing is pending.
 */
export function syncStatus(
    state: SyncState,
    pending: number,
    connection: SyncConnection,
    lastSyncedAt: Date | undefined,
): SyncStatus {
    if (state.account === undefined) {
        return { kind: 'signed-out' };
    }
    if (pending === 0 && connection !== 'expired') {
        return { kind: 'backed-up', at: lastSyncedAt };
    }
    // Pending with nothing wrong means a push is about to happen.
    return { kind: 'waiting', pending, reason: connection === 'idle' ? 'syncing' : connection };
}
