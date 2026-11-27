import { ColorSchemeId, DEFAULT_COLOR_SCHEME, isColorSchemeId } from '@shared/domain/color-scheme';
import { DomainEvent, EventContext, byOccurrence, envelope } from '@shared/domain/event';
import { Language, isLanguage } from '@shared/domain/language';
import { Result, fail, ok } from '@shared/domain/result';
import {
    DEFAULT_TRAINING_FOCUS,
    TrainingFocus,
    isTrainingFocus,
} from '@shared/domain/training-focus';
import { Schedule, TimeOfDay, isTimeOfDay, validateSchedule } from '@shared/domain/schedule';

/**
 * What a `PreferenceChanged` event carries: the name of one preference and its new value.
 * A union keyed by `preference`, so that each name is tied to the type of its value.
 */
export type PreferenceChange =
    | { readonly preference: 'gym-schedule'; readonly value: Schedule }
    | { readonly preference: 'reminder-time'; readonly value: TimeOfDay }
    | { readonly preference: 'workout-rotation'; readonly value: number }
    | { readonly preference: 'language'; readonly value: Language }
    | { readonly preference: 'rest-alert'; readonly value: number }
    | { readonly preference: 'switch-rest-alert'; readonly value: number }
    | { readonly preference: 'stall-threshold'; readonly value: number }
    | { readonly preference: 'training-focus'; readonly value: TrainingFocus }
    | { readonly preference: 'volume-target'; readonly value: number }
    | { readonly preference: 'cardio-goal'; readonly value: number }
    | { readonly preference: 'light-set-weight'; readonly value: number }
    | { readonly preference: 'stall-involvement'; readonly value: number }
    | { readonly preference: 'target-window'; readonly value: number }
    | { readonly preference: 'color-scheme'; readonly value: ColorSchemeId }
    | { readonly preference: 'gamification'; readonly value: boolean };

/**
 * The user changed a preference. Preferences are events like everything else, so they are
 * backed up with the log and follow a signed-in user to their other devices.
 * (Whether reminders are switched on is NOT a preference: it belongs to one device.)
 */
export type PreferenceChanged = DomainEvent<'PreferenceChanged'> & PreferenceChange;

/** The current value of every preference. */
export interface Preferences {
    /** Absent until the user has chosen their gym days. */
    readonly gymSchedule?: Schedule;
    readonly reminderTime: TimeOfDay;
    /**
     * How many distinct workouts the user cycles through. 1 repeats the same workout every
     * time; 3 means workouts A, B, C, A, B, C. See "Rotation" in docs/glossary.md.
     */
    readonly workoutRotation: number;
    /** Absent until the user has picked one: the app then follows the browser's language. */
    readonly language?: Language;
    /**
     * After how many seconds of rest the phone buzzes once, or 0 for never. See "Rest Alert" in
     * docs/glossary.md. Rest itself is a training matter; only this number is a preference.
     */
    readonly restAlertSeconds: number;
    /**
     * The same, while anywhere but the exercise of the latest set: rest before moving on to
     * another exercise is longer. See "Switch Rest Alert" in docs/glossary.md.
     */
    readonly switchRestAlertSeconds: number;
    /**
     * After how many sessions in a row without progress an exercise counts as stalled, or 0 for
     * never. See "Stall Threshold" in docs/glossary.md. Stall detection itself is an analytics
     * matter.
     */
    readonly stallThreshold: number;
    /** Lifting, cardio or both. See "Training Focus" in docs/glossary.md. It only hides things. */
    readonly trainingFocus: TrainingFocus;
    /**
     * The weekly minimum of weighted sets per muscle group; the maximum is always double it.
     * See "Volume Target" in docs/glossary.md. One number for every muscle group.
     */
    readonly volumeTargetSets: number;
    /** The weekly minutes of cardio to reach. See "Cardio Goal" in docs/glossary.md. */
    readonly cardioGoalMinutes: number;
    /**
     * What a light set is worth in weekly volume, in percent of a full set. A whole number, so
     * that no float noise is ever stored. See "Light Set Weight" in docs/glossary.md.
     */
    readonly lightSetPercent: number;
    /**
     * How much an exercise must involve a muscle group, in percent, for its stall to mark that
     * muscle group on the Week page: more than this. See "Stall Involvement" in docs/glossary.md.
     */
    readonly stallInvolvementPercent: number;
    /**
     * Over how many days the volume target and the cardio goal are counted: they mean "this
     * many sets (or minutes) per this many days". See "Target Window" in docs/glossary.md.
     */
    readonly targetWindowDays: number;
    /**
     * Dark (the default) or light. See "Color Scheme" in docs/glossary.md. It only changes
     * colours.
     */
    readonly colorScheme: ColorSchemeId;
    /**
     * Whether experience and levels are shown. See "Gamification" in docs/glossary.md. Like the
     * training focus it only hides: experience is derived from the log whether it is on or not.
     */
    readonly gamification: boolean;
}

