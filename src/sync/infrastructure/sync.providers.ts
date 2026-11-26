import {
    EnvironmentProviders,
    inject,
    makeEnvironmentProviders,
    provideAppInitializer,
} from '@angular/core';
import { GoogleSignIn, SyncRemote, SyncStateStore } from '@sync/application/sync-ports';
import { SyncService } from '@sync/application/sync.service';
import { GoogleIdentitySignIn } from './google-identity-sign-in';
import { HttpSyncRemote } from './http-sync-remote';
import { IndexedDbSyncStateStore } from './indexed-db-sync-state-store';

/** How often to look for other devices' events while the app is on screen. */
const POLL_MS = 30_000;

/**
 * Wires sync to the browser. Called from `app.config.ts`; removing that call (and the `sync`
 * folder) removes sync from the app.
 *
 * Besides binding the ports, it decides WHEN to sync, from browser events: when the network
 * comes back, when the app returns to the screen, and every 30 seconds while it is on screen.
 * Pushing after the user logs something is the service's own job.
 */
export function provideSync(): EnvironmentProviders {
    return makeEnvironmentProviders([
        { provide: SyncRemote, useClass: HttpSyncRemote },
        { provide: SyncStateStore, useClass: IndexedDbSyncStateStore },
        { provide: GoogleSignIn, useClass: GoogleIdentitySignIn },
        provideAppInitializer(() => {
            const sync = inject(SyncService);
            const syncIfVisible = (): void => {
                if (document.visibilityState === 'visible') {
                    void sync.syncNow();
                }
            };
            window.addEventListener('online', syncIfVisible);
            document.addEventListener('visibilitychange', syncIfVisible);
            setInterval(syncIfVisible, POLL_MS);
        }),
    ]);
}
