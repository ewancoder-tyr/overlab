import { describe, expect, it } from 'vitest';
import { emailInIdToken } from './id-token';

/** A token with the given claims and a fake signature: only the payload is read. */
function token(claims: object): string {
    const json = JSON.stringify(claims);
    const bytes = new TextEncoder().encode(json);
    const base64 = btoa(String.fromCharCode(...bytes));
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `header.${base64url}.signature`;
}

describe('emailInIdToken', () => {
    it('reads the email claim', () => {
        expect(emailInIdToken(token({ sub: '123', email: 'me@example.com' }))).toBe(
            'me@example.com',
        );
    });

    it('reads non-ASCII text in the payload', () => {
        expect(emailInIdToken(token({ email: 'иван@пример.рф' }))).toBe('иван@пример.рф');
    });

    it('answers undefined for anything that is not a token with an email', () => {
        expect(emailInIdToken('not a token')).toBeUndefined();
        expect(emailInIdToken('a.%%%.c')).toBeUndefined();
        expect(emailInIdToken(token({ sub: '123' }))).toBeUndefined();
    });
});
