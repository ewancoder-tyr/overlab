import { IsoDateTime } from '@shared/domain/event';
import { CardioTotals, cardioTotals } from '@training/domain/cardio';
import { CardioSession } from '@training/domain/workout';

/**
 * Something two cardio sessions can be compared on. More is better on every axis.
 * - `speed` is distance per time and `burn-rate` is calories per time: both are derived here,
 *   never stored.
 * - `climb` is the metres climbed on an inclined treadmill, also derived (see `cardioTotals`).
 */
export type CardioAxis = 'distance' | 'speed' | 'climb' | 'duration' | 'calories' | 'burn-rate';

export type Direction = 'up' | 'same' | 'down';

export interface AxisResult {
    readonly axis: CardioAxis;
    readonly direction: Direction;
}

/**
 * The verdict on a cardio session against an earlier one.
 * `mixed` is the one lifting does not have: better on one axis and worse on the other (farther
 * but slower). That is a trade, not progress and not a step back.
 */
export type CardioOutcome = Direction | 'mixed';

export interface CardioComparison {
    readonly outcome: CardioOutcome;
    /** The one to three axes the verdict is based on, in the order they are worded. */
    readonly axes: readonly AxisResult[];
}

/**
 * The cardio match rule (see docs/rules/cardio.md, "Cardio match rule"): the aim of a cardio
 * session is to MATCH the one before, at least as far and at least as fast, not to beat it. Nobody
 * runs farther or faster every single time, so matching is already a success; beating it is a
 * bonus, and the records mark the real bests. A trade (farther but slower) is neither reached nor
 * missed.
 */
export function matchedOrBeaten(outcome: CardioOutcome): boolean {
    return outcome === 'up' || outcome === 'same';
}

const direction = (current: number, previous: number): Direction =>
    current > previous ? 'up' : current < previous ? 'down' : 'same';

/**
 * Compares two rates (amount per time) without dividing. `a / ta > b / tb` is the same as
 * `a * tb > b * ta` for positive times, and with whole numbers on both sides that is exact:
 * 5000 m in 1800 s and 5500 m in 1980 s come out as precisely the same speed.
 */
const rateDirection = (
    current: number,
    currentSeconds: number,
    previous: number,
    previousSeconds: number,
): Direction => direction(current * previousSeconds, previous * currentSeconds);

/**
 * The cardio progression rule (see docs/rules/cardio.md, "Cardio progression rule").
 *
 * The two sessions are compared on what BOTH recorded:
 * 1. distance and time: on distance and on speed (and on climb, when both are treadmill
 *    sessions: a third axis, so running the same route steeper is better);
 * 2. distance only: on distance;
 * 3. time and calories (a stair climber has no distance): on calories and on burn rate;
 * 4. time only: on time, longer is better;
 * 5. calories only: on calories.
 *
 * With several axes, a session is better when it is at least as good on all and better on one.
 * Calories stay out of it whenever there is a distance: a machine works them out from distance
 * and time anyway, so they would only add noise to the verdict.
 *
 * Returns `undefined` when the sessions have nothing in common (a distance last time, only
 * calories today): there is no fair comparison, so today is a new baseline.
 */
export function compareCardio(
    current: CardioTotals,
    previous: CardioTotals,
): CardioComparison | undefined {
    const axes = comparedAxes(current, previous);
    if (axes.length === 0) {
        return undefined;
    }

    const up = axes.some((axis) => axis.direction === 'up');
    const down = axes.some((axis) => axis.direction === 'down');
    const outcome: CardioOutcome = up && down ? 'mixed' : up ? 'up' : down ? 'down' : 'same';
    return { outcome, axes };
}