export const DEFAULT_REMINDER_TIME: TimeOfDay = '15:00';
/** Three workouts in turn is a common way to train (and how the app's author does). */
export const DEFAULT_WORKOUT_ROTATION = 3;
export const MAX_WORKOUT_ROTATION = 10;

/** A minute is a common rest between sets of hypertrophy work. */
export const DEFAULT_REST_ALERT_SECONDS = 60;
/** The rest alert moves in steps of this many seconds: 0:15, 0:30, ... */
export const REST_ALERT_STEP_SECONDS = 15;
export const MAX_REST_ALERT_SECONDS = 300;

/**
 * Moving on to another exercise usually takes a longer rest (and walking to it, and setting it
 * up) than the next set of the same one, so its alert has its own, longer default and range.
 */
export const DEFAULT_SWITCH_REST_ALERT_SECONDS = 180;
export const MAX_SWITCH_REST_ALERT_SECONDS = 600;

/**
 * Three sessions in a row without progress is the common coaching rule of thumb, and it keeps
 * the warning rare enough to mean something.
 */
export const DEFAULT_STALL_THRESHOLD = 3;
/** One bad day is not a stall, so the lowest threshold is two sessions. */
export const MIN_STALL_THRESHOLD = 2;
export const MAX_STALL_THRESHOLD = 10;

/**
 * 10 to 20 sets a week is a common evidence-based range for hypertrophy. Only the minimum is
 * stored: the maximum is always double it, so one number is all there is to choose.
 */
export const DEFAULT_VOLUME_TARGET_SETS = 10;
export const MIN_VOLUME_TARGET_SETS = 4;
export const MAX_VOLUME_TARGET_SETS = 20;

/** 150 minutes a week is the minimum in the common health guidelines. */
export const DEFAULT_CARDIO_GOAL_MINUTES = 150;
export const CARDIO_GOAL_STEP_MINUTES = 15;
export const MIN_CARDIO_GOAL_MINUTES = 30;
export const MAX_CARDIO_GOAL_MINUTES = 600;

/**
 * A light set is real work, but far from failure: half a set is a middle guess, not a measured
 * number, which is why it is a preference. 0 counts light sets like warm-ups, 100 like any set.
 */
export const DEFAULT_LIGHT_SET_PERCENT = 50;
export const LIGHT_SET_PERCENT_STEP = 10;
export const MAX_LIGHT_SET_PERCENT = 100;

/**
 * A stall marks the muscle groups an exercise involves by more than half: those it trains
 * directly (1), not those that only help (0.5, the usual fractional-set weight of a secondary
 * mover). A dip (0.8 chest, 0.8 triceps) marks both. 0 marks every muscle group involved.
 * Below 100, because "more than 100%" would mark nothing; the stall threshold turns it off.
 */
export const DEFAULT_STALL_INVOLVEMENT_PERCENT = 50;
export const STALL_INVOLVEMENT_PERCENT_STEP = 10;
export const MAX_STALL_INVOLVEMENT_PERCENT = 90;

/**
 * A week is how training is usually planned, and the targets' defaults (10 sets, 150 minutes)
 * are weekly numbers. Some plan in longer blocks ("20 sets every two weeks"), hence up to four
 * weeks; below three days a single workout would swing every gauge from under to over.
 */
export const DEFAULT_TARGET_WINDOW_DAYS = 7;
export const MIN_TARGET_WINDOW_DAYS = 3;
export const MAX_TARGET_WINDOW_DAYS = 28;

/** Whole days, 3 to 28. */
export function isTargetWindow(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= MIN_TARGET_WINDOW_DAYS &&
        value <= MAX_TARGET_WINDOW_DAYS
    );
}

/** 0 to 90 percent, a multiple of 10. */
export function isStallInvolvementPercent(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= MAX_STALL_INVOLVEMENT_PERCENT &&
        value % STALL_INVOLVEMENT_PERCENT_STEP === 0
    );
}

