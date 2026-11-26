import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId, cardioKindOf } from '@catalog/domain/exercise';
import { DomainEvent } from '@shared/domain/event';
import { activeCardio } from '@training/domain/cardio';
import { DEFAULT_WINDOW_DAYS, windowMs } from './weekly-volume';

/** 150 minutes a week is the minimum in the common health guidelines. */
export const DEFAULT_CARDIO_GOAL_MINUTES = 150;

/**
 * A minimum only. More cardio is not a problem the way too much volume for one muscle is, so
 * there is no "over".
 */
export type CardioGoalStatus = 'under' | 'reached';

/** Where the minutes of bouts of exercises the catalog does not know are counted. */
export const OTHER_CARDIO = 'other';

export interface CardioShare {
    /** The exercise, or `OTHER_CARDIO` for every exercise the catalog does not know. */
    readonly exerciseId: ExerciseId | typeof OTHER_CARDIO;
    readonly seconds: number;
}

export interface WeeklyCardio {
    /** The time of every timed bout in the window, of every cardio exercise. */
    readonly totalSeconds: number;
    readonly goalSeconds: number;
    readonly status: CardioGoalStatus;
    /** Seconds per exercise, largest first, with "other" last. Exercises with 0 s are left out. */
    readonly byExercise: readonly CardioShare[];
    /** Bouts in the window that recorded no time, and so add nothing to the total. */
    readonly untimedBouts: number;
    /**
     * The calories of the bouts that recorded them, a side figure only: never part of the
     * status. Absent when no bout in the window recorded calories.
     */
    readonly calories?: number;
}

/**
 * Projection: the cardio counterpart of weekly volume. The minutes of all cardio over the
 * `windowDays` (the target window) up to `now`, against the goal for that many days.
 *
 * **Time is the one measure every cardio exercise shares.** 10 km on a bike is not 10 km
 * running, and every machine estimates calories its own way, so only time is added up across
 * exercises. Distance is never summed here; it stays per exercise, on that exercise's screens.
 *
 * A bout without a time counts as 0, and is reported in `untimedBouts`: an estimate from
 * distance or calories would make the goal rest on made-up numbers.
 *
 * It takes the whole event log (or any part of it) and reads only cardio bouts, so voided bouts
 * drop out, and the sets logged for cardio on the 0.3.0 day (`SetPerformed`, reps with no unit)
 * are never counted.
 */
export function weeklyCardio(
    events: readonly DomainEvent[],
    catalog: Catalog,
    now: Date,
    goalMinutes: number = DEFAULT_CARDIO_GOAL_MINUTES,
    windowDays: number = DEFAULT_WINDOW_DAYS,
): WeeklyCardio {
    // The same rolling window as weekly volume: one definition of "week" in the app.
    const windowEnd = now.getTime();
    const windowStart = windowEnd - windowMs(windowDays);

    const seconds = new Map<CardioShare['exerciseId'], number>();
    let totalSeconds = 0;
    let untimedBouts = 0;
    let calories: number | undefined;

    for (const bout of activeCardio(events)) {
        const time = Date.parse(bout.occurredAt);
        if (time <= windowStart || time > windowEnd) {
            continue;
        }
        const exercise = catalog.findExercise(bout.exerciseId);
        // A sauna is logged like cardio but is not training: it adds nothing to the goal.
        if (exercise !== undefined && cardioKindOf(exercise) === 'timed') {
            continue;
        }
        if (bout.calories !== undefined) {
            calories = (calories ?? 0) + bout.calories;
        }
        if (bout.durationSeconds === undefined) {
            untimedBouts += 1;
            continue;
        }
        // Readers are tolerant: an unknown exercise still did the work, so its time counts.
        const key = exercise === undefined ? OTHER_CARDIO : bout.exerciseId;
        seconds.set(key, (seconds.get(key) ?? 0) + bout.durationSeconds);
        totalSeconds += bout.durationSeconds;
    }

    const goalSeconds = goalMinutes * 60;
    return {
        totalSeconds,
        goalSeconds,
        // Compared in seconds, so 149:59 against a 150-minute goal is still under.
        status: totalSeconds >= goalSeconds ? 'reached' : 'under',
        byExercise: [...seconds]
            .map(([exerciseId, total]) => ({ exerciseId, seconds: total }))
            .sort(largestFirst),
        untimedBouts,
        ...(calories === undefined ? {} : { calories }),
    };
}

/**
 * Largest first, "other" always last, and ties by id so that every device lists them alike
 * whatever order the events were stored in.
 */
function largestFirst(a: CardioShare, b: CardioShare): number {
    const aOther = a.exerciseId === OTHER_CARDIO;
    const bOther = b.exerciseId === OTHER_CARDIO;
    if (aOther !== bOther) {
        return aOther ? 1 : -1;
    }
    return b.seconds - a.seconds || a.exerciseId.localeCompare(b.exerciseId);
}
