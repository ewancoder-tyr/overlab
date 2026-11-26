import { LeaderboardEntry } from '@leaderboard/domain/leaderboard';

/**
 * Every way a request to the leaderboard can end. As in sync, the infrastructure only
 * translates HTTP into these; the service decides what each means.
 *
 * - `not-joined`: the account is not on the board (it left, perhaps on another device).
 * - `wrong-account`: the Google account chosen to join is not the one this device syncs with.
 * - `signed-out`: the server does not recognise this device's sign-in.
 * - `too-many`: following one more would pass the limit.
 * - `left`: the row to follow is no longer on the board.
 * - `offline`: no answer at all. `failed`: an answer, but an error.
 */
export type LeaderboardAnswer<T> =
    | { readonly kind: 'ok'; readonly value: T }
    | { readonly kind: 'not-joined' }
    | { readonly kind: 'wrong-account' }
    | { readonly kind: 'signed-out' }
    | { readonly kind: 'too-many' }
    | { readonly kind: 'left' }
    | { readonly kind: 'offline' }
    | { readonly kind: 'failed' };

export interface Board {
    /** Whether this account is on the board. Only then are there any entries. */
    readonly joined: boolean;
    readonly entries: readonly LeaderboardEntry[];
}

/** Port: the leaderboard routes of the server (see `reminder-server/leaderboard`). */
export abstract class LeaderboardRemote {
    abstract board(): Promise<LeaderboardAnswer<Board>>;
    /** Joins with a fresh Google ID token, whose name and picture the server takes. */
    abstract join(credential: string, xp: number): Promise<LeaderboardAnswer<void>>;
    abstract reportXp(xp: number): Promise<LeaderboardAnswer<void>>;
    abstract leave(): Promise<LeaderboardAnswer<void>>;
}

/**
 * The last board fetched, kept on the device only so the page has something to show offline.
 * It is a copy of the server's answer, never a source of truth: not an event, never synced.
 */
export interface CachedBoard {
    /** The account it was fetched for, so another account on this device never sees it. */
    readonly account: string;
    readonly entries: readonly LeaderboardEntry[];
    readonly fetchedAt: string;
}

/** Port: where the last board is kept between runs. */
export abstract class LeaderboardCache {
    abstract load(): CachedBoard | undefined;
    abstract save(board: CachedBoard | undefined): void;
}
