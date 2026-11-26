import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId, isShown } from '@catalog/domain/exercise';
import { TrainingFocus } from '@shared/domain/training-focus';

/** The two lists of the Train page, as exercise ids in the order they are shown. */
export interface TrainList {
    /**
     * The exercises done standalone lately, in catalog order: the habits outside workouts
     * (see `standaloneHabits`). Pinned above the plan.
     */
    readonly standalone: readonly ExerciseId[];
    /**
     * What has been started in the workout in progress, in the order it was started, then the
     * rest of the plan in its order.
     */
    readonly planned: readonly ExerciseId[];
    /** The favorites not listed above, in catalog order, filtered by the focus. */
    readonly favorites: readonly ExerciseId[];
}

/**
 * What the Train page lists.
 *
 * **Started exercises go on top, in the order they were started**, so the list reads as the
 * workout so far followed by what is still to do. That order is also the next plan of this
 * workout: the plan is the exercises of the workout `rotation` back, in the order first done
 * (`plannedExercises`), so doing them in another order today reorders the plan next time.
 *
 * **Standalone habits are pinned on top**, in catalog order so they stay put from day to day.
 * They are listed whatever the focus, like the plan, because they come from what was logged.
 * An exercise may be both a habit and in the plan (push-ups each morning and at the gym): it
 * is then listed twice, once for each history. It is never repeated among the favorites.
 *
 * **Hiding never gets in the way of the plan.** The training focus filters the favorites only:
 * an exercise that is planned, or done in the workout in progress, is always listed. Otherwise
 * someone who trains only cardio could not log a lift that the plan holds, and the plan would
 * look broken.
 */
export function trainList(
    plan: readonly ExerciseId[],
    doneToday: Iterable<ExerciseId>,
    favorites: ReadonlySet<ExerciseId>,
    catalog: Catalog,
    focus: TrainingFocus,
    standalone: Iterable<ExerciseId> = [],
): TrainList {
    // A Set keeps the first position of each id: today's in the order started, then the plan's
    // remaining exercises in the plan's order.
    const planned = [...new Set([...doneToday, ...plan])];
    const habits = new Set(standalone);
    const listed = new Set([...planned, ...habits]);
    return {
        standalone: catalog.exercises
            .filter((exercise) => habits.has(exercise.id))
            .map((exercise) => exercise.id),
        planned,
        favorites: catalog.exercises
            .filter((exercise) => favorites.has(exercise.id) && !listed.has(exercise.id))
            .filter((exercise) => isShown(exercise, focus))
            .map((exercise) => exercise.id),
    };
}
