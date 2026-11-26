/**
 * Muscle groups are fixed reference data, so their ids are a closed set of string literals.
 * `as const` makes TypeScript infer the exact literal values instead of plain `string`, and
 * `MuscleGroupId` is then derived from the data, so the list and the type can never drift apart.
 *
 * Each name is in every language (a `LocalText`); the screen picks one.
 */
export const MUSCLE_GROUPS = [
    { id: 'chest', name: { en: 'Chest', ru: 'Грудь' }, region: 'push' },
    { id: 'front-delts', name: { en: 'Front delts', ru: 'Передние дельты' }, region: 'push' },
    { id: 'side-delts', name: { en: 'Side delts', ru: 'Средние дельты' }, region: 'push' },
    { id: 'triceps', name: { en: 'Triceps', ru: 'Трицепс' }, region: 'push' },
    { id: 'back', name: { en: 'Back', ru: 'Спина' }, region: 'pull' },
    { id: 'rear-delts', name: { en: 'Rear delts', ru: 'Задние дельты' }, region: 'pull' },
    { id: 'biceps', name: { en: 'Biceps', ru: 'Бицепс' }, region: 'pull' },
    { id: 'forearms', name: { en: 'Forearms', ru: 'Предплечья' }, region: 'pull' },
    { id: 'quads', name: { en: 'Quads', ru: 'Квадрицепс' }, region: 'legs' },
    { id: 'hamstrings', name: { en: 'Hamstrings', ru: 'Бицепс бедра' }, region: 'legs' },
    { id: 'glutes', name: { en: 'Glutes', ru: 'Ягодицы' }, region: 'legs' },
    { id: 'calves', name: { en: 'Calves', ru: 'Икры' }, region: 'legs' },
    { id: 'abs', name: { en: 'Abs', ru: 'Пресс' }, region: 'core' },
    { id: 'obliques', name: { en: 'Obliques', ru: 'Косые мышцы' }, region: 'core' },
    { id: 'lower-back', name: { en: 'Lower back', ru: 'Поясница' }, region: 'core' },
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type MuscleGroupId = MuscleGroup['id'];

/**
 * How strongly an exercise trains a muscle group.
 * `ratio` is above 0 and at most 1; 1 means the muscle is a primary mover.
 * One working set of the exercise counts as `ratio` sets for that muscle group.
 */
export interface MuscleInvolvement {
    readonly muscleGroupId: MuscleGroupId;
    readonly ratio: number;
}
