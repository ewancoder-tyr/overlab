import { Result, fail, ok } from '@shared/domain/result';

/**
 * A calendar date without a time or a time zone, as `YYYY-MM-DD`: "the 12th of November",
 * wherever you are. The days of a schedule are calendar days, so this is the right type for them; a `Date`
 * (a moment in time) would drag time zones into every comparison.
 */
export type LocalDate = string;

/** ISO weekday number: 1 is Monday, 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * On which days something is done: a program's days. Either fixed days of the week, or every
 * N days counted from a start date (every second day is Mon, Wed, Fri, Sun, then Tue, Thu, Sat).
 *
 * The reminder server applies the same rule (reminder-server/schedule.go). Keep the two in step.
 */
export type Schedule =
    | { readonly kind: 'weekdays'; readonly weekdays: readonly Weekday[] }
    | {
          readonly kind: 'interval';
          /** Length of the cycle in days: 2 is every second day. */
          readonly everyDays: number;
          /** A day of the schedule that anchors the cycle. */
          readonly startDate: LocalDate;
      };

export const MAX_EVERY_DAYS = 14;

/** A time of day as `HH:MM` in 24-hour form, e.g. `15:00`. */
export type TimeOfDay = string;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTimeOfDay(value: unknown): value is TimeOfDay {
    return typeof value === 'string' && TIME_PATTERN.test(value);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A local date as a day count, for arithmetic. Parsing `YYYY-MM-DD` on its own gives midnight
 * UTC, where every day is exactly 24 hours long: no daylight saving surprises.
 */
function dayNumber(date: LocalDate): number {
    return Math.round(Date.parse(date) / MS_PER_DAY);
}

export function isLocalDate(value: unknown): value is LocalDate {
    return (
        typeof value === 'string' && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
    );
}

/** The calendar date of a moment, as seen on this device's clock. */
export function toLocalDate(moment: Date): LocalDate {
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
    return new Date((dayNumber(date) + days) * MS_PER_DAY).toISOString().slice(0, 10);
}

export function weekdayOf(date: LocalDate): Weekday {
    // `getUTCDay` has Sunday as 0; ISO has it as 7.
    const day = new Date(dayNumber(date) * MS_PER_DAY).getUTCDay();
    return (day === 0 ? 7 : day) as Weekday;
}

/** Checks a schedule and returns a clean copy (sorted, de-duplicated weekdays). */
export function validateSchedule(schedule: Schedule): Result<Schedule> {
    if (schedule.kind === 'weekdays') {
        const weekdays = [...new Set(schedule.weekdays)].sort((a, b) => a - b);
        if (weekdays.length === 0) {
            return fail({
                en: 'Pick at least one day of the week.',
                ru: 'Выберите хотя бы один день недели.',
            });
        }
        if (weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
            return fail({
                en: 'A weekday must be a number from 1 (Monday) to 7 (Sunday).',
                ru: 'День недели: число от 1 (понедельник) до 7 (воскресенье).',
            });
        }
        return ok({ kind: 'weekdays', weekdays });
    }
    if (
        !Number.isInteger(schedule.everyDays) ||
        schedule.everyDays < 1 ||
        schedule.everyDays > MAX_EVERY_DAYS
    ) {
        return fail({
            en: `The interval must be a whole number of days from 1 to ${MAX_EVERY_DAYS}.`,
            ru: `Интервал: целое число дней от 1 до ${MAX_EVERY_DAYS}.`,
        });
    }
    if (!isLocalDate(schedule.startDate)) {
        return fail({
            en: 'The start date is not a valid date.',
            ru: 'Дата начала — не настоящая дата.',
        });
    }
    return ok({
        kind: 'interval',
        everyDays: schedule.everyDays,
        startDate: schedule.startDate,
    });
}

/** The rule itself: is `date` a day of this schedule? */
export function isScheduledDay(schedule: Schedule, date: LocalDate): boolean {
    if (schedule.kind === 'weekdays') {
        return schedule.weekdays.includes(weekdayOf(date));
    }
    const days = dayNumber(date) - dayNumber(schedule.startDate);
    // Before the start date the schedule has no days yet.
    return days >= 0 && days % schedule.everyDays === 0;
}

/** The next `count` days of the schedule, starting with `from` itself if it is one. */
export function upcomingDays(
    schedule: Schedule,
    from: LocalDate,
    count: number,
): readonly LocalDate[] {
    const days: LocalDate[] = [];
    // The search is bounded so that a malformed schedule can never loop forever.
    for (let offset = 0; days.length < count && offset < 366; offset++) {
        const date = addDays(from, offset);
        if (isScheduledDay(schedule, date)) {
            days.push(date);
        }
    }
    return days;
}
