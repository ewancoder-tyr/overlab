/**
 * Reads the email address out of a Google ID token, to show "Signed in as …" and to name the
 * account in the warning before uploading.
 *
 * An ID token is a JWT: three base64url parts separated by dots, the middle one a JSON object of
 * claims. We do NOT check the signature here, and need not: the email is only displayed. The
 * server checks the token before it trusts anything in it.
 */
export function emailInIdToken(token: string): string | undefined {
    const payload = token.split('.')[1];
    if (payload === undefined) {
        return undefined;
    }
    try {
        // base64url uses '-' and '_' where base64 has '+' and '/', and drops the '=' padding,
        // which `atob` tolerates.
        const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        // `atob` returns one character per byte; TextDecoder turns the UTF-8 bytes into text.
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (typeof claims === 'object' && claims !== null && 'email' in claims) {
            return typeof claims.email === 'string' ? claims.email : undefined;
        }
        return undefined;
    } catch {
        return undefined;
    }
}
