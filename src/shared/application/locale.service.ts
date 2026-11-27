import { Service, computed, effect, signal } from '@angular/core';
import { DEFAULT_LANGUAGE, Language, isLanguage } from '@shared/domain/language';

/**
 * The language the app speaks right now, as a signal, so every text on screen re-renders the
 * moment it changes.
 *
 * The choice itself is a preference (an event, in the settings context), but `shared` cannot
 * know about settings, and every context needs the language. So, like the rest alerts,
 * the shell passes the preference in (`app.config.ts`). Until the user has chosen, the app
 * follows the browser: a phone set to Russian gets Russian.
 */
@Service()
export class Locale {
    private readonly chosen = signal<Language | undefined>(undefined);

    readonly language = computed(() => this.chosen() ?? browserLanguage());

    constructor() {
        // Screen readers pick their pronunciation from `lang`, and the browser its hyphenation
        // and quotes. Kept in step with the app rather than fixed in index.html.
        effect(() => {
            document.documentElement.lang = this.language();
        });
    }

    /** `undefined` means the user has not chosen: follow the browser. */
    use(language: Language | undefined): void {
        this.chosen.set(language);
    }
}

/** The first of the browser's preferred languages that OverLab speaks. */
export function browserLanguage(): Language {
    for (const tag of navigator.languages) {
        const primary = tag.split('-')[0]?.toLowerCase();
        if (isLanguage(primary)) {
            return primary;
        }
    }
    return DEFAULT_LANGUAGE;
}
