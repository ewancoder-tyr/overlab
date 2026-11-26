import { formatDate, registerLocaleData } from '@angular/common';
import localeRu from '@angular/common/locales/ru';
import { Pipe, PipeTransform, Signal, computed, inject } from '@angular/core';
import { Locale } from '@shared/application/locale.service';
import { LocalText, Localized } from '@shared/domain/language';

/*
 * How components speak the user's language.
 *
 * Angular has its own i18n (`@angular/localize`), but it compiles one build per language and
 * switches by loading another site. OverLab is an offline app that switches in place, so texts
 * are plain typed objects instead: one per component, with an `en` and a `ru` of the same shape.
 *
 *     const TEXT = { en: { title: 'Week' }, ru: { title: 'Неделя' } } satisfies Localized<...>;
 *     protected readonly t = translations(TEXT);          // in the component
 *     <h1>{{ t().title }}</h1>                            // in the template
 *
 * `t` is a signal, so the template re-renders when the language changes, and a key missing from
 * one language is a compile error.
 */

// Angular ships English date names; others must be registered before a date is formatted in
// them. Done once, when this file is first imported.
registerLocaleData(localeRu);

/** The texts of `table` in the current language. Call it in an injection context (a field). */
export function translations<T>(table: Localized<T>): Signal<T> {
    const locale = inject(Locale);
    return computed(() => table[locale.language()]);
}

/** The current language, for templates that pick from a `LocalText` themselves. */
export function currentLanguage(): Locale['language'] {
    return inject(Locale).language;
}

/**
 * `{{ exercise.name | localize }}`: a `LocalText` in the current language.
 *
 * `pure: false` makes Angular call it on every check of the view instead of caching the result
 * for the same input. That is what lets it notice a language change; and because it reads the
 * `language` signal, the change also schedules that check.
 */
@Pipe({ name: 'localize', pure: false })
export class LocalizePipe implements PipeTransform {
    private readonly language = inject(Locale).language;

    transform(text: LocalText): string {
        return text[this.language()];
    }
}

/**
 * `{{ day | localDate: 'EEE d MMM' }}`: Angular's date formatting in the current language
 * ("Thu 12 Nov" or "чт 12 нояб."). Impure for the same reason as `localize`.
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
    private readonly language = inject(Locale).language;

    transform(value: Date | string | undefined, format: string): string {
        return value === undefined ? '' : formatDate(value, format, this.language());
    }
}
