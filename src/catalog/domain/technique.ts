import { Branded } from '@shared/domain/brand';
import { LocalText } from '@shared/domain/language';

export type TechniqueId = Branded<string, 'TechniqueId'>;

/** How a rep is executed. Not to be confused with form (correct execution of the exercise). */
export interface Technique {
    readonly id: TechniqueId;
    readonly name: LocalText;
    /** Short label for compact display, e.g. on a rep group chip. */
    readonly abbreviation: LocalText;
}

/**
 * Built-in techniques.
 *
 * ORDER MATTERS: progression compares techniques in this order, so the most demanding and most
 * "countable" technique comes first. Fewer full reps are never compensated by more partials.
 *
 * Ids are stored in events forever: never rename or reuse one.
 */
export const BUILT_IN_TECHNIQUES: readonly Technique[] = [
    {
        id: 'full' as TechniqueId,
        name: { en: 'Full range', ru: 'Полная амплитуда' },
        abbreviation: { en: 'Full', ru: 'Полн' },
    },
    {
        id: 'paused' as TechniqueId,
        name: { en: 'Paused', ru: 'С паузой' },
        abbreviation: { en: 'Pause', ru: 'Пауза' },
    },
    {
        id: 'slow-eccentric' as TechniqueId,
        name: { en: 'Slow eccentric', ru: 'Медленный негатив' },
        abbreviation: { en: 'Slow', ru: 'Негат' },
    },
    {
        id: 'long-length-partial' as TechniqueId,
        name: { en: 'Long-length partial', ru: 'Частичные в растяжении' },
        abbreviation: { en: 'LLP', ru: 'ЧвР' },
    },
    {
        id: 'short-length-partial' as TechniqueId,
        name: { en: 'Short-length partial', ru: 'Частичные в сокращении' },
        abbreviation: { en: 'SLP', ru: 'ЧвС' },
    },
];

export const DEFAULT_TECHNIQUE_ID = 'full' as TechniqueId;
