import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId, SetupId, isCardio } from '@catalog/domain/exercise';
import { TechniqueId } from '@catalog/domain/technique';
import { Brand } from '@shared/domain/brand';
import { DomainEvent, EventContext, EventId, byOccurrence, envelope } from '@shared/domain/event';
import { LocalText } from '@shared/domain/language';
import { Result, fail, ok } from '@shared/domain/result';

/** A set is identified by the id of the `SetPerformed` event that recorded it. */
export type SetId = EventId & Brand<'SetId'>;

export type LoadUnit = 'kg' | 'lb';

/**
 * The load exactly as the user entered it. We never convert on write, so 22.5 kg stays 22.5 kg
 * and 45 lb stays 45 lb; conversion happens only when two loads need to be compared.
 * For bodyweight exercises the value is the load added to body weight and may be negative.
 */
export interface Load {
    readonly value: number;
    readonly unit: LoadUnit;
}

/** Consecutive reps of one exercise, one technique and one load. */
export interface RepGroup {
    readonly exerciseId: ExerciseId;
    readonly technique: TechniqueId;
    readonly load: Load;
    readonly reps: number;
}

/**
 * How hard the set was. Absent means the usual: close to failure, a rep or so in reserve.
 * `failure`: taken all the way. `light`: deliberately easy, reserve unknown; it still counts, but
 * as half a set in weekly volume. `easy`: far from failure on purpose (morning push-ups, a
 * ramp-up over weeks); worth nothing in weekly volume, yet compared and recorded like any
 * working set. `reps-in-reserve`: stopped with that many left.
 */
export type Effort =
    | { readonly kind: 'failure' }
    | { readonly kind: 'light' }
    | { readonly kind: 'easy' }
    | { readonly kind: 'reps-in-reserve'; readonly repsInReserve: number };

/** Warm-up sets are recorded but excluded from volume and progression. */
export type SetKind = 'working' | 'warmup';

export interface SetPerformed extends DomainEvent<'SetPerformed', SetId> {
    readonly kind: SetKind;
    /** In the order performed. Never empty. */
    readonly repGroups: readonly RepGroup[];
    readonly effort?: Effort;
    /** Absent means the exercise's default (unnamed) setup. */
    readonly setupId?: SetupId;
    /**
     * A standalone set: done outside any workout. It starts no rest and no workout time, and is
     * no part of a workout, the plan or the rotation. Absent (never `false`) means a workout set.
     */
    readonly standalone?: true;
}

export interface SetVoided extends DomainEvent<'SetVoided'> {
    readonly setId: SetId;
}

/*
 * Type guards. `event is SetPerformed` tells the compiler that inside an `if (isSetPerformed(e))`
 * block, `e` has the narrower type. They also check the payload shape, because events can arrive
 * from an import file or from another device running a different app version.
 */
export function isSetPerformed(event: DomainEvent): event is SetPerformed {
    return event.type === 'SetPerformed' && Array.isArray((event as SetPerformed).repGroups);
}

export function isSetVoided(event: DomainEvent): event is SetVoided {
    return event.type === 'SetVoided' && typeof (event as SetVoided).setId === 'string';
}

/** What the user provides when logging a set. */
export interface SetDraft {
    readonly kind: SetKind;
    readonly repGroups: readonly RepGroup[];
    readonly effort?: Effort;
    readonly setupId?: SetupId;
    /** True for a standalone set (see `SetPerformed.standalone`). */
    readonly standalone?: boolean;
    /** Set only when backfilling; defaults to now. */
    readonly occurredAt?: Date;
}

export const MAX_REPS_PER_GROUP = 1000;
export const MAX_LOAD = 2000;
export const MAX_REPS_IN_RESERVE = 10;
/** Tolerance for a device clock that runs slightly ahead when checking "not in the future". */
const CLOCK_TOLERANCE_MS = 60_000;

/**
 * Validates a draft and builds the `SetPerformed` event.
 *
 * This is the write-side gate: the event log is permanent, so nothing invalid may get past here.
 * The read side is deliberately more forgiving (see "Event rules" in docs/architecture.md).
 */
