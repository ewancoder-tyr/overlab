import { CachedBoard, LeaderboardCache } from '@leaderboard/application/leaderboard-ports';
import { isEntry } from './http-leaderboard-remote';

const KEY = 'overlab-leaderboard';

/**
 * Keeps the last board in `localStorage`. It is a cache: small, per device, read synchronously
 * at start-up, and safe to lose (the next fetch refills it). It is deliberately not in the
 * event log or IndexedDB with the user's data, because it is not the user's data.
 *
 * Every access is guarded: storage can be full, blocked, or hold something unreadable, and the
 * leaderboard must never break the app over a cache.
 */
export class LocalStorageLeaderboardCache extends LeaderboardCache {
    override load(): CachedBoard | undefined {
        try {
            const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
            if (
                typeof value === 'object' &&
                value !== null &&
                'account' in value &&
                typeof value.account === 'string' &&
                'fetchedAt' in value &&
                typeof value.fetchedAt === 'string' &&
                'entries' in value &&
                Array.isArray(value.entries) &&
                value.entries.every(isEntry)
            ) {
                return {
                    account: value.account,
                    fetchedAt: value.fetchedAt,
                    entries: value.entries,
                };
            }
        } catch {
            // Unreadable or blocked: as good as empty.
        }
        return undefined;
    }

    override save(board: CachedBoard | undefined): void {
        try {
            if (board === undefined) {
                localStorage.removeItem(KEY);
            } else {
                localStorage.setItem(KEY, JSON.stringify(board));
            }
        } catch {
            // Full or blocked: the board still shows, it just is not kept for offline.
        }
    }
}
