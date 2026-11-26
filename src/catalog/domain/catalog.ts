import { Exercise, ExerciseId } from './exercise';
import { Technique, TechniqueId } from './technique';

/**
 * Read-only view of the catalog that other contexts depend on.
 *
 * Training and analytics receive this as a parameter instead of importing the built-in lists
 * directly, so the same code keeps working once users can define their own exercises.
 */
export interface Catalog {
    readonly exercises: readonly Exercise[];
    /** In progression order, see `BUILT_IN_TECHNIQUES`. */
    readonly techniques: readonly Technique[];
    readonly findExercise: (id: ExerciseId) => Exercise | undefined;
    readonly findTechnique: (id: TechniqueId) => Technique | undefined;
}

export function createCatalog(
    exercises: readonly Exercise[],
    techniques: readonly Technique[],
): Catalog {
    // Maps give O(1) lookups; projections call these for every rep group.
    const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const techniquesById = new Map(techniques.map((technique) => [technique.id, technique]));
    return {
        exercises,
        techniques,
        findExercise: (id) => exercisesById.get(id),
        findTechnique: (id) => techniquesById.get(id),
    };
}
