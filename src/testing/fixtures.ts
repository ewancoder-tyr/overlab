import { BUILT_IN_EXERCISES } from '@catalog/domain/built-in-exercises';
import { Catalog, createCatalog } from '@catalog/domain/catalog';
import { ExerciseId, SetupId } from '@catalog/domain/exercise';
import { BUILT_IN_TECHNIQUES, TechniqueId } from '@catalog/domain/technique';
import { DeviceId, EventContext } from '@shared/domain/event';
import { CardioPerformed, performCardio } from '@training/domain/cardio';
import { Effort, RepGroup, SetKind, SetPerformed, performSet } from '@training/domain/set';

/** Shared helpers for domain tests. Not part of the production bundle. */

export const catalog: Catalog = createCatalog(BUILT_IN_EXERCISES, BUILT_IN_TECHNIQUES);

export const CURL = 'bicep-curl' as ExerciseId;
export const HAMMER_CURL = 'hammer-curl' as ExerciseId;
export const PULL_UP = 'pull-up' as ExerciseId;
export const DEADLIFT = 'deadlift' as ExerciseId;
export const RUNNING = 'running' as ExerciseId;
export const STAIR_CLIMBER = 'stair-climber' as ExerciseId;
export const TREADMILL = 'treadmill' as ExerciseId;
export const SAUNA = 'sauna' as ExerciseId;
export const FULL = 'full' as TechniqueId;
export const PARTIAL = 'long-length-partial' as TechniqueId;

let nextId = 0;

/** A deterministic context: sequential ids and a clock the test controls. */
export function contextAt(now: string | Date): EventContext {
    return {
        deviceId: 'test-device' as DeviceId,
        now: typeof now === 'string' ? new Date(now) : now,
        newId: () => `event-${String(++nextId).padStart(6, '0')}`,
    };
}

export function reps(
    count: number,
    load: number,
    options: { exerciseId?: ExerciseId; technique?: TechniqueId; unit?: 'kg' | 'lb' } = {},
): RepGroup {
    return {
        exerciseId: options.exerciseId ?? CURL,
        technique: options.technique ?? FULL,
        load: { value: load, unit: options.unit ?? 'kg' },
        reps: count,
    };
}

/** Builds a valid `SetPerformed` through the real factory, failing the test if it is rejected. */
export function setAt(
    time: string,
    repGroups: readonly RepGroup[],
    options: { kind?: SetKind; effort?: Effort; setupId?: SetupId; standalone?: boolean } = {},
): SetPerformed {
    const result = performSet(
        { kind: options.kind ?? 'working', repGroups, ...options },
        catalog,
        contextAt(time),
    );
    if (!result.ok) {
        throw new Error(`Test fixture is invalid: ${result.error.en}`);
    }
    return result.value;
}

/**
 * Builds a valid `CardioPerformed` through the real factory. `meters`, `seconds` and `kcal` are
 * each optional, as they are for the user: `cardioAt(T, { meters: 5000, seconds: 1800 })`.
 * `incline` is for a treadmill segment.
 */
export function cardioAt(
    time: string,
    measures: { meters?: number; seconds?: number; kcal?: number; incline?: number },
    exerciseId: ExerciseId = RUNNING,
): CardioPerformed {
    const { meters, seconds, kcal, incline } = measures;
    const result = performCardio(
        {
            exerciseId,
            ...(meters === undefined ? {} : { distance: { value: meters, unit: 'm' as const } }),
            ...(seconds === undefined ? {} : { durationSeconds: seconds }),
            ...(kcal === undefined ? {} : { calories: kcal }),
            ...(incline === undefined ? {} : { incline }),
        },
        catalog,
        contextAt(time),
    );
    if (!result.ok) {
        throw new Error(`Test fixture is invalid: ${result.error.en}`);
    }
    return result.value;
}
