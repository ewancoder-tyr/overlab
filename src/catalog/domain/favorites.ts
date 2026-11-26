import { DomainEvent, EventContext, byOccurrence, envelope } from '@shared/domain/event';
import { Result, fail, ok } from '@shared/domain/result';
import { Catalog } from './catalog';
import { ExerciseId } from './exercise';

/**
 * The user starred an exercise: it is one of those they actually do, so the Train page offers it.
 *
 * Two small events rather than one "favorites list" preference, because of merging: when two
 * devices each star a different exercise, both stars survive a set union of the logs. A stored
 * list would make the later device overwrite the earlier one.
 */
export interface ExerciseFavorited extends DomainEvent<'ExerciseFavorited'> {
    readonly exerciseId: ExerciseId;
}

/** The user removed the star again. */
export interface ExerciseUnfavorited extends DomainEvent<'ExerciseUnfavorited'> {
    readonly exerciseId: ExerciseId;
}

export type FavoriteEvent = ExerciseFavorited | ExerciseUnfavorited;

/** Type guard that also checks the payload: events may come from an import or another version. */
function isFavoriteEvent(event: DomainEvent): event is FavoriteEvent {
    return (
        (event.type === 'ExerciseFavorited' || event.type === 'ExerciseUnfavorited') &&
        typeof (event as FavoriteEvent).exerciseId === 'string'
    );
}

export function favoriteExercise(
    exerciseId: ExerciseId,
    catalog: Catalog,
    context: EventContext,
): Result<ExerciseFavorited> {
    return catalog.findExercise(exerciseId) === undefined
        ? fail({ en: 'Unknown exercise.', ru: 'Неизвестное упражнение.' })
        : ok({ ...envelope('ExerciseFavorited', 1, context), exerciseId });
}

/**
 * Needs no validation: removing a star that is not there changes nothing, in the same way that
 * voiding a set twice does.
 */
export function unfavoriteExercise(
    exerciseId: ExerciseId,
    context: EventContext,
): ExerciseUnfavorited {
    return { ...envelope('ExerciseUnfavorited', 1, context), exerciseId };
}

/**
 * Projection: the exercises that are favorites now. For each exercise the most recent of its
 * two events decides.
 */
export function favoriteExerciseIds(events: readonly DomainEvent[]): ReadonlySet<ExerciseId> {
    const favorites = new Set<ExerciseId>();
    // Sorted, because the log has no guaranteed order and "most recent" must mean the same on
    // every device.
    for (const event of events.filter(isFavoriteEvent).sort(byOccurrence)) {
        if (event.type === 'ExerciseFavorited') {
            favorites.add(event.exerciseId);
        } else {
            favorites.delete(event.exerciseId);
        }
    }
    return favorites;
}
