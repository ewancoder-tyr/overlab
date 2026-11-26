import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId, cardioKindOf, isCardio } from '@catalog/domain/exercise';
import { Brand } from '@shared/domain/brand';
import { DomainEvent, EventContext, EventId, byOccurrence, envelope } from '@shared/domain/event';
import { Result, fail, ok } from '@shared/domain/result';

/** A cardio bout is identified by the id of the `CardioPerformed` event that recorded it. */
export type CardioId = EventId & Brand<'CardioId'>;

/** Only metres for now. An imperial unit, when it comes, is one more literal here. */
export type DistanceUnit = 'm';

/**
 * The distance exactly as the user entered it, like `Load`: never converted on write. Conversion
 * happens only when two distances are compared or added (see `toMeters`).
 */
export interface Distance {
    readonly value: number;
    readonly unit: DistanceUnit;
}

/**
 * What can be recorded about a cardio bout. Every field is optional, but at least one must be
 * there: a treadmill shows all three, an outdoor run without a watch only the time.
 *
 * Speed is deliberately absent. It follows from distance and time, and derived values are never
 * stored.
 */
export interface CardioMeasures {
    readonly distance?: Distance;
    /** How long the bout took. */
    readonly durationSeconds?: number;
    /** Calories burned (kcal) as the machine or watch showed them. A fact as entered. */
    readonly calories?: number;
    /**
     * The incline of a treadmill segment, exactly as the machine showed it: 0 for a flat belt,
     * otherwise up to `MAX_INCLINE` in steps of `INCLINE_STEP`. The app reads it as percent
     * grade, which is what treadmills display. Should that reading ever change, only labels
     * (and the climb worked out from it) change: the stored number never does.
     *
     * Present on every treadmill segment, absent on everything else.
     */
    readonly incline?: number;
}

/**
 * One bout of a cardio exercise: a run, a ride. It is its own event rather than a `SetPerformed`
 * because reps, load and technique describe lifting and mean nothing here.
 */
export interface CardioPerformed extends DomainEvent<'CardioPerformed', CardioId>, CardioMeasures {
    readonly exerciseId: ExerciseId;
}

export interface CardioVoided extends DomainEvent<'CardioVoided'> {
    readonly cardioId: CardioId;
}

/* Type guards, tolerant of events from an import file or another app version (see set.ts). */

export function isCardioPerformed(event: DomainEvent): event is CardioPerformed {
    return (
        event.type === 'CardioPerformed' &&
        typeof (event as CardioPerformed).exerciseId === 'string'
    );
}

export function isCardioVoided(event: DomainEvent): event is CardioVoided {
    return event.type === 'CardioVoided' && typeof (event as CardioVoided).cardioId === 'string';
}

/** What the user provides when logging a cardio bout. */
export interface CardioDraft extends CardioMeasures {
    readonly exerciseId: ExerciseId;
    /** Set only when backfilling; defaults to now. */
    readonly occurredAt?: Date;
}

export const MAX_DISTANCE_METERS = 1_000_000;
export const MAX_DURATION_SECONDS = 24 * 60 * 60;
export const MAX_CALORIES = 100_000;
/** Ordinary treadmills stop at 15, incline trainers at 40. */
export const MAX_INCLINE = 40;
export const INCLINE_STEP = 0.5;

/** Tolerance for a device clock that runs slightly ahead when checking "not in the future". */
const CLOCK_TOLERANCE_MS = 60_000;

const METERS_PER_UNIT: Record<DistanceUnit, number> = { m: 1 };

/** A distance in metres, for comparing and adding distances entered in different units. */
export function toMeters(distance: Distance): number {
    return distance.value * METERS_PER_UNIT[distance.unit];
}

/**
 * Validates a draft and builds the `CardioPerformed` event. Like `performSet`, this is the
 * write-side gate: nothing invalid may reach the permanent log.
 *
 * All three numbers are whole (metres, seconds, kcal). That is as precise as a gym machine
 * shows them, and whole numbers compare exactly: no rounding error can turn "the same speed as
 * last time" into "slower".
 */
