/**
 * The colour scheme the user chose: the black-and-yellow `dark` look (the default) or `light`,
 * the same look on a pale surface. A preference, so it is backed up and syncs like the rest.
 *
 * It lives in `shared`, like `Language`, because `settings` keeps it (and may import only
 * `shared`) while `ColorSchemes` in `shared/application` puts it on the page. The colours
 * themselves are CSS, in `src/styles.scss`.
 */
export const COLOR_SCHEME_IDS = ['dark', 'light'] as const;

export type ColorSchemeId = (typeof COLOR_SCHEME_IDS)[number];

export const DEFAULT_COLOR_SCHEME: ColorSchemeId = 'dark';

export function isColorSchemeId(value: unknown): value is ColorSchemeId {
    return COLOR_SCHEME_IDS.some((id) => id === value);
}
