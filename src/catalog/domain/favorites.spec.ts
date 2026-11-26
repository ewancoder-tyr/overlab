import { ExerciseId } from '@catalog/domain/exercise';
import { DomainEvent } from '@shared/domain/event';
import { CURL, DEADLIFT, catalog, contextAt } from '../../testing/fixtures';
import {
    ExerciseFavorited,
    favoriteExercise,
    favoriteExerciseIds,
    unfavoriteExercise,
} from './favorites';

function favoritedAt(time: string, exerciseId: ExerciseId): ExerciseFavorited {
    const result = favoriteExercise(exerciseId, catalog, contextAt(time));
    if (!result.ok) {
        throw new Error(`Test fixture is invalid: ${result.error.en}`);
    }
    return result.value;
}

describe('favorites', () => {
    it('start empty', () => {
        expect(favoriteExerciseIds([])).toEqual(new Set());
    });

    it('hold every exercise that was starred', () => {
        const events = [
            favoritedAt('2026-11-10T10:00:00Z', CURL),
            favoritedAt('2026-11-10T10:01:00Z', DEADLIFT),
        ];

        expect(favoriteExerciseIds(events)).toEqual(new Set([CURL, DEADLIFT]));
    });

    it('follow the most recent event of each exercise, whatever the stored order', () => {
        const starred = favoritedAt('2026-11-10T10:00:00Z', CURL);
        const removed = unfavoriteExercise(CURL, contextAt('2026-11-11T10:00:00Z'));
        const starredAgain = favoritedAt('2026-11-12T10:00:00Z', CURL);

        expect(favoriteExerciseIds([removed, starred])).toEqual(new Set());
        expect(favoriteExerciseIds([starredAgain, removed, starred])).toEqual(new Set([CURL]));
    });

    it('refuse to star an exercise the catalog does not know', () => {
        const result = favoriteExercise('no-such' as ExerciseId, catalog, contextAt(new Date()));

        expect(result.ok).toBe(false);
    });

    it('skip other events and favorite events without an exercise id', () => {
        const starred = favoritedAt('2026-11-10T10:00:00Z', CURL);
        const broken = { ...starred, id: 'x1', exerciseId: undefined };
        const other = { ...starred, id: 'x2', type: 'SomethingElse', exerciseId: DEADLIFT };

        const favorites = favoriteExerciseIds([
            starred,
            broken as unknown as DomainEvent,
            other as unknown as DomainEvent,
        ]);

        expect(favorites).toEqual(new Set([CURL]));
    });
});