/** 0 to 100 percent, a multiple of 10. */
export function isLightSetPercent(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= MAX_LIGHT_SET_PERCENT &&
        value % LIGHT_SET_PERCENT_STEP === 0
    );
}

/** A whole number of weekly sets, 4 to 20. */
export function isVolumeTarget(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= MIN_VOLUME_TARGET_SETS &&
        value <= MAX_VOLUME_TARGET_SETS
    );
}

/** Whole minutes, 30 to 600, a multiple of 15. */
export function isCardioGoal(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= MIN_CARDIO_GOAL_MINUTES &&
        value <= MAX_CARDIO_GOAL_MINUTES &&
        value % CARDIO_GOAL_STEP_MINUTES === 0
    );
}

/** 0 (off), or 2 to 10 sessions. */
export function isStallThreshold(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        (value === 0 || (value >= MIN_STALL_THRESHOLD && value <= MAX_STALL_THRESHOLD))
    );
}

/** 0 (off), or 15 to 300 seconds in steps of 15. */
export function isRestAlert(value: unknown): value is number {
    return isAlertSeconds(value, MAX_REST_ALERT_SECONDS);
}

/** 0 (off), or 15 to 600 seconds in steps of 15. */
export function isSwitchRestAlert(value: unknown): value is number {
    return isAlertSeconds(value, MAX_SWITCH_REST_ALERT_SECONDS);
}

function isAlertSeconds(value: unknown, max: number): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= max &&
        value % REST_ALERT_STEP_SECONDS === 0
    );
}

export function isWorkoutRotation(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= MAX_WORKOUT_ROTATION
    );
}

/** Off until the user asks for it: the app is a tracker first, the game is an extra. */
export const DEFAULT_GAMIFICATION = false;

function changed(change: PreferenceChange, context: EventContext): PreferenceChanged {
    return { ...envelope('PreferenceChanged', 1, context), ...change };
}

export function changeGymSchedule(
    schedule: Schedule,
    context: EventContext,
): Result<PreferenceChanged> {
    const result = validateSchedule(schedule);
    return result.ok
        ? ok(changed({ preference: 'gym-schedule', value: result.value }, context))
        : result;
}

export function changeReminderTime(
    time: TimeOfDay,
    context: EventContext,
): Result<PreferenceChanged> {
    return isTimeOfDay(time)
        ? ok(changed({ preference: 'reminder-time', value: time }, context))
        : fail({
              en: 'The reminder time must look like 15:00.',
              ru: 'Время напоминания должно выглядеть как 15:00.',
          });
}

export function changeWorkoutRotation(
    rotation: number,
    context: EventContext,
): Result<PreferenceChanged> {
    return isWorkoutRotation(rotation)
        ? ok(changed({ preference: 'workout-rotation', value: rotation }, context))
        : fail({
              en: `Rotate between 1 and ${MAX_WORKOUT_ROTATION} workouts.`,
              ru: `Чередовать можно от 1 до ${MAX_WORKOUT_ROTATION} тренировок.`,
          });
}

export function changeRestAlert(seconds: number, context: EventContext): Result<PreferenceChanged> {
    return isRestAlert(seconds)
        ? ok(changed({ preference: 'rest-alert', value: seconds }, context))
        : fail({
              en: 'The rest alert is off, or 0:15 to 5:00 in steps of 15 seconds.',
              ru: 'Сигнал отдыха выключен или от 0:15 до 5:00 с шагом 15 секунд.',
          });
}

export function changeSwitchRestAlert(
    seconds: number,
    context: EventContext,
): Result<PreferenceChanged> {
    return isSwitchRestAlert(seconds)
        ? ok(changed({ preference: 'switch-rest-alert', value: seconds }, context))
        : fail({
              en: 'The alert between exercises is off, or 0:15 to 10:00 in steps of 15 seconds.',
              ru: 'Сигнал между упражнениями выключен или от 0:15 до 10:00 с шагом 15 секунд.',
          });
}

export function changeStallThreshold(
    sessions: number,
    context: EventContext,
): Result<PreferenceChanged> {
    return isStallThreshold(sessions)
        ? ok(changed({ preference: 'stall-threshold', value: sessions }, context))
        : fail({
              en: `The stall warning is off, or after ${MIN_STALL_THRESHOLD} to ${MAX_STALL_THRESHOLD} sessions.`,
              ru: `Предупреждение о застое выключено или срабатывает после ${MIN_STALL_THRESHOLD}–${MAX_STALL_THRESHOLD} тренировок.`,
          });
}

