import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId, isShown } from '@catalog/domain/exercise';
import { TrainingFocus } from '@shared/domain/training-focus';

/** A program as the Train page needs it: which exercises its shown day lists. */
export interface ListedProgram {
    readonly id: string;
    readonly solo: boolean;
    /** Whether the workout in progress (or about to start) is a day of this program. */
    readonly chosen: boolean;
    /** The exercises of the day shown, in the program's order. */
    readonly exercises: readonly ExerciseId[];
}

/** The lists of the Train page, as exercise ids in the order they are shown. */
export interface TrainList {
    /** The exercises of every solo program, each once: the habits outside workouts. */
    readonly solo: readonly ExerciseId[];
    /** For each regular program, by id, what its card lists. */
    readonly programs: ReadonlyMap<string, readonly ExerciseId[]>;
    /**
     * What was done in the workout in progress when it is no program's day: a workout done on
     * a whim, in the order started.
     */
    readonly thisWorkout: readonly ExerciseId[];
    /** The favorites not listed above, in catalog order, filtered by the focus. */
    readonly favorites: readonly ExerciseId[];
}

/**
 * What the Train page lists.
 *
 * **In the program the workout belongs to, started exercises go on top, in the order they were
 * started**, planned or not, so its list reads as the workout so far followed by what is still
 * to do. Other programs list their day as it is. A workout that is no program's day gets a list
 * of its own, so what was done is always somewhere on the page.
 *
 * **Solo exercises come from the solo programs**, in the programs' order. An exercise may be
 * both solo and in a program day (push-ups each morning and at the gym): it is then listed in
 * both places, once for each history. It is never repeated among the favorites.
 *
 * **Hiding never gets in the way of a program.** The training focus filters the favorites only:
 * an exercise that a program lists, or that was done in the workout in progress, is always
 * shown. Otherwise someone who trains only cardio could not log a lift that their program
 * holds, and the program would look broken.
 */
export function trainList(
    programs: readonly ListedProgram[],
    doneToday: Iterable<ExerciseId>,
    favorites: ReadonlySet<ExerciseId>,
    catalog: Catalog,
    focus: TrainingFocus,
): TrainList {
    const done = [...doneToday];
    const regular = programs.filter((program) => !program.solo);
    // A Set keeps the first position of each id: today's in the order started, then the rest
    // of the day in the program's order.
    const lists = new Map(
        regular.map((program) => [
            program.id,
            program.chosen ? [...new Set([...done, ...program.exercises])] : program.exercises,
        ]),
    );
    const solo = [
        ...new Set(programs.filter((program) => program.solo).flatMap((p) => p.exercises)),
    ];
    const thisWorkout = regular.some((program) => program.chosen) ? [] : done;
    const listed = new Set([...solo, ...thisWorkout, ...[...lists.values()].flat()]);
    return {
        solo,
        programs: lists,
        thisWorkout,
        favorites: catalog.exercises
            .filter((exercise) => favorites.has(exercise.id) && !listed.has(exercise.id))
            .filter((exercise) => isShown(exercise, focus))
            .map((exercise) => exercise.id),
    };
}
