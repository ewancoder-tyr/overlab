import { IsoDateTime } from '@shared/domain/event';
import { CardioTotals, cardioTotals } from '@training/domain/cardio';
import { CardioSession } from '@training/domain/workout';
import { compareCardio } from './cardio-progression';

/**
 * Which way a cardio session beat every earlier one (docs/rules/cardio.md, "Cardio records
 * rule"). The counterpart of lifting's weight and rep records:
 * - `distance`, `calories`, `duration`: more than ever (lifting's "heavier than ever").
 * - `climb`: more metres climbed than ever, on a treadmill, when the distance is not a record.
 * - `speed`, `burn-rate`: a better rate than any earlier session that went at least as far or
 *   burned at least as much (lifting's "more reps at this load or heavier").
 */
export type CardioRecordKind =
    'distance' | 'speed' | 'climb' | 'calories' | 'burn-rate' | 'duration';

/** One session of a cardio exercise and what it set. */
export interface CardioRecordEntry {
    readonly startedAt: IsoDateTime;
    readonly totals: CardioTotals;
    /** Nothing earlier to compare with: the first session, or the first with these measures. */
    readonly baseline: boolean;
    /** The record the session set, if it set one. Never on a baseline. */
    readonly record?: CardioRecordKind;
}

/** One line of the cardio record table: a session no other session beats on both of its axes. */
export interface CardioRecordRow {
    readonly startedAt: IsoDateTime;
    /** Only the measures the table is about, so a row reads `5 km · 24:00 · 12.5 km/h`. */
    readonly totals: CardioTotals;
}

/**
 * The two axes a session's own measures are judged on, as in the cardio progression rule: the
 * amount first (distance, calories or time), then the rate when there is one. Calories stay out
 * whenever there is a distance.
 */
interface Axes {
    readonly primary: 'distance' | 'calories' | 'duration';
    readonly secondary?: 'speed' | 'burn-rate';
}

function axesOf(totals: CardioTotals): Axes | undefined {
    const { distanceMeters, durationSeconds, calories } = totals;
    if (distanceMeters !== undefined) {
        return durationSeconds === undefined
            ? { primary: 'distance' }
            : { primary: 'distance', secondary: 'speed' };
    }
    if (durationSeconds !== undefined) {
        return calories === undefined
            ? { primary: 'duration' }
            : { primary: 'calories', secondary: 'burn-rate' };
    }
    return calories === undefined ? undefined : { primary: 'calories' };
}

const amountOf = (totals: CardioTotals, axis: Axes['primary']): number | undefined =>
    axis === 'distance'
        ? totals.distanceMeters
        : axis === 'calories'
          ? totals.calories
          : totals.durationSeconds;

/** The measures of `totals` that `axes` are about, and nothing else. */
function only(totals: CardioTotals, axes: Axes): CardioTotals {
    const { distanceMeters, durationSeconds, calories } = totals;
    const keep = {
        distanceMeters: axes.primary === 'distance',
        durationSeconds: axes.primary === 'duration' || axes.secondary !== undefined,
        calories: axes.primary === 'calories',
    };
    return {
        ...(keep.distanceMeters && distanceMeters !== undefined ? { distanceMeters } : {}),
        ...(keep.durationSeconds && durationSeconds !== undefined ? { durationSeconds } : {}),
        ...(keep.calories && calories !== undefined ? { calories } : {}),
    };
}

/**
 * Projection: every session of one cardio exercise, oldest first, with the record it set.
 *
 * A session is judged as a whole (all its bouts added up), against every earlier session it can
 * be compared with: the cardio progression rule decides, on what both recorded. It is a record
 * when no earlier session is at least as good on every compared axis, which is lifting's
 * "nothing earlier has load ≥ and reps ≥" in cardio terms. So 6 km at a slower pace is a
 * distance record when nobody ran 6 km before, though against last time it is only a trade.
 *
 * - Ties are not records.
 * - A session with nothing earlier to compare with is a baseline and has no record.
 * - The kind: the amount (distance, calories or time) when it is more than in every comparable
 *   earlier session, then the climb when that is, otherwise the rate (speed or burn rate).
 *
 * @param sessions - one cardio exercise's sessions, oldest first.
 */
