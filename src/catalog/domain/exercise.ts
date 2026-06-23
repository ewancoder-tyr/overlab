export type ExerciseId = string & { readonly _brand: 'ExerciseId' };

export function exerciseId(value: string) {
    return value as ExerciseId;
}

export interface Exercise {
    id: ExerciseId;
    name: string;
    form?: string;
}
