import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { CatalogService } from '@catalog/application/catalog.service';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';
import { SetId, SetPerformed, isEasy, primaryExerciseId } from '@training/domain/set';
import { groupSetsByLoad } from '@training/domain/set-rows';
import { formatLoad } from '../set-format';

/** How a set did against last time; decides the colour of its cell. */
export type CellTone = 'up' | 'same' | 'down' | 'baseline' | 'extra';

/** Exported so the template's `let-cell` context can be type-checked. */
export interface CellView {
    readonly id: SetId;
    /** One coloured tile per technique used in the set, in the order first performed. */
    readonly tiles: readonly { readonly reps: number; readonly technique: string }[];
    readonly failure: boolean;
    /** Done easy on purpose: a mint dot where the failure dot would be. */
    readonly light: boolean;
    /** An easy set (far from failure): a mint ring in the same place. */
    readonly easy: boolean;
    readonly warmUp: boolean;
    readonly tone: CellTone | undefined;
    /** Spoken description for screen readers. */
    readonly label: string;
}

interface RowView {
    readonly load: string;
    readonly cells: readonly CellView[];
}

const TEXT = {
    en: {
        tones: {
            up: 'better than last time',
            same: 'same as last time',
            down: 'below last time',
            baseline: 'new baseline',
            extra: 'extra set',
        } satisfies Record<CellTone, string>,
        plus: ' plus ',
        warmUp: 'warm-up',
        toFailure: 'to failure',
        light: 'light',
        easy: 'easy',
    },
    ru: {
        tones: {
            up: 'лучше, чем в прошлый раз',
            same: 'так же, как в прошлый раз',
            down: 'хуже, чем в прошлый раз',
            baseline: 'новая точка отсчёта',
            extra: 'лишний подход',
        },
        plus: ' плюс ',
        warmUp: 'разминка',
        toFailure: 'до отказа',
        light: 'легко',
        easy: 'без усилия',
    },
} satisfies Localized<unknown>;

/**
 * A session's sets at a glance: one line per load, with each set as large rep-count tiles.
 *
 *     20 kg     [8]  [8]  [5][3]
 *     22.5 kg   [6]
 *
 * A tile's colour is its technique (see the `--technique-*` tokens in `styles.scss`), so a set of
 * 5 full reps followed by 3 partials is two joined tiles of different colours. The bar under a set
 * shows progression against last time, and a dot marks a set taken to failure. Tapping a set
 * selects it, so the page can show its details and offer to void it.
 */
@Component({
    selector: 'olab-set-grid',
    imports: [NgTemplateOutlet],
    templateUrl: './set-grid.component.html',
    styleUrl: './set-grid.component.scss',
    host: { '[class.compact]': 'compact()' },
})
export class SetGridComponent {
    private readonly catalog = inject(CatalogService).catalog;
    private readonly language = inject(Locale).language;
    private readonly t = translations(TEXT);

    readonly sets = input.required<readonly SetPerformed[]>();
    readonly tones = input<ReadonlyMap<SetId, CellTone>>();
    /** Smaller cells, for history lists. */
    readonly compact = input(false);
    /** Whether sets can be tapped to select them. Read-only grids render plain text cells. */
    readonly interactive = input(false);
    readonly selectedId = input<SetId>();
    /** Emits the tapped set's id (only when `interactive`). */
    readonly selected = output<SetId>();

    protected readonly rows = computed<readonly RowView[]>(() => {
        const catalog = this.catalog();
        const tones = this.tones();
        const language = this.language();
        const t = this.t();

        return groupSetsByLoad(this.sets()).map((row) => {
            const exerciseId = row.cells[0] && primaryExerciseId(row.cells[0].set);
            const exercise =
                exerciseId === undefined ? undefined : catalog.findExercise(exerciseId);
            const load = row.loads
                .map((entry) => formatLoad(language, entry, exercise))
                .join(' → ');

            return {
                load,
                cells: row.cells.map(({ set, repsByTechnique }) => {
                    const tone = tones?.get(set.id);
                    const failure = set.effort?.kind === 'failure';
                    const light = set.effort?.kind === 'light';
                    const easy = isEasy(set);
                    const warmUp = set.kind === 'warmup';
                    return {
                        id: set.id,
                        tiles: repsByTechnique,
                        failure,
                        light,
                        easy,
                        warmUp,
                        tone,
                        label: [
                            `${load}, ${repsByTechnique
                                .map(
                                    (entry) =>
                                        `${entry.reps} ${catalog.findTechnique(entry.technique)?.name[language] ?? entry.technique}`,
                                )
                                .join(t.plus)}`,
                            ...(warmUp ? [t.warmUp] : []),
                            ...(failure ? [t.toFailure] : []),
                            ...(light ? [t.light] : []),
                            ...(easy ? [t.easy] : []),
                            ...(tone === undefined ? [] : [t.tones[tone]]),
                        ].join(', '),
                    };
                }),
            };
        });
    });
}
