import { Component, computed, inject, input } from '@angular/core';
import { RecordRow } from '@analytics/domain/records';
import { Exercise } from '@catalog/domain/exercise';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { LocalDatePipe, translations } from '@shared/presentation/i18n';
import { formatLoad } from '@training/presentation/set-format';

const TEXT = {
    en: {
        load: 'Load',
        reps: 'Reps',
        date: 'Set on',
        empty: 'Records start from your second session.',
        toBeat: (heaviest: string) =>
            `To set a record: one more rep than a row, at its load or heavier, or anything above ${heaviest}.`,
    },
    ru: {
        load: 'Вес',
        reps: 'Повторы',
        date: 'Когда',
        empty: 'Рекорды появятся со второй тренировки.',
        toBeat: (heaviest: string) =>
            `Чтобы поставить рекорд: на повтор больше, чем в строке, с её весом или тяжелее, или что угодно тяжелее ${heaviest}.`,
    },
} satisfies Localized<unknown>;

/**
 * The record table of one exercise: the most full reps ever done at each load, keeping only
 * loads where nothing heavier was done for as many reps. Read from the top down, it lists the
 * numbers to beat:
 *
 *     110 kg × 3    12 Oct
 *     105 kg × 6     2 Nov
 *     100 kg × 9     9 Nov
 *
 * All the judging is done by the `recordTable` projection; this component only draws it.
 */
@Component({
    selector: 'olab-record-table',
    imports: [LocalDatePipe],
    templateUrl: './record-table.component.html',
    styleUrl: './record-table.component.scss',
})
export class RecordTableComponent {
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    readonly exercise = input.required<Exercise>();
    /** Heaviest first, as `recordTable` returns them. */
    readonly rows = input.required<readonly RecordRow[]>();

    protected readonly shown = computed(() => {
        const language = this.language();
        const exercise = this.exercise();
        return this.rows().map((row) => ({
            key: row.kilograms,
            load: formatLoad(language, row.load, exercise),
            reps: row.reps,
            occurredAt: row.occurredAt,
        }));
    });

    protected readonly heaviest = computed(() => this.shown()[0]?.load);
}
