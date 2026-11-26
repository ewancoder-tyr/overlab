import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamificationService } from '@gamification/application/gamification.service';
import { LeaderboardEntry } from '@leaderboard/domain/leaderboard';
import { Clock } from '@shared/application/clock.service';
import { SyncService } from '@sync/application/sync.service';
import {
    Board,
    CachedBoard,
    LeaderboardAnswer,
    LeaderboardCache,
    LeaderboardRemote,
} from './leaderboard-ports';
import { LeaderboardService } from './leaderboard.service';

/*
 * The leaderboard against an in-memory stand-in for reminder-server/leaderboard: one row per
 * account, the board only for an account on it, 404 for experience from one that is not.
 */
class FakeServer {
    rows = new Map<string, { name: string; xp: number }>();
    online = true;
    /** Who the device is signed in as, as the session cookie would say. */
    signedInAs = 'me@example.com';
    reports: number[] = [];

    answer<T>(value: () => T | LeaderboardAnswer<T>): LeaderboardAnswer<T> {
        if (!this.online) {
            return { kind: 'offline' };
        }
        const result = value();
        return isAnswer(result) ? result : { kind: 'ok', value: result };
    }
}

function isAnswer<T>(value: unknown): value is LeaderboardAnswer<T> {
    return typeof value === 'object' && value !== null && 'kind' in value;
}

class FakeRemote extends LeaderboardRemote {
    constructor(private readonly server: FakeServer) {
        super();
    }
    override board(): Promise<LeaderboardAnswer<Board>> {
        const server = this.server;
        return Promise.resolve(
            server.answer(() => {
                const joined = server.rows.has(server.signedInAs);
                const entries: LeaderboardEntry[] = joined
                    ? [...server.rows]
                          .sort(([, a], [, b]) => b.xp - a.xp)
                          .map(([sub, row]) => ({
                              id: sub,
                              name: row.name,
                              picture: '',
                              xp: row.xp,
                              you: sub === server.signedInAs,
                              following: false,
                          }))
                    : [];
                return { joined, entries };
            }),
        );
    }
    override join(credential: string, xp: number): Promise<LeaderboardAnswer<void>> {
        const server = this.server;
        return Promise.resolve(
            server.answer((): undefined | LeaderboardAnswer<void> => {
                if (credential !== server.signedInAs) {
                    return { kind: 'wrong-account' };
                }
                server.rows.set(server.signedInAs, { name: 'Me', xp });
                return undefined;
            }),
        );
    }
    override reportXp(xp: number): Promise<LeaderboardAnswer<void>> {
        const server = this.server;
        return Promise.resolve(
            server.answer((): undefined | LeaderboardAnswer<void> => {
                const row = server.rows.get(server.signedInAs);
                if (row === undefined) {
                    return { kind: 'not-joined' };
                }
                row.xp = xp;
                server.reports.push(xp);
                return undefined;
            }),
        );
    }
    override leave(): Promise<LeaderboardAnswer<void>> {
        const server = this.server;
        return Promise.resolve(
            server.answer(() => {
                server.rows.delete(server.signedInAs);
                return undefined;
            }),
        );
    }
}

class MemoryCache extends LeaderboardCache {
    board: CachedBoard | undefined;
    override load(): CachedBoard | undefined {
        return this.board;
    }
    override save(board: CachedBoard | undefined): void {
        this.board = board;
    }
}

interface Device {
    readonly leaderboard: LeaderboardService;
    readonly account: ReturnType<typeof signal<{ email: string } | undefined>>;
    readonly xp: ReturnType<typeof signal<number>>;
    readonly cache: MemoryCache;
}

/** One device, signed in as the server's account unless told otherwise, gamification on. */
function device(server: FakeServer, cache = new MemoryCache()): Device {
    const account = signal<{ email: string } | undefined>({ email: server.signedInAs });
    const xp = signal(0);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        providers: [
            { provide: LeaderboardRemote, useValue: new FakeRemote(server) },
            { provide: LeaderboardCache, useValue: cache },
            // Only the two signals the leaderboard reads from its neighbours.
            { provide: SyncService, useValue: { account } },
            {
                provide: GamificationService,
                useValue: { experience: () => ({ progress: { xp: xp() } }) },
            },
        ],
    });
    const leaderboard = TestBed.inject(LeaderboardService);
    leaderboard.setEnabled(true);
    return { leaderboard, account, xp, cache };
}