export function performCardio(
    draft: CardioDraft,
    catalog: Catalog,
    context: EventContext,
): Result<CardioPerformed> {
    const exercise = catalog.findExercise(draft.exerciseId);
    if (exercise === undefined) {
        return fail({ en: 'Unknown exercise.', ru: 'Неизвестное упражнение.' });
    }
    if (!isCardio(exercise)) {
        return fail({
            en: `${exercise.name.en} is logged as sets, not as cardio.`,
            ru: `${exercise.name.ru} записывается подходами, а не как кардио.`,
        });
    }

    const { distance, durationSeconds, calories, incline } = draft;
    const kind = cardioKindOf(exercise);
    if (kind === 'timed') {
        // A sauna has no distance and no calorie counter: its time is all there is.
        if (distance !== undefined || calories !== undefined || durationSeconds === undefined) {
            return fail({
                en: `${exercise.name.en} records only its time.`,
                ru: `${exercise.name.ru}: записывается только время.`,
            });
        }
    }
    if (incline !== undefined && kind !== 'treadmill') {
        return fail({
            en: `${exercise.name.en} has no incline.`,
            ru: `${exercise.name.ru}: наклон не записывается.`,
        });
    }
    // `incline / INCLINE_STEP` is exact for halves, so the check for a whole detent is too.
    if (
        incline !== undefined &&
        !(incline >= 0 && incline <= MAX_INCLINE && Number.isInteger(incline / INCLINE_STEP))
    ) {
        return fail({
            en: `Incline must be from 0 to ${MAX_INCLINE} in steps of ${INCLINE_STEP}.`,
            ru: `Наклон: от 0 до ${MAX_INCLINE} с шагом ${String(INCLINE_STEP).replace('.', ',')}.`,
        });
    }
    if (distance === undefined && durationSeconds === undefined && calories === undefined) {
        return fail({
            en: 'Enter at least one of distance, time or calories.',
            ru: 'Введите хотя бы что-то одно: дистанцию, время или калории.',
        });
    }
    if (distance !== undefined && !isWholeUpTo(distance.value, MAX_DISTANCE_METERS)) {
        return fail({
            en: `Distance must be a whole number of metres from 1 to ${MAX_DISTANCE_METERS}.`,
            ru: `Дистанция: целое число метров от 1 до ${MAX_DISTANCE_METERS}.`,
        });
    }
    if (durationSeconds !== undefined && !isWholeUpTo(durationSeconds, MAX_DURATION_SECONDS)) {
        return fail({
            en: 'Time must be between 1 second and 24 hours.',
            ru: 'Время: от 1 секунды до 24 часов.',
        });
    }
    if (calories !== undefined && !isWholeUpTo(calories, MAX_CALORIES)) {
        return fail({
            en: `Calories must be a whole number from 1 to ${MAX_CALORIES}.`,
            ru: `Калории: целое число от 1 до ${MAX_CALORIES}.`,
        });
    }

    const occurredAt = draft.occurredAt ?? context.now;
    if (Number.isNaN(occurredAt.getTime())) {
        return fail({
            en: 'The time of the cardio is not a valid date.',
            ru: 'Время кардио — не настоящая дата.',
        });
    }
    if (occurredAt.getTime() > context.now.getTime() + CLOCK_TOLERANCE_MS) {
        return fail({
            en: 'Cardio cannot be performed in the future.',
            ru: 'Кардио нельзя выполнить в будущем.',
        });
    }

    return ok({
        ...(envelope('CardioPerformed', 1, context, occurredAt) as DomainEvent<
            'CardioPerformed',
            CardioId
        >),
        exerciseId: draft.exerciseId,
        // Spread conditionally: with `exactOptionalPropertyTypes` an optional property must be
        // absent rather than explicitly `undefined`. An omitted measure is simply not stored.
        ...(distance === undefined
            ? {}
            : { distance: { value: distance.value, unit: distance.unit } }),
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
        ...(calories === undefined ? {} : { calories }),
        // A treadmill segment always says its incline, 0 for flat: that is what lets sessions
        // be compared on climb (see `cardioTotals`).
        ...(kind === 'treadmill' ? { incline: incline ?? 0 } : {}),
    });
}

function isWholeUpTo(value: number, max: number): boolean {
    return Number.isInteger(value) && value >= 1 && value <= max;
}

/** Marks a cardio bout as a mistake. Idempotent, like voiding a set. */
export function voidCardio(cardioId: CardioId, context: EventContext): CardioVoided {
    return { ...envelope('CardioVoided', 1, context), cardioId };
}

/**
 * Projection: all cardio bouts that were performed and not voided, in the order they happened.
 * Accepts the whole event log and ignores everything else.
 */
export function activeCardio(events: readonly DomainEvent[]): readonly CardioPerformed[] {
    const voidedIds = new Set(events.filter(isCardioVoided).map((event) => event.cardioId));
    return events
        .filter(isCardioPerformed)
        .filter((bout) => !voidedIds.has(bout.id))
        .sort(byOccurrence);
}

/**
 * Several bouts added up: a whole cardio session, in plain numbers.
 *
 * A measure is present only when EVERY bout recorded it. Two runs where only one has a distance
 * do not add up to a distance, and pretending they do would make the session look shorter (and
 * slower) than it was.
 */
export interface CardioTotals {
    readonly distanceMeters?: number;
    readonly durationSeconds?: number;
    readonly calories?: number;
    /**
     * Metres climbed: each segment's distance times its incline (read as percent grade), added
     * up. The elevation gain of a hilly run. Present only when every bout recorded both a
     * distance and an incline, so only for treadmill sessions; 0 for one on a flat belt.
     */
    readonly climbMeters?: number;
}

/**
 * The climb of one bout in whole "half-percent metres" (metres x incline detents), which keeps
 * the sum an integer. Dividing once, at the end, means two sessions with the same climb get the
 * very same number however their segments were cut.
 */
function climbUnits(bout: CardioMeasures): number | undefined {
    return bout.distance === undefined || bout.incline === undefined
        ? undefined
        : toMeters(bout.distance) * Math.round(bout.incline / INCLINE_STEP);
}

/** How many `climbUnits` make a metre: a percent is a hundredth, a detent half of that. */
const CLIMB_UNITS_PER_METER = 100 / INCLINE_STEP;

export function cardioTotals(bouts: readonly CardioMeasures[]): CardioTotals {
    // Sums one measure over all bouts, or gives up as soon as a bout lacks it.
    const total = (read: (bout: CardioMeasures) => number | undefined): number | undefined => {
        let sum = 0;
        for (const bout of bouts) {
            const value = read(bout);
            if (value === undefined) {
                return undefined;
            }
            sum += value;
        }
        return bouts.length === 0 ? undefined : sum;
    };

    const distanceMeters = total((bout) =>
        bout.distance === undefined ? undefined : toMeters(bout.distance),
    );
    const durationSeconds = total((bout) => bout.durationSeconds);
    const calories = total((bout) => bout.calories);
    const climb = total(climbUnits);
    return {
        ...(climb === undefined ? {} : { climbMeters: climb / CLIMB_UNITS_PER_METER }),
        ...(distanceMeters === undefined ? {} : { distanceMeters }),
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
        ...(calories === undefined ? {} : { calories }),
    };
}