export function performSet(
    draft: SetDraft,
    catalog: Catalog,
    context: EventContext,
): Result<SetPerformed> {
    if (draft.repGroups.length === 0) {
        return fail({
            en: 'A set needs at least one rep.',
            ru: 'В подходе нужен хотя бы один повтор.',
        });
    }

    for (const [index, group] of draft.repGroups.entries()) {
        const error = validateRepGroup(group, catalog);
        if (error !== undefined) {
            // With a single rep group the position adds no information.
            return fail(
                draft.repGroups.length === 1
                    ? error
                    : {
                          en: `Rep group ${index + 1}: ${error.en}`,
                          ru: `Группа повторов ${index + 1}: ${error.ru}`,
                      },
            );
        }
    }

    if (draft.effort?.kind === 'reps-in-reserve') {
        const { repsInReserve } = draft.effort;
        if (
            !Number.isInteger(repsInReserve) ||
            repsInReserve < 0 ||
            repsInReserve > MAX_REPS_IN_RESERVE
        ) {
            return fail({
                en: `Reps in reserve must be a whole number from 0 to ${MAX_REPS_IN_RESERVE}.`,
                ru: `Повторы в запасе: целое число от 0 до ${MAX_REPS_IN_RESERVE}.`,
            });
        }
    }

    const occurredAt = draft.occurredAt ?? context.now;
    if (Number.isNaN(occurredAt.getTime())) {
        return fail({
            en: 'The time of the set is not a valid date.',
            ru: 'Время подхода — не настоящая дата.',
        });
    }
    if (occurredAt.getTime() > context.now.getTime() + CLOCK_TOLERANCE_MS) {
        return fail({
            en: 'A set cannot be performed in the future.',
            ru: 'Подход нельзя выполнить в будущем.',
        });
    }

    return ok({
        ...(envelope('SetPerformed', 1, context, occurredAt) as DomainEvent<'SetPerformed', SetId>),
        kind: draft.kind,
        // Copy each group field by field so that no extra properties from the caller's objects
        // leak into the stored event.
        repGroups: draft.repGroups.map((group) => ({
            exerciseId: group.exerciseId,
            technique: group.technique,
            load: { value: group.load.value, unit: group.load.unit },
            reps: group.reps,
        })),
        ...(draft.effort === undefined ? {} : { effort: draft.effort }),
        ...(draft.setupId === undefined ? {} : { setupId: draft.setupId }),
        // Stored only when true: one shape for a workout set, with or without the field asked.
        ...(draft.standalone === true ? { standalone: true as const } : {}),
    });
}

function validateRepGroup(group: RepGroup, catalog: Catalog): LocalText | undefined {
    const exercise = catalog.findExercise(group.exerciseId);
    if (exercise === undefined) {
        return { en: 'Unknown exercise.', ru: 'Неизвестное упражнение.' };
    }
    // Cardio has its own event (see cardio.ts): reps and load mean nothing for a run.
    if (isCardio(exercise)) {
        return {
            en: `${exercise.name.en} is cardio: log its distance, time or calories instead.`,
            ru: `${exercise.name.ru} — это кардио: запишите дистанцию, время или калории.`,
        };
    }
    if (catalog.findTechnique(group.technique) === undefined) {
        return { en: 'Unknown technique.', ru: 'Неизвестная техника.' };
    }
    if (!Number.isInteger(group.reps) || group.reps < 1 || group.reps > MAX_REPS_PER_GROUP) {
        return {
            en: `Reps must be a whole number from 1 to ${MAX_REPS_PER_GROUP}.`,
            ru: `Повторы: целое число от 1 до ${MAX_REPS_PER_GROUP}.`,
        };
    }
    if (!Number.isFinite(group.load.value) || Math.abs(group.load.value) > MAX_LOAD) {
        return {
            en: `Load must be a number between -${MAX_LOAD} and ${MAX_LOAD}.`,
            ru: `Вес: число от -${MAX_LOAD} до ${MAX_LOAD}.`,
        };
    }
    if (exercise.loadType === 'external' && group.load.value < 0) {
        return {
            en: `${exercise.name.en} cannot have a negative load.`,
            ru: `${exercise.name.ru}: вес не может быть отрицательным.`,
        };
    }
    return undefined;
}

/** Marks a set as a mistake. Voiding is idempotent: voiding twice has the same effect as once. */
export function voidSet(setId: SetId, context: EventContext): SetVoided {
    return { ...envelope('SetVoided', 1, context), setId };
}

/**
 * Projection: all sets that were performed and not voided, in the order they happened.
 * Accepts the whole event log and ignores everything that is not a training event.
 */
export function activeSets(events: readonly DomainEvent[]): readonly SetPerformed[] {
    const voidedIds = new Set(events.filter(isSetVoided).map((event) => event.setId));
    return events
        .filter(isSetPerformed)
        .filter((set) => !voidedIds.has(set.id) && set.repGroups.length > 0)
        .sort(byOccurrence);
}

/** The exercise a set is listed under: that of its first rep group. */
export function primaryExerciseId(set: SetPerformed): ExerciseId | undefined {
    return set.repGroups[0]?.exerciseId;
}

export function totalReps(set: SetPerformed): number {
    return set.repGroups.reduce((sum, group) => sum + group.reps, 0);
}

/** An easy set: a working set done far from failure on purpose. See `Effort`. */
export function isEasy(set: SetPerformed): boolean {
    return set.effort?.kind === 'easy';
}

/**
 * Whether a session is an easy one: it has working sets and every one of them is easy. Such a
 * session aims to match last time, not to beat it, and takes no part in a stall
 * (docs/rules/training.md, "Easy session rule"). One set of real effort makes the whole session a
 * real one.
 */
export function isEasySession(sets: readonly SetPerformed[]): boolean {
    const working = sets.filter((set) => set.kind === 'working');
    return working.length > 0 && working.every(isEasy);
}

/** A standalone set: done outside any workout. See `SetPerformed.standalone`. */
export function isStandalone(set: SetPerformed): boolean {
    return set.standalone === true;
}

/**
 * The sets that make up workouts: every set but the standalone ones. Workouts, the plan, rest
 * and workout time are all derived from these, which is how a standalone set leaves them alone.
 */
export function workoutSets(sets: readonly SetPerformed[]): readonly SetPerformed[] {
    return sets.filter((set) => !isStandalone(set));
}
