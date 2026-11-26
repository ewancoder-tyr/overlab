import { Service, computed, inject, signal } from '@angular/core';
import { BUILT_IN_EXERCISES } from '@catalog/domain/built-in-exercises';
import { createCatalog } from '@catalog/domain/catalog';
import { ExerciseId } from '@catalog/domain/exercise';
import {
    favoriteExercise,
    favoriteExerciseIds,
    unfavoriteExercise,
} from '@catalog/domain/favorites';
import { BUILT_IN_TECHNIQUES } from '@catalog/domain/technique';
import { EventLog } from '@shared/application/event-log.service';
import { Result, ok } from '@shared/domain/result';
import { DEFAULT_TRAINING_FOCUS, TrainingFocus } from '@shared/domain/training-focus';

/**
 * Exposes the catalog to the rest of the app, and which of its exercises the user starred.
 *
 * The catalog is a signal even though its content is static today, so that consumers are already
 * reactive when user-defined exercises (projected from `ExerciseDefined` events) are added.
 */
@Service()
export class CatalogService {
    private readonly log = inject(EventLog);

    private readonly state = signal(createCatalog(BUILT_IN_EXERCISES, BUILT_IN_TECHNIQUES));
    readonly catalog = this.state.asReadonly();

    /** The ids of the exercises the user starred. */
    readonly favorites = computed(() => favoriteExerciseIds(this.log.events()));

    private readonly trainingFocus = signal<TrainingFocus>(DEFAULT_TRAINING_FOCUS);
    /**
     * Lifting, cardio or both: which exercises the lists show (see `isShown`). A preference, so
     * it lives in settings, which the catalog must not know; the shell passes it in
     * (`app.config.ts`). It lives here because the catalog is the lowest context that needs it.
     */
    readonly focus = this.trainingFocus.asReadonly();

    setFocus(focus: TrainingFocus): void {
        this.trainingFocus.set(focus);
    }

    /** Stars an exercise, or removes its star. */
    async setFavorite(exerciseId: ExerciseId, favorite: boolean): Promise<Result<void>> {
        if (!favorite) {
            await this.log.append(unfavoriteExercise(exerciseId, this.log.context()));
            return ok(undefined);
        }
        const result = favoriteExercise(exerciseId, this.catalog(), this.log.context());
        if (!result.ok) {
            return result;
        }
        await this.log.append(result.value);
        return ok(undefined);
    }
}
