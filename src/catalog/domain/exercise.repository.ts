import { Exercise, ExerciseId } from "./exercise";

export interface ExerciseRepository {
    getAll(): Promise<Exercise[]>;
    getById(id: ExerciseId): Promise<Exercise | undefined>;
    save(exercise: Exercise): Promise<void>;
    delete(id: ExerciseId): Promise<void>;
}