export function changeTrainingFocus(
    focus: TrainingFocus,
    context: EventContext,
): Result<PreferenceChanged> {
    return isTrainingFocus(focus)
        ? ok(changed({ preference: 'training-focus', value: focus }, context))
        : fail({
              en: 'Choose lifting and cardio, lifting only or cardio only.',
              ru: 'Выберите силовые и кардио, только силовые или только кардио.',
          });
}

export function changeVolumeTarget(sets: number, context: EventContext): Result<PreferenceChanged> {
    return isVolumeTarget(sets)
        ? ok(changed({ preference: 'volume-target', value: sets }, context))
        : fail({
              en: `The volume target is ${MIN_VOLUME_TARGET_SETS} to ${MAX_VOLUME_TARGET_SETS} sets per muscle group.`,
              ru: `Цель по объёму — от ${MIN_VOLUME_TARGET_SETS} до ${MAX_VOLUME_TARGET_SETS} подходов на мышцу.`,
          });
}

export function changeCardioGoal(
    minutes: number,
    context: EventContext,
): Result<PreferenceChanged> {
    return isCardioGoal(minutes)
        ? ok(changed({ preference: 'cardio-goal', value: minutes }, context))
        : fail({
              en: `The cardio goal is ${MIN_CARDIO_GOAL_MINUTES} to ${MAX_CARDIO_GOAL_MINUTES} minutes, in steps of ${CARDIO_GOAL_STEP_MINUTES}.`,
              ru: `Цель по кардио — от ${MIN_CARDIO_GOAL_MINUTES} до ${MAX_CARDIO_GOAL_MINUTES} минут с шагом ${CARDIO_GOAL_STEP_MINUTES}.`,
          });
}

export function changeLightSetPercent(
    percent: number,
    context: EventContext,
): Result<PreferenceChanged> {
    return isLightSetPercent(percent)
        ? ok(changed({ preference: 'light-set-weight', value: percent }, context))
        : fail({
              en: `A light set is worth 0 to ${MAX_LIGHT_SET_PERCENT}% of a set, in steps of ${LIGHT_SET_PERCENT_STEP}.`,
              ru: `Лёгкий подход стоит от 0 до ${MAX_LIGHT_SET_PERCENT}% подхода с шагом ${LIGHT_SET_PERCENT_STEP}.`,
          });
}

export function changeStallInvolvementPercent(
    percent: number,
    context: EventContext,
): Result<PreferenceChanged> {
    return isStallInvolvementPercent(percent)
        ? ok(changed({ preference: 'stall-involvement', value: percent }, context))
        : fail({
              en: `A stall marks muscle groups involved by more than 0 to ${MAX_STALL_INVOLVEMENT_PERCENT}%, in steps of ${STALL_INVOLVEMENT_PERCENT_STEP}.`,
              ru: `Застой отмечает мышцы с участием больше 0–${MAX_STALL_INVOLVEMENT_PERCENT}% с шагом ${STALL_INVOLVEMENT_PERCENT_STEP}.`,
          });
}

export function changeTargetWindow(days: number, context: EventContext): Result<PreferenceChanged> {
    return isTargetWindow(days)
        ? ok(changed({ preference: 'target-window', value: days }, context))
        : fail({
              en: `The targets are counted over ${MIN_TARGET_WINDOW_DAYS} to ${MAX_TARGET_WINDOW_DAYS} days.`,
              ru: `Цели считаются за ${MIN_TARGET_WINDOW_DAYS}–${MAX_TARGET_WINDOW_DAYS} дней.`,
          });
}

export function changeColorScheme(
    scheme: ColorSchemeId,
    context: EventContext,
): Result<PreferenceChanged> {
    return isColorSchemeId(scheme)
        ? ok(changed({ preference: 'color-scheme', value: scheme }, context))
        : fail({
              en: 'Choose the dark or the light colour scheme.',
              ru: 'Выберите тёмную или светлую тему.',
          });
}

export function changeGamification(on: boolean, context: EventContext): Result<PreferenceChanged> {
    return typeof on === 'boolean'
        ? ok(changed({ preference: 'gamification', value: on }, context))
        : fail({
              en: 'Experience and levels are either on or off.',
              ru: 'Опыт и уровни либо включены, либо выключены.',
          });
}

