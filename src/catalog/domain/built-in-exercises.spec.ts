import { BUILT_IN_EXERCISES } from './built-in-exercises';
import { BUILT_IN_RUSSIAN } from './built-in-russian';
import { isCardio } from './exercise';
import { MUSCLE_GROUPS } from './muscle-group';

describe('built-in exercises', () => {
    it('have unique ids', () => {
        const ids = BUILT_IN_EXERCISES.map((exercise) => exercise.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it.each(BUILT_IN_EXERCISES)('$id describes its form', (exercise) => {
        expect(exercise.form?.en.length ?? 0).toBeGreaterThan(40);
    });

    it.each(BUILT_IN_EXERCISES)('$id has a Russian name and form notes', (exercise) => {
        const russian = BUILT_IN_RUSSIAN[exercise.id];

        expect(russian?.name).toBe(exercise.name.ru);
        expect(russian?.form.length ?? 0).toBeGreaterThan(40);
    });

    it('have no Russian entries for exercises that do not exist', () => {
        const ids = new Set<string>(BUILT_IN_EXERCISES.map((exercise) => exercise.id));

        expect(Object.keys(BUILT_IN_RUSSIAN).filter((id) => !ids.has(id))).toEqual([]);
    });

    it.each(BUILT_IN_EXERCISES)('$id has valid involvements, highest first', ({ involvements }) => {
        const ratios = involvements.map((involvement) => involvement.ratio);
        const muscles = involvements.map((involvement) => involvement.muscleGroupId);

        expect(ratios.every((ratio) => ratio > 0 && ratio <= 1)).toBe(true);
        expect(ratios).toEqual(ratios.toSorted((a, b) => b - a));
        expect(new Set(muscles).size).toBe(muscles.length);
    });

    it('involve no muscle group when they are cardio, and at least one otherwise', () => {
        const cardio = BUILT_IN_EXERCISES.filter(isCardio).map((exercise) => exercise.id);

        expect(cardio).toEqual([
            'running',
            'walking',
            'cycling',
            'elliptical',
            'rowing-machine',
            'stair-climber',
            'jump-rope',
            'swimming',
            'treadmill',
            'sauna',
        ]);
    });

    it('train every muscle group as a primary mover at least once', () => {
        const primary = new Set(
            BUILT_IN_EXERCISES.flatMap((exercise) =>
                exercise.involvements
                    .filter((involvement) => involvement.ratio >= 0.8)
                    .map((involvement) => involvement.muscleGroupId),
            ),
        );

        expect(MUSCLE_GROUPS.filter((group) => !primary.has(group.id))).toEqual([]);
    });
});