export function cardioRecords(sessions: readonly CardioSession[]): readonly CardioRecordEntry[] {
    const totals = sessions.map((session) => cardioTotals(session.bouts));
    return sessions.map((session, index): CardioRecordEntry => {
        const today = totals[index] ?? {};
        const comparable = totals.slice(0, index).flatMap((earlier) => {
            const comparison = compareCardio(today, earlier);
            return comparison === undefined ? [] : [{ earlier, comparison }];
        });
        const base = { startedAt: session.workoutStartedAt, totals: today };
        if (comparable.length === 0) {
            return { ...base, baseline: true };
        }
        // An earlier session matches or beats this one unless this one is better on some axis.
        const beatsAll = comparable.every(({ comparison }) =>
            comparison.axes.some((axis) => axis.direction === 'up'),
        );
        const axes = axesOf(today);
        if (!beatsAll || axes === undefined) {
            return { ...base, baseline: false };
        }
        const amount = amountOf(today, axes.primary) ?? 0;
        const moreThanEver = comparable.every(
            ({ earlier }) => amount > (amountOf(earlier, axes.primary) ?? Number.NEGATIVE_INFINITY),
        );
        // A treadmill session that went no farther than ever may still have climbed more than
        // ever: the second amount, before the rate.
        const climb = today.climbMeters;
        const climbedMost =
            climb !== undefined &&
            climb > 0 &&
            comparable.every(({ earlier }) => climb > (earlier.climbMeters ?? 0));
        return {
            ...base,
            baseline: false,
            record: moreThanEver
                ? axes.primary
                : climbedMost
                  ? 'climb'
                  : (axes.secondary ?? axes.primary),
        };
    });
}

/**
 * Compares the rates of two sessions without dividing, so whole numbers stay exact: `a / ta`
 * against `b / tb` is `a * tb` against `b * ta` (see `compareCardio`).
 */
function rateOrder(a: CardioTotals, b: CardioTotals, axes: Axes): number {
    const amountA = amountOf(a, axes.primary) ?? 0;
    const amountB = amountOf(b, axes.primary) ?? 0;
    return amountA * (b.durationSeconds ?? 1) - amountB * (a.durationSeconds ?? 1);
}

/**
 * Projection: the cardio record table, for the measures of the latest session. With distance
 * and time that is the best speed for each distance, keeping only rows that no other session
 * beats on both distance and speed, farthest first:
 *
 *     10 km · 53:34 · 11.2 km/h
 *      5 km · 24:00 · 12.5 km/h
 *
 * With a single measure (only a distance, only a time, only calories) it is one row: the most.
 * Each row is the first session that reached it. Empty until there are two sessions with these
 * measures, because records start from the second session.
 */
export function cardioRecordTable(sessions: readonly CardioSession[]): readonly CardioRecordRow[] {
    const all = sessions.map((session) => ({
        startedAt: session.workoutStartedAt,
        totals: cardioTotals(session.bouts),
    }));
    const latest = all.at(-1);
    const axes = latest === undefined ? undefined : axesOf(latest.totals);
    if (axes === undefined) {
        return [];
    }
    // Sessions that recorded at least the measures the table is about.
    const eligible = all
        .filter(({ totals }) => {
            const own = axesOf(totals);
            return (
                own?.primary === axes.primary && (own.secondary ?? '') === (axes.secondary ?? '')
            );
        })
        .map(({ startedAt, totals }) => ({ startedAt, totals: only(totals, axes) }));
    if (eligible.length < 2) {
        return [];
    }

    // Most first; at an equal amount, best rate first; at a tie, the earliest (a stable sort of
    // sessions that are already oldest first).
    const sorted = eligible.toSorted(
        (a, b) =>
            (amountOf(b.totals, axes.primary) ?? 0) - (amountOf(a.totals, axes.primary) ?? 0) ||
            (axes.secondary === undefined ? 0 : rateOrder(b.totals, a.totals, axes)),
    );
    if (axes.secondary === undefined) {
        return sorted.slice(0, 1);
    }
    // Walking down the amounts, a row stays only when its rate beats every row above it.
    const rows: CardioRecordRow[] = [];
    for (const row of sorted) {
        const above = rows.at(-1);
        if (above === undefined || rateOrder(row.totals, above.totals, axes) > 0) {
            rows.push(row);
        }
    }
    return rows;
}
