/**
 * What the user trains: lifting and cardio (`both`), or only one of them. A preference that only
 * hides things on screen; it never changes what is logged, counted or synced.
 *
 * It lives in `shared`, like `Language`, because `settings` keeps it (and may import only
 * `shared`) while `catalog` decides with it which exercises are shown.
 */
export const TRAINING_FOCUSES = ['both', 'lifting', 'cardio'] as const;

export type TrainingFocus = (typeof TRAINING_FOCUSES)[number];

export const DEFAULT_TRAINING_FOCUS: TrainingFocus = 'both';

export function isTrainingFocus(value: unknown): value is TrainingFocus {
    return TRAINING_FOCUSES.some((focus) => focus === value);
}

/** Whether the focus includes lifting: the muscle gauges, the volume target, rest. */
export function includesLifting(focus: TrainingFocus): boolean {
    return focus !== 'cardio';
}

/** Whether the focus includes cardio: the weekly cardio card and goal. */
export function includesCardio(focus: TrainingFocus): boolean {
    return focus !== 'lifting';
}
