/**
 * The languages OverLab speaks. `as const` keeps the literal values, so `Language` is exactly
 * `'en' | 'ru'` and adding a language here makes the compiler point at every table that lacks it.
 */
export const LANGUAGES = ['en', 'ru'] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

export function isLanguage(value: unknown): value is Language {
    return LANGUAGES.some((language) => language === value);
}

/**
 * The same thing in every language: `{ en: 'Chest', ru: 'Грудь' }`.
 *
 * `Record<Language, T>` requires a key for every member of the union, so a missing translation
 * is a compile error rather than a blank on screen.
 */
export type Localized<T> = Readonly<Record<Language, T>>;

/** A sentence or a name in every language. Domain rules return their messages in this form. */
export type LocalText = Localized<string>;

/**
 * The word forms a count needs. English has two (1 set, 2 sets). Russian has three, chosen by
 * the last digits: 1, 21 подход; 2–4, 22 подхода; 5–20, 25 подходов. `other` is used for
 * fractions in Russian (1,5 подхода) and for every count but 1 in English.
 */
export interface PluralForms {
    readonly one: string;
    readonly few?: string;
    readonly many?: string;
    readonly other: string;
}

/**
 * Picks the word form for `count` by the plural rules of `language`. `Intl.PluralRules` knows
 * the rules of every language, so there is no hand-written "ends in 2, 3 or 4" logic here.
 */
export function plural(language: Language, count: number, forms: PluralForms): string {
    const category = new Intl.PluralRules(language).select(count);
    switch (category) {
        case 'one':
            return forms.one;
        case 'few':
            return forms.few ?? forms.other;
        case 'many':
            return forms.many ?? forms.other;
        default:
            return forms.other;
    }
}

/**
 * A number the way `language` writes it: `1.5` in English, `1,5` in Russian. Without grouping,
 * so that 5230 metres stays one recognisable number.
 */
export function formatNumber(language: Language, value: number, fractionDigits?: number): string {
    return new Intl.NumberFormat(language, {
        useGrouping: false,
        ...(fractionDigits === undefined
            ? { maximumFractionDigits: 2 }
            : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }),
    }).format(value);
}

/**
 * "Last 7 days" / "За 7 дней": the rolling window the Week page counts over (the target
 * window), as a heading. Russian says "за N дней", which needs no agreement with the number
 * the way "последние N" would ("последний 21 день").
 */
export function lastDays(language: Language, days: number): string {
    return language === 'en'
        ? `Last ${days} ${plural('en', days, { one: 'day', other: 'days' })}`
        : `За ${days} ${plural('ru', days, { one: 'день', few: 'дня', many: 'дней', other: 'дня' })}`;
}
