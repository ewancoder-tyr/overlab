import { BUILT_IN_EXERCISES } from './built-in-exercises';
import { isCardio, isShown } from './exercise';

const cardio = BUILT_IN_EXERCISES.filter(isCardio);
const lifting = BUILT_IN_EXERCISES.filter((exercise) => !isCardio(exercise));

describe('isShown', () => {
    it('both shows everything', () => {
        expect(BUILT_IN_EXERCISES.every((exercise) => isShown(exercise, 'both'))).toBe(true);
    });

    it('lifting hides cardio exercises', () => {
        expect(cardio.length).toBeGreaterThan(0);
        expect(cardio.some((exercise) => isShown(exercise, 'lifting'))).toBe(false);
        expect(lifting.every((exercise) => isShown(exercise, 'lifting'))).toBe(true);
    });

    it('cardio hides lifting exercises', () => {
        expect(lifting.some((exercise) => isShown(exercise, 'cardio'))).toBe(false);
        expect(cardio.every((exercise) => isShown(exercise, 'cardio'))).toBe(true);
    });
});
