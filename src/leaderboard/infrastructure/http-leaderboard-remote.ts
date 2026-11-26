import { LeaderboardEntry } from '@leaderboard/domain/leaderboard';
import {
    Board,
    LeaderboardAnswer,
    LeaderboardRemote,
} from '@leaderboard/application/leaderboard-ports';

/**
 * Under /api/sync/ on purpose: the sync session cookie is sent only there, and the leaderboard
 * shares that sign-in (see `reminder-server/leaderboard`).
 */
const BASE = '/api/sync/leaderboard';

/** Talks to the leaderboard routes over `fetch`, like `HttpSyncRemote` does for sync. */
export class HttpLeaderboardRemote extends LeaderboardRemote {
    override async board(): Promise<LeaderboardAnswer<Board>> {
        const answer = await request('GET', '');
        if (answer.kind !== 'ok') {
            return answer;
        }
        const body = answer.value;
        if (
            !isRecord(body) ||
            typeof body['joined'] !== 'boolean' ||
            !Array.isArray(body['entries'])
        ) {
            return { kind: 'failed' };
        }
        // The server is ours, but its answer is still outside data: keep only well-formed rows.
        const entries = (body['entries'] as unknown[]).filter(isEntry);
        return { kind: 'ok', value: { joined: body['joined'], entries } };
    }

    override async join(credential: string, xp: number): Promise<LeaderboardAnswer<void>> {
        return done(await request('PUT', '/me', { credential, xp }));
    }

    override async reportXp(xp: number): Promise<LeaderboardAnswer<void>> {
        return done(await request('PUT', '/me/xp', { xp }));
    }

    override async leave(): Promise<LeaderboardAnswer<void>> {
        return done(await request('DELETE', '/me'));
    }
}

export function done(answer: LeaderboardAnswer<unknown>): LeaderboardAnswer<void> {
    return answer.kind === 'ok' ? { kind: 'ok', value: undefined } : answer;
}

/** One request, with every HTTP outcome translated into a `LeaderboardAnswer`. */
export async function request(
    method: string,
    path: string,
    body?: unknown,
): Promise<LeaderboardAnswer<unknown>> {
    let response: Response;
    try {
        response = await fetch(BASE + path, {
            method,
            cache: 'no-store',
            ...(body === undefined
                ? {}
                : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        });
    } catch {
        return { kind: 'offline' };
    }
    switch (response.status) {
        case 401:
            // On joining, 401 can also mean Google's token was refused; to the user both mean
            // "sign in again".
            return { kind: 'signed-out' };
        case 403:
            return { kind: 'wrong-account' };
        case 404:
            return { kind: 'not-joined' };
        case 409:
            return { kind: 'too-many' };
        case 410:
            return { kind: 'left' };
        case 502:
        case 504:
            return { kind: 'offline' }; // nginx answering for a service that is down.
    }
    if (!response.ok) {
        return { kind: 'failed' };
    }
    if (response.status === 204) {
        return { kind: 'ok', value: undefined };
    }
    try {
        return { kind: 'ok', value: (await response.json()) as unknown };
    } catch {
        return { kind: 'failed' };
    }
}

export function isEntry(value: unknown): value is LeaderboardEntry {
    return (
        isRecord(value) &&
        typeof value['id'] === 'string' &&
        typeof value['following'] === 'boolean' &&
        typeof value['name'] === 'string' &&
        typeof value['picture'] === 'string' &&
        typeof value['xp'] === 'number' &&
        typeof value['you'] === 'boolean'
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
