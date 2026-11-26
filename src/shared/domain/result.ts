import { LocalText } from './language';

/**
 * The outcome of an operation that can fail for an expected, domain-level reason
 * (for example "reps must be at least 1").
 *
 * We return a `Result` instead of throwing so that the compiler forces every caller to handle the
 * failure branch. Exceptions stay reserved for genuine bugs and infrastructure failures.
 *
 * This is a "discriminated union": checking `result.ok` narrows the type, so `result.value` is
 * only accessible after you have checked that the operation succeeded.
 *
 * The error is, by default, a sentence for the user in every language. The rule that fails knows
 * best what to say, and the screen that shows it picks the user's language.
 */
export type Result<T, E = LocalText> =
    { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
}

export function fail<E>(error: E): Result<never, E> {
    return { ok: false, error };
}
