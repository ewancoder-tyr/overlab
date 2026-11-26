import { Component, computed, inject, input } from '@angular/core';
import { CardioRecordRow } from '@analytics/domain/cardio-records';
import { describeCardio } from '@analytics/domain/cardio-wording';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { LocalDatePipe, translations } from '@shared/presentation/i18n';

const TEXT = {
    en: {
        session: 'Session',
        date: 'Set on',
        empty: 'Records start from your second session.',
        toBeat: {
            speed: 'To set a record: go farther than the top row, or faster than a row over at least its distance.',
            burnRate:
                'To set a record: burn more than the top row, or burn faster than a row while burning at least as much.',
            single: 'To set a record: more than this.',
        },
    },
    ru: {
        session: 'Тренировка',
        date: 'Когда',
        empty: 'Рекорды появятся со второй тренировки.',
        toBeat: {
            speed: 'Чтобы поставить рекорд: дальше верхней строки или быстрее строки на дистанции не короче её.',
            burnRate:
                'Чтобы поставить рекорд: сжечь больше верхней строки или сжигать быстрее строки, сжигая не меньше.',
            single: 'Чтобы поставить рекорд: больше, чем здесь.',
        },
    },
} satisfies Localized<unknown>;

/**
 * The cardio record table: with distance and time, the best speed for each distance that no
 * other session beats on both, farthest first. All judging is done by `cardioRecordTable`.
 *
 *     10 km · 53:34 · 11.2 km/h    2 Nov
 *      5 km · 24:00 · 12.5 km/h    9 Nov
 */
@Component({
    selector: 'olab-cardio-record-table',
    imports: [LocalDatePipe],
    templateUrl: './cardio-record-table.component.html',
    styleUrl: './cardio-record-table.component.scss',
})
export class CardioRecordTableComponent {
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    /** As `cardioRecordTable` returns them: the most first. */
    readonly rows = input.required<readonly CardioRecordRow[]>();

    protected readonly shown = computed(() => {
        const language = this.language();
        return this.rows().map((row) => ({
            startedAt: row.startedAt,
            text: describeCardio(language, row.totals),
        }));
    });

    /** How to beat the table, which depends on the measures it is about. */
    protected readonly caption = computed(() => {
        const first = this.rows()[0]?.totals;
        const toBeat = this.t().toBeat;
        if (first?.durationSeconds !== undefined && first.distanceMeters !== undefined) {
            return toBeat.speed;
        }
        if (first?.durationSeconds !== undefined && first.calories !== undefined) {
            return toBeat.burnRate;
        }
        return toBeat.single;
    });
}
