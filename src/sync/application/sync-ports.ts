import { Language } from '@shared/domain/language';
import { DomainEvent } from '@shared/domain/event';
import { SyncState } from '@sync/domain/sync-state';

/**
 * Every way a request to the sync server can end. The service decides what each means for the
 * user; the infrastructure only translates HTTP into these.
 *
 * - `deleted`: the cloud copy was deleted (from another device) since this device's generation.
 *   It carries the generation to start over from.
 * - `signed-out`: the server does not recognise this device's sign-in any more.
 * - `offline`: no answer at all.
 * - `failed`: an answer, but an error.
 */
export type RemoteAnswer<T> =
    | { readonly kind: 'ok'; readonly value: T }
    | { readonly kind: 'deleted'; readonly generation: number }
    | { readonly kind: 'signed-out' }
    | { readonly kind: 'offline' }
    | { readonly kind: 'failed' };

export interface PulledPage {
    /** Unchecked: whatever the server holds. The service validates each before merging. */
    readonly events: readonly unknown[];
    readonly cursor: number;
    readonly more: boolean;
}

/** Port: the sync server (`/api/sync/`, see `reminder-server/cloudsync`). */
export abstract class SyncRemote {
    /** Exchanges a Google ID token for a session; answers the account's generation. */
    abstract signIn(credential: string): Promise<RemoteAnswer<number>>;
    abstract signOut(): Promise<void>;
    abstract push(generation: number, events: readonly DomainEvent[]): Promise<RemoteAnswer<void>>;
    abstract pull(generation: number, after: number): Promise<RemoteAnswer<PulledPage>>;
    /** Deletes the cloud copy; answers the new generation. */
    abstract deleteEverything(): Promise<RemoteAnswer<number>>;
}

/** Port: where this device keeps its `SyncState` between runs. */
export abstract class SyncStateStore {
    abstract load(): Promise<SyncState>;
    abstract save(state: SyncState): Promise<void>;
}

/** Port: Google's "Sign in with Google" button. */
export abstract class GoogleSignIn {
    /**
     * Draws Google's button into `host`. When the user signs in, `onCredential` receives the ID
     * token. Answers false when Google's script could not be loaded (offline, or blocked).
     */
    abstract renderButton(
        host: HTMLElement,
        language: Language,
        onCredential: (credential: string) => void,
    ): Promise<boolean>;
}
