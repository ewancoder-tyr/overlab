import { Exercise } from '@catalog/domain/exercise';
import { Language, Localized, formatNumber } from '@shared/domain/language';
import { formatWeight, unitLabel } from '@training/domain/load-wording';
import { Load } from '@training/domain/set';

/** U+2212, the typographic minus sign; easier to read than a hyphen next to digits. */
const MINUS = '−';

/** "Body weight": BW in English gyms, СВ (собственный вес) in Russian ones. */
const BODY_WEIGHT: Localized<string> = { en: 'BW', ru: 'СВ' };

/**
 * Formats a load for display.
 * For bodyweight exercises the stored value is relative to body weight, so we show it as
 * "BW", "BW +10 kg" or "BW −20 kg" rather than a bare, misleading number.
 */
export function formatLoad(language: Language, load: Load, exercise: Exercise | undefined): string {
    if (exercise?.loadType !== 'bodyweight') {
        return formatWeight(language, load.value, load.unit);
    }
    if (load.value === 0) {
        return BODY_WEIGHT[language];
    }
    const sign = load.value > 0 ? '+' : MINUS;
    const amount = formatNumber(language, Math.abs(load.value));
    return `${BODY_WEIGHT[language]} ${sign}${amount} ${unitLabel(language, load.unit)}`;
}
