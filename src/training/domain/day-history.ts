import { ExerciseId } from '@catalog/domain/exercise';
import { Branded } from '@shared/domain/brand';
import { IsoDateTime } from '@shared/domain/event';
import { CardioPerformed } from './cardio';
import { SetPerformed, isStandalone, primaryExerciseId } from './set';
import { Workout, exercisesOf, standaloneSessions } from './workout';

/**
 * A calendar day in the device's own time zone, as `2026-11-15`. Zero-padded, so two keys
 * compare as plain strings in date order.
 *
 * The rules of the app never use calendar days (the target window is rolling hours, a workout
 * is a 3-hour gap). This is for the History page only: "what did I do on Sunday" is a question
 * about the calendar on the wall.
 */
export type DayKey = Branded<string, 'DayKey'>;

const pad = (value: number): string => String(value).padStart(2, '0');

/** The day a moment falls on, where the device is. */
export function dayKeyOf(moment: Date | IsoDateTime): DayKey {
    const date = typeof moment === 'string' ? new Date(moment) : moment;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as DayKey;
}

/** Noon of the day, local time: safe to format and to step from, whatever daylight saving does. */
export function dateOfDay(day: DayKey): Date {
    const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
    return new Date(year, month - 1, date, 12);
}

/** The day `days` after `day` (before it, when negative). */
export function addDays(day: DayKey, days: number): DayKey {
    const date = dateOfDay(day);
    // `setDate` rolls over months and years by itself: the 31st plus one is the 1st.
    date.setDate(date.getDate() + days);
    return dayKeyOf(date);
}

/** The seven days of the week `day` is in, Monday first. */
export function weekOf(day: DayKey): readonly DayKey[] {
    // `getDay()` counts from Sunday (0); shifted so that Monday is 0 and Sunday 6.
    const sinceMonday = (dateOfDay(day).getDay() + 6) % 7;
    const monday = addDays(day, -sinceMonday);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/**
 * The month `day` is in as rows of seven for a calendar, Monday first. The first and last rows
 * are filled up with `undefined` where the neighbouring months would be.
 */
export function monthOf(day: DayKey): readonly (readonly (DayKey | undefined)[])[] {
    const first = dateOfDay(day);
    first.setDate(1);
    const month = first.getMonth();
    const cells: (DayKey | undefined)[] = Array.from<undefined>({
        length: (first.getDay() + 6) % 7,
    });
    for (const date = first; date.getMonth() === month; date.setDate(date.getDate() + 1)) {
        cells.push(dayKeyOf(date));
    }
    while (cells.length % 7 !== 0) {
        cells.push(undefined);
    }
    return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

/** The same day of the month `months` later (earlier, when negative), or its last day if shorter. */
export function addMonths(day: DayKey, months: number): DayKey {
    const date = dateOfDay(day);
    const dayOfMonth = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    // Day 0 of the next month is the last day of this one: 31 January plus a month is 28 February.
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(dayOfMonth, lastDay));
    return dayKeyOf(date);
}

/** What was done for one exercise in one block: its sets, or for cardio its bouts. */
export interface DayExercise {
    readonly exerciseId: ExerciseId;
    readonly sets: readonly SetPerformed[];
    readonly bouts: readonly CardioPerformed[];
}

/**
 * One stretch of training on a day: a whole workout, or one standalone session (the standalone
 * sets of one exercise less than 3 hours apart, see "Standalone set rule" in
 * docs/rules/training.md).
 */
export interface DayBlock {
    readonly kind: 'workout' | 'standalone';
    readonly startedAt: IsoDateTime;
    readonly endedAt: IsoDateTime;
    /** In the order first performed. A standalone block has exactly one. */
    readonly exercises: readonly DayExercise[];
}

export interface HistoryDay {
    readonly day: DayKey;
    /** In the order started. */
    readonly blocks: readonly DayBlock[];
}

/**
 * Projection: everything logged, day by day, oldest day first. Only days with something on them.
 *
 * A block belongs to the day it started on, whole: a workout that runs past midnight is not cut
 * in two. Within a day the blocks are in the order they started, so morning push-ups come before
 * the evening's workout, and a standalone set done in the middle of a workout is a block of its
 * own right after it.
 *
 * @param workouts - as from `groupIntoWorkouts`, which leaves standalone sets out.
 * @param sets - the active sets; only the standalone ones are read.
 */
export function historyDays(
    workouts: readonly Workout[],
    sets: readonly SetPerformed[],
): readonly HistoryDay[] {
    const blocks: DayBlock[] = workouts.map((workout) => ({
        kind: 'workout',
        startedAt: workout.startedAt,
        endedAt: workout.endedAt,
        exercises: exercisesOf(workout).map((exerciseId) => ({
            exerciseId,
            sets: workout.sets.filter((set) => primaryExerciseId(set) === exerciseId),
            bouts: workout.cardio.filter((bout) => bout.exerciseId === exerciseId),
        })),
    }));

    const standaloneIds = new Set(sets.filter(isStandalone).map(primaryExerciseId));
    for (const exerciseId of standaloneIds) {
        if (exerciseId === undefined) {
            continue;
        }
        for (const session of standaloneSessions(sets, exerciseId)) {
            blocks.push({
                kind: 'standalone',
                startedAt: session.workoutStartedAt,
                endedAt: session.sets.at(-1)?.occurredAt ?? session.workoutStartedAt,
                exercises: [{ exerciseId, sets: session.sets, bouts: [] }],
            });
        }
    }

    // By start, then by exercise for two standalone sessions started at the same instant, so
    // the order never depends on how the events happen to be stored.
    blocks.sort(
        (a, b) =>
            Date.parse(a.startedAt) - Date.parse(b.startedAt) ||
            (a.exercises[0]?.exerciseId ?? '').localeCompare(b.exercises[0]?.exerciseId ?? ''),
    );

    const days = new Map<DayKey, DayBlock[]>();
    for (const block of blocks) {
        const day = dayKeyOf(block.startedAt);
        days.set(day, [...(days.get(day) ?? []), block]);
    }
    // Blocks are in time order, so the map's insertion order is already oldest day first.
    return [...days].map(([day, dayBlocks]) => ({ day, blocks: dayBlocks }));
}

/**
 * The nearest day with something logged before (`-1`) or after (`1`) `day`, which itself may be
 * a rest day. This is what a swipe on the History page moves by: rest days are skipped.
 *
 * @param days - the days with something logged, oldest first.
 */
export function neighbourDay(
    days: readonly DayKey[],
    day: DayKey,
    direction: -1 | 1,
): DayKey | undefined {
    return direction === 1 ? days.find((each) => each > day) : days.findLast((each) => each < day);
}
