import { Exercise, isCardio } from '@catalog/domain/exercise';
import { MUSCLE_GROUPS } from '@catalog/domain/muscle-group';
import { LocalText, Language } from '@shared/domain/language';

/** Helpers shared by the pages that list exercises (Train and Catalog). */

export const MUSCLE_NAMES = new Map<string, LocalText>(
    MUSCLE_GROUPS.map((group) => [group.id, group.name]),
);

/** Involvement from which a muscle is named in an exercise's one-line description. */
const NOTABLE_RATIO = 0.5;

/** Title of the Catalog section, and the one-line description, of exercises without muscles. */
export const CARDIO: LocalText = { en: 'Cardio', ru: 'Кардио' };

/**
 * The one-line description of an exercise in a list: the muscles it mainly trains, or "Cardio"
 * for an exercise that trains none (which also makes a search for "cardio" find them).
 */
export function mainMuscles(exercise: Exercise, language: Language): string {
    if (isCardio(exercise)) {
        return CARDIO[language];
    }
    return exercise.involvements
        .filter((involvement) => involvement.ratio >= NOTABLE_RATIO)
        .map((involvement) => MUSCLE_NAMES.get(involvement.muscleGroupId)?.[language])
        .join(', ');
}