/** Runs effects, then lets every pending promise and timer finish. */
async function settle(): Promise<void> {
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(10_000);
}

describe('LeaderboardService', () => {
    let server: FakeServer;

    beforeEach(() => {
        vi.useFakeTimers();
        server = new FakeServer();
        server.rows.set('alice', { name: 'Alice', xp: 900 });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows nothing of the board before joining, as the server shows nothing', async () => {
        const phone = device(server);
        await settle();
        expect(phone.leaderboard.joined()).toBe(false);
        expect(phone.leaderboard.board()).toBeUndefined();
    });

    it('joining puts you on the board with your experience, ranked among the others', async () => {
        const phone = device(server);
        phone.xp.set(1200.7);
        await settle();

        await phone.leaderboard.join('me@example.com');

        expect(server.rows.get('me@example.com')?.xp).toBe(1200);
        const standings = phone.leaderboard.board()?.standings ?? [];
        expect(standings.map((row) => [row.name, row.place, row.you])).toEqual([
            ['Me', 1, true],
            ['Alice', 2, false],
        ]);
    });

    it('refuses a Google account other than the one this device syncs with', async () => {
        const phone = device(server);
        await settle();
        const result = await phone.leaderboard.join('someone-else@example.com');
        expect(result.ok).toBe(false);
        expect(phone.leaderboard.joined()).toBe(false);
    });

    it('reports experience as it grows, once it has settled', async () => {
        const phone = device(server);
        await settle();
        await phone.leaderboard.join('me@example.com');

        phone.xp.set(10);
        TestBed.tick();
        phone.xp.set(22);
        await settle();

        // One report for the burst, not one per set.
        expect(server.reports).toEqual([22]);
    });

    it('does not report while a test date is on', async () => {
        const phone = device(server);
        await settle();
        await phone.leaderboard.join('me@example.com');
        TestBed.inject(Clock).pretendTodayIs('2030-01-01');

        phone.xp.set(5000);
        await settle();

        expect(server.reports).toEqual([]);
    });

    it('turning gamification off takes you off the board', async () => {
        const phone = device(server);
        await settle();
        await phone.leaderboard.join('me@example.com');

        phone.leaderboard.setEnabled(false);
        await settle();

        expect(server.rows.has('me@example.com')).toBe(false);
        expect(phone.cache.board).toBeUndefined();
    });

    it('stops reporting once the account left on another device', async () => {
        const phone = device(server);
        await settle();
        await phone.leaderboard.join('me@example.com');
        server.rows.delete('me@example.com'); // Left elsewhere, or deleted everything.

        phone.xp.set(50);
        await settle();

        expect(phone.leaderboard.joined()).toBe(false);
        expect(server.rows.has('me@example.com')).toBe(false);
    });

    it('offline, shows the last board fetched, from the cache', async () => {
        const first = device(server);
        await settle();
        await first.leaderboard.join('me@example.com');

        server.online = false;
        const restarted = device(server, first.cache);
        await settle();

        expect(restarted.leaderboard.connection()).toBe('offline');
        expect(restarted.leaderboard.board()?.standings.map((row) => row.name)).toEqual([
            'Alice',
            'Me',
        ]);
    });

    it("never shows one account's cached board to another", async () => {
        const first = device(server);
        await settle();
        await first.leaderboard.join('me@example.com');

        server.online = false;
        const other = device(server, first.cache);
        other.account.set({ email: 'other@example.com' });
        await settle();

        expect(other.leaderboard.board()).toBeUndefined();
    });

    it('signed out, there is no leaderboard', async () => {
        const phone = device(server);
        await settle();
        await phone.leaderboard.join('me@example.com');

        phone.account.set(undefined);

        expect(phone.leaderboard.joined()).toBe(false);
        expect(phone.leaderboard.board()).toBeUndefined();
        // The row stays on the server: signing out is not leaving.
        expect(server.rows.has('me@example.com')).toBe(true);
    });
});
