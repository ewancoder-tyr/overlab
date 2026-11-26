import { DomainEvent } from '@shared/domain/event';
import { PulledPage, RemoteAnswer, SyncRemote } from '@sync/application/sync-ports';

const BASE = '/api/sync';

/**
 * Talks to the sync server (`reminder-server/cloudsync`) over `fetch`.
 *
 * There is no token to attach: the server's session cookie is HttpOnly, so this code cannot even
 * see it, and the browser sends it by itself because the API is on the same origin as the app.
 */
export class HttpSyncRemote extends SyncRemote {
    override async signIn(credential: string): Promise<RemoteAnswer<number>> {
        const answer = await request('POST', '/session', { credential });
        return answer.kind === 'ok' ? readGeneration(answer.value) : answer;
    }

    override async signOut(): Promise<void> {
        await request('DELETE', '/session');
    }

    override async push(
        generation: number,
        events: readonly DomainEvent[],
    ): Promise<RemoteAnswer<void>> {
        const answer = await request('POST', '/events', { generation, events });
        return answer.kind === 'ok' ? { kind: 'ok', value: undefined } : answer;
    }

    override async pull(generation: number, after: number): Promise<RemoteAnswer<PulledPage>> {
        const answer = await request('GET', `/events?generation=${generation}&after=${after}`);
        if (answer.kind !== 'ok') {
            return answer;
        }
        const body = answer.value;
        if (
            isRecord(body) &&
            Array.isArray(body['events']) &&
            typeof body['cursor'] === 'number' &&
            typeof body['more'] === 'boolean'
        ) {
            return {
                kind: 'ok',
                value: {
                    events: body['events'] as unknown[],
                    cursor: body['cursor'],
                    more: body['more'],
                },
            };
        }
        return { kind: 'failed' };
    }

    override async deleteEverything(): Promise<RemoteAnswer<number>> {
        const answer = await request('DELETE', '/account');
        return answer.kind === 'ok' ? readGeneration(answer.value) : answer;
    }
}

/** One request, with every HTTP outcome translated into a `RemoteAnswer`. */
async function request(
    method: string,
    path: string,
    body?: unknown,
): Promise<RemoteAnswer<unknown>> {
    let response: Response;
    try {
        response = await fetch(BASE + path, {
            method,
            // Ask the browser never to answer from its cache: a pull must see the server now.
            cache: 'no-store',
            ...(body === undefined
                ? {}
                : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        });
    } catch {
        // `fetch` rejects only when no answer came at all: no network, or the server is down.
        return { kind: 'offline' };
    }
    if (response.status === 401) {
        return { kind: 'signed-out' };
    }
    if (response.status === 409) {
        // The device's generation is old; the body says which one to start over from.
        const generation = readGeneration(await response.json().catch(() => undefined));
        return generation.kind === 'ok'
            ? { kind: 'deleted', generation: generation.value }
            : { kind: 'failed' };
    }
    if (!response.ok) {
        // 502 and 504 come from nginx when the service is down: as good as offline.
        return response.status === 502 || response.status === 504
            ? { kind: 'offline' }
            : { kind: 'failed' };
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

function readGeneration(body: unknown): RemoteAnswer<number> {
    return isRecord(body) && typeof body['generation'] === 'number'
        ? { kind: 'ok', value: body['generation'] }
        : { kind: 'failed' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