export function changeLanguage(
    language: Language,
    context: EventContext,
): Result<PreferenceChanged> {
    return isLanguage(language)
        ? ok(changed({ preference: 'language', value: language }, context))
        : fail({
              en: 'OverLab does not speak that language.',
              ru: 'OverLab не знает этого языка.',
          });
}

/**
 * Projection: the current preferences. For each preference the most recent change wins.
 *
 * It is a tolerant reader: events of other types, preferences this version does not know and
 * values that do not validate (from an import, or a newer app version) are skipped.
 */
export function currentPreferences(events: readonly DomainEvent[]): Preferences {
    let gymSchedule: Schedule | undefined;
    let reminderTime = DEFAULT_REMINDER_TIME;
    let workoutRotation = DEFAULT_WORKOUT_ROTATION;
    let language: Language | undefined;
    let restAlertSeconds = DEFAULT_REST_ALERT_SECONDS;
    let switchRestAlertSeconds = DEFAULT_SWITCH_REST_ALERT_SECONDS;
    let stallThreshold = DEFAULT_STALL_THRESHOLD;
    let trainingFocus = DEFAULT_TRAINING_FOCUS;
    let volumeTargetSets = DEFAULT_VOLUME_TARGET_SETS;
    let cardioGoalMinutes = DEFAULT_CARDIO_GOAL_MINUTES;
    let lightSetPercent = DEFAULT_LIGHT_SET_PERCENT;
    let stallInvolvementPercent = DEFAULT_STALL_INVOLVEMENT_PERCENT;
    let targetWindowDays = DEFAULT_TARGET_WINDOW_DAYS;
    let colorScheme = DEFAULT_COLOR_SCHEME;
    let gamification = DEFAULT_GAMIFICATION;

    const changes = events.filter((event) => event.type === 'PreferenceChanged');
    // Sorted, because the log has no guaranteed order and "most recent" must mean the same
    // on every device.
    for (const event of changes.toSorted(byOccurrence)) {
        // The envelope was checked on the way in; the payload is still unknown at this point.
        const { preference, value } = event as Partial<PreferenceChanged>;
        if (preference === 'gym-schedule' && typeof value === 'object') {
            const result = validateSchedule(value);
            if (result.ok) {
                gymSchedule = result.value;
            }
        } else if (preference === 'reminder-time' && isTimeOfDay(value)) {
            reminderTime = value;
        } else if (preference === 'workout-rotation' && isWorkoutRotation(value)) {
            workoutRotation = value;
        } else if (preference === 'language' && isLanguage(value)) {
            language = value;
        } else if (preference === 'rest-alert' && isRestAlert(value)) {
            restAlertSeconds = value;
        } else if (preference === 'switch-rest-alert' && isSwitchRestAlert(value)) {
            switchRestAlertSeconds = value;
        } else if (preference === 'stall-threshold' && isStallThreshold(value)) {
            stallThreshold = value;
        } else if (preference === 'training-focus' && isTrainingFocus(value)) {
            trainingFocus = value;
        } else if (preference === 'volume-target' && isVolumeTarget(value)) {
            volumeTargetSets = value;
        } else if (preference === 'cardio-goal' && isCardioGoal(value)) {
            cardioGoalMinutes = value;
        } else if (preference === 'light-set-weight' && isLightSetPercent(value)) {
            lightSetPercent = value;
        } else if (preference === 'stall-involvement' && isStallInvolvementPercent(value)) {
            stallInvolvementPercent = value;
        } else if (preference === 'target-window' && isTargetWindow(value)) {
            targetWindowDays = value;
        } else if (preference === 'color-scheme' && isColorSchemeId(value)) {
            colorScheme = value;
        } else if (preference === 'gamification' && typeof value === 'boolean') {
            gamification = value;
        }
    }
    return {
        ...(gymSchedule === undefined ? {} : { gymSchedule }),
        reminderTime,
        workoutRotation,
        ...(language === undefined ? {} : { language }),
        restAlertSeconds,
        switchRestAlertSeconds,
        stallThreshold,
        trainingFocus,
        volumeTargetSets,
        cardioGoalMinutes,
        lightSetPercent,
        stallInvolvementPercent,
        targetWindowDays,
        colorScheme,
        gamification,
    };
}
