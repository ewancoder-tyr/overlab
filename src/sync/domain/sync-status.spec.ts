import { describe, expect, it } from 'vitest';
import { SIGNED_OUT, signedIn } from './sync-state';
import { syncStatus } from './sync-status';

const signed = signedIn(SIGNED_OUT, 'me@example.com', 1);
const at = new Date('2026-11-12T10:00:00Z');

describe('sync status', () => {
    it('is signed out without an account, whatever is pending', () => {
        expect(syncStatus(SIGNED_OUT, 5, 'offline', undefined)).toEqual({ kind: 'signed-out' });
    });

    it('says "backed up" only when nothing is pending', () => {
        expect(syncStatus(signed, 0, 'idle', at)).toEqual({ kind: 'backed-up', at });
        expect(syncStatus(signed, 0, 'offline', at).kind).toBe('backed-up');
        expect(syncStatus(signed, 1, 'idle', at)).toEqual({
            kind: 'waiting',
            pending: 1,
            reason: 'syncing',
        });
    });

    it('tells why pending events have not gone up', () => {
        expect(syncStatus(signed, 3, 'offline', at)).toMatchObject({ reason: 'offline' });
        expect(syncStatus(signed, 3, 'paused', at)).toMatchObject({ reason: 'paused' });
    });

    it('an expired sign-in is shown even with nothing pending, so the user signs in again', () => {
        expect(syncStatus(signed, 0, 'expired', at)).toMatchObject({
            kind: 'waiting',
            reason: 'expired',
        });
    });
});