function comparedAxes(current: CardioTotals, previous: CardioTotals): readonly AxisResult[] {
    // Destructuring into locals lets the compiler narrow each value to `number` in the checks
    // below; it cannot do that for a property read twice (`current.calories`).
    const { distanceMeters: distance, durationSeconds: seconds, calories } = current;
    const {
        distanceMeters: lastDistance,
        durationSeconds: lastSeconds,
        calories: lastCalories,
    } = previous;

    if (distance !== undefined && lastDistance !== undefined) {
        const farther: AxisResult = {
            axis: 'distance',
            direction: direction(distance, lastDistance),
        };
        const faster: readonly AxisResult[] =
            seconds !== undefined && lastSeconds !== undefined
                ? [
                      {
                          axis: 'speed',
                          direction: rateDirection(distance, seconds, lastDistance, lastSeconds),
                      },
                  ]
                : [];
        const { climbMeters: climb } = current;
        const { climbMeters: lastClimb } = previous;
        const steeper: readonly AxisResult[] =
            climb !== undefined && lastClimb !== undefined
                ? [{ axis: 'climb', direction: direction(climb, lastClimb) }]
                : [];
        return [farther, ...faster, ...steeper];
    }
    if (seconds !== undefined && lastSeconds !== undefined) {
        return calories !== undefined && lastCalories !== undefined
            ? [
                  { axis: 'calories', direction: direction(calories, lastCalories) },
                  {
                      axis: 'burn-rate',
                      direction: rateDirection(calories, seconds, lastCalories, lastSeconds),
                  },
              ]
            : [{ axis: 'duration', direction: direction(seconds, lastSeconds) }];
    }
    if (calories !== undefined && lastCalories !== undefined) {
        return [{ axis: 'calories', direction: direction(calories, lastCalories) }];
    }
    return [];
}

/** Speed in km/h, when both distance and time are known. Derived for display, never stored. */
export function speedKmh(totals: CardioTotals): number | undefined {
    const { distanceMeters, durationSeconds } = totals;
    return distanceMeters === undefined || durationSeconds === undefined || durationSeconds === 0
        ? undefined
        : (distanceMeters / durationSeconds) * 3.6;
}

/** Today's cardio against last time's, for the logging screen. */
export interface CardioPace {
    /** When the session being compared against started. Absent the first time. */
    readonly previousStartedAt?: IsoDateTime;
    readonly previous?: CardioTotals;
    /** Today's bouts added up. Absent before the first bout. */
    readonly current?: CardioTotals;
    /** Absent before the first bout, the first time ever, and when nothing is comparable. */
    readonly comparison?: CardioComparison;
}

/**
 * Projection: the session in progress against the most recent earlier one. Like lifting, a
 * session is judged as a whole: two runs today are added up before they are compared.
 *
 * @param current - the session in progress, or `undefined` before its first bout.
 * @param earlier - sessions of the same exercise before it, oldest first.
 */
export function cardioPace(
    current: CardioSession | undefined,
    earlier: readonly CardioSession[],
): CardioPace {
    const previousSession = earlier.at(-1);
    const previous =
        previousSession === undefined ? undefined : cardioTotals(previousSession.bouts);
    const today = current === undefined ? undefined : cardioTotals(current.bouts);
    const comparison =
        today === undefined || previous === undefined ? undefined : compareCardio(today, previous);

    // Spread conditionally: with `exactOptionalPropertyTypes` an optional property must be
    // absent rather than explicitly `undefined`.
    return {
        ...(previousSession === undefined
            ? {}
            : { previousStartedAt: previousSession.workoutStartedAt }),
        ...(previous === undefined ? {} : { previous }),
        ...(today === undefined ? {} : { current: today }),
        ...(comparison === undefined ? {} : { comparison }),
    };
}

/** One session of a cardio exercise's history with its verdict against the one before. */
export interface CardioHistoryEntry {
    readonly startedAt: IsoDateTime;
    readonly totals: CardioTotals;
    /** Absent for the first session and for one that is not comparable with its predecessor. */
    readonly comparison?: CardioComparison;
}

/** Projection: every session of one cardio exercise, oldest first, each judged against the last. */
export function cardioHistory(sessions: readonly CardioSession[]): readonly CardioHistoryEntry[] {
    return sessions.map((session, index) => {
        const { previous, current, comparison } = cardioPace(session, sessions.slice(0, index));
        return {
            startedAt: session.workoutStartedAt,
            totals: current ?? previous ?? {},
            ...(comparison === undefined ? {} : { comparison }),
        };
    });
}
