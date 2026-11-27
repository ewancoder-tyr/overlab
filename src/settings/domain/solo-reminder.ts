import { DomainEvent, EventContext, byOccurrence, envelope } from '@shared/domain/event';
import { Result, fail, ok } from '@shared/domain/result';
import {
    LocalDate,
    Schedule,
    TimeOfDay,
    isTimeOfDay,
    validateSchedule,
} from '@shared/domain/schedule';

/**
 * A solo reminder: an alarm for one exercise done outside workouts (push-ups every morning),
 * with its own days and its own time. See "Solo reminder rule" in docs/reminders.md.
 *
 * It is a calendar rule and nothing more. It never looks at the log: nothing is missed, nothing
 * is owed, and whether the exercise was done is the user's own business.
 */
export interface SoloReminder {
    /**
     * The exercise's catalog id. A plain string here, not catalog's `ExerciseId`: the settings
     * context does not know the catalog. The screens only offer exercises that exist.
     */
    readonly exerciseId: string;
    /**
     * The days it rings on. The same shape and rule as the gym schedule (days of the week, or
     * every N days from a start date), but counted on its own: gym days play no part.
     */
    readonly schedule: Schedule;
    readonly time: TimeOfDay;
}

/**
 * The user set, or changed, the solo reminder of an exercise.
 *
 * An event per exercise rather than one "solo reminders" preference holding the whole list,
 * for the same reason as favorites: when two devices each set a reminder for a different
 * exercise, both survive the set union of their logs.
 */
export interface SoloReminderSet extends DomainEvent<'SoloReminderSet'>, SoloReminder {}

/** The user removed the solo reminder of an exercise. */
export interface SoloReminderRemoved extends DomainEvent<'SoloReminderRemoved'> {
    readonly exerciseId: string;
}

/** Each one is a notification of its own, so the list is kept short. */
export const MAX_SOLO_REMINDERS = 10;

/** "In the morning" is what these are mostly for; the user changes it in one tap. */
export const DEFAULT_SOLO_REMINDER_TIME: TimeOfDay = '08:00';

/**
 * The id ends up in the address a tap on the notification opens, so the reminder server accepts
 * only this shape (`soloIDPattern` in `reminder-server/solo.go`). Every catalog id fits.
 */
const EXERCISE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** What a new solo reminder starts as: every day from `today`, in the morning. */
export function defaultSoloReminder(exerciseId: string, today: LocalDate): SoloReminder {
    return {
        exerciseId,
        schedule: { kind: 'interval', everyDays: 1, startDate: today },
        time: DEFAULT_SOLO_REMINDER_TIME,
    };
}

/**
 * Factory: sets the solo reminder of an exercise, replacing the one it had.
 *
 * `current` is the reminders as they are now: an exercise that has none yet is refused once the
 * list is full.
 */
export function setSoloReminder(
    reminder: SoloReminder,
    current: readonly SoloReminder[],
    context: EventContext,
): Result<SoloReminderSet> {
    if (!EXERCISE_ID_PATTERN.test(reminder.exerciseId)) {
        return fail({
            en: 'A solo reminder needs an exercise.',
            ru: 'Соло-напоминанию нужно упражнение.',
        });
    }
    const schedule = validateSchedule(reminder.schedule);
    if (!schedule.ok) {
        return schedule;
    }
    if (!isTimeOfDay(reminder.time)) {
        return fail({
            en: 'The reminder time must look like 08:00.',
            ru: 'Время напоминания должно выглядеть как 08:00.',
        });
    }
    const isNew = current.every((other) => other.exerciseId !== reminder.exerciseId);
    if (isNew && current.length >= MAX_SOLO_REMINDERS) {
        return fail({
            en: `At most ${MAX_SOLO_REMINDERS} solo reminders. Remove one first.`,
            ru: `Не больше ${MAX_SOLO_REMINDERS} соло-напоминаний. Сначала удалите одно.`,
        });
    }
    return ok({
        ...envelope('SoloReminderSet', 1, context),
        exerciseId: reminder.exerciseId,
        schedule: schedule.value,
        time: reminder.time,
    });
}

/** Factory: removes the solo reminder of an exercise. Removing one that is not set is harmless. */
export function removeSoloReminder(exerciseId: string, context: EventContext): SoloReminderRemoved {
    return { ...envelope('SoloReminderRemoved', 1, context), exerciseId };
}

/**
 * Projection: the solo reminders as they are now, earliest in the day first.
 *
 * For each exercise the most recent of its two events decides. A tolerant reader: other events
 * and reminders that do not validate (from an import, or a newer app version) are skipped.
 *
 * Two devices may each fill the list while offline, so after a merge it can hold more than
 * `MAX_SOLO_REMINDERS`. They are all kept and shown; the factory only refuses to add more.
 */
export function currentSoloReminders(events: readonly DomainEvent[]): readonly SoloReminder[] {
    const byExercise = new Map<string, SoloReminder>();
    const mine = events.filter(
        (event) => event.type === 'SoloReminderSet' || event.type === 'SoloReminderRemoved',
    );
    // Sorted, because the log has no guaranteed order and "most recent" must mean the same on
    // every device.
    for (const event of mine.toSorted(byOccurrence)) {
        // The envelope was checked on the way in; the payload is still unknown at this point.
        const { exerciseId, schedule, time } = event as Partial<SoloReminderSet>;
        if (typeof exerciseId !== 'string' || !EXERCISE_ID_PATTERN.test(exerciseId)) {
            continue;
        }
        if (event.type === 'SoloReminderRemoved') {
            byExercise.delete(exerciseId);
            continue;
        }
        if (typeof schedule !== 'object' || !isTimeOfDay(time)) {
            continue;
        }
        const valid = validateSchedule(schedule);
        if (valid.ok) {
            byExercise.set(exerciseId, { exerciseId, schedule: valid.value, time });
        }
    }
    return [...byExercise.values()].toSorted(
        (a, b) => a.time.localeCompare(b.time) || a.exerciseId.localeCompare(b.exerciseId),
    );
}
