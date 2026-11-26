import { DOCUMENT } from '@angular/common';
import { Service, effect, inject, signal } from '@angular/core';
import { ColorSchemeId } from '@shared/domain/color-scheme';

/**
 * A colour scheme: a named set of values for the colour tokens in `src/styles.scss`.
 *
 * The values themselves are CSS, not TypeScript. A scheme is a rule that redefines the tokens
 * under its id, `:root[data-color-scheme='<id>'] { --background: ...; }`, so no component
 * changes when a scheme is added: every component already paints with `var(--...)`. This object
 * carries only what CSS cannot set on its own.
 */
export interface ColorScheme {
    /** The value of `data-color-scheme` on `<html>`, which the scheme's CSS rule selects on. */
    readonly id: string;
    /**
     * The colour of the phone's status bar and the browser's address bar
     * (`<meta name="theme-color">`). It lives outside the page, so CSS cannot reach it.
     */
    readonly themeColor: string;
}

/** The black-and-yellow look: the token values written straight into `:root`. */
export const DARK: ColorScheme = { id: 'dark', themeColor: '#000000' };

/** The same look on paper. Its token values are under `[data-color-scheme='light']`. */
export const LIGHT: ColorScheme = { id: 'light', themeColor: '#e2e0d8' };

/**
 * The schemes the user can choose, by the id the preference stores. `Record` makes a missing
 * one a compile error when `COLOR_SCHEME_IDS` grows.
 */
const CHOOSABLE: Readonly<Record<ColorSchemeId, ColorScheme>> = { dark: DARK, light: LIGHT };

/**
 * Which colour scheme the app wears, and the one place that puts it on the page.
 *
 * The scheme is the `color-scheme` preference, dark or light, which `app.config.ts` feeds in
 * through `choose()`, the way it feeds the language into `Locale`.
 *
 * Nothing here is stored: the preference is the settings context's, and this only shows it.
 */
@Service()
export class ColorSchemes {
    private readonly document = inject(DOCUMENT);
    private readonly chosen = signal<ColorScheme>(DARK);

    constructor() {
        // An effect keeps the page in step with the choice: it runs once now and again whenever
        // the signal changes.
        effect(() => {
            this.apply(this.chosen());
        });
    }

    choose(id: ColorSchemeId): void {
        this.chosen.set(CHOOSABLE[id]);
    }

    private apply(scheme: ColorScheme): void {
        const root = this.document.documentElement;
        // The default needs no attribute: its values are the plain `:root` ones. Leaving it off
        // keeps the page exactly as it was before schemes existed.
        if (scheme.id === DARK.id) {
            root.removeAttribute('data-color-scheme');
        } else {
            root.setAttribute('data-color-scheme', scheme.id);
        }
        this.document
            .querySelector('meta[name="theme-color"]')
            ?.setAttribute('content', scheme.themeColor);
    }
}
