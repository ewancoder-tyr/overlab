import { Language, Localized, formatNumber, plural } from '@shared/domain/language';
import { LoadUnit } from './set';

/*
 * How loads and rep counts are written, in the domain because the reminder hype words them too
 * and the domain may not import presentation code. The stored unit is always `kg` or `lb`; only
 * the label shown differs by language.
 */

const UNIT_LABELS: Localized<Readonly<Record<LoadUnit, string>>> = {
    en: { kg: 'kg', lb: 'lb' },
    ru: { kg: 'кг', lb: 'фунт' },
};

/** `22.5 kg` or `22,5 кг`. */
export function formatWeight(language: Language, value: number, unit: LoadUnit): string {
    return `${formatNumber(language, value)} ${UNIT_LABELS[language][unit]}`;
}

/** The label of a unit on its own, for a stepper or a column heading. */
export function unitLabel(language: Language, unit: LoadUnit): string {
    return UNIT_LABELS[language][unit];
}

/** `1 rep`, `10 reps`; `1 повтор`, `3 повтора`, `10 повторов`. */
export function formatReps(language: Language, count: number): string {
    const word =
        language === 'ru'
            ? plural(language, count, {
                  one: 'повтор',
                  few: 'повтора',
                  many: 'повторов',
                  other: 'повтора',
              })
            : plural(language, count, { one: 'rep', other: 'reps' });
    return `${count} ${word}`;
}
