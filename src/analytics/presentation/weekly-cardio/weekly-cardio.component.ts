import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { OTHER_CARDIO } from '@analytics/domain/weekly-cardio';
import { CatalogService } from '@catalog/application/catalog.service';
import { Locale } from '@shared/application/locale.service';
import { Localized, formatNumber, lastDays, plural } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';

interface Text {
    readonly min: string;
    readonly kcal: string;
    readonly other: string;
    readonly reached: string;
    readonly empty: (days: number) => string;
    readonly untimed: (count: number) => string;
    /** The sentence a screen reader reads instead of the number and the gauge. */
    readonly label: (minutes: number, goal: number, reached: boolean) => string;
    readonly statisticsFor: (name: string) => string;
}

const TEXT: Localized<Text> = {
    en: {
        min: 'min',
        kcal: 'kcal',
        other: 'Other',
        reached: 'Goal reached',
        empty: (days) =>
            `No cardio in the last ${days} ${plural('en', days, { one: 'day', other: 'days' })}`,
        untimed: (count) =>
            plural('en', count, {
                one: `${count} bout without a time isn't counted`,
                other: `${count} bouts without a time aren't counted`,
            }),
        label: (minutes, goal, reached) =>
            `${minutes} of ${goal} minutes of cardio${reached ? ', goal reached' : ''}`,
        statisticsFor: (name) => `Statistics for ${name}`,
    },
    ru: {
        min: 'мин',
        kcal: 'ккал',
        other: 'Другое',
        reached: 'Цель выполнена',
        empty: (days) => `${lastDays('ru', days)} кардио не было`,
        untimed: (count) =>
            plural('ru', count, {
                one: `${count} запись без времени не учтена`,
                few: `${count} записи без времени не учтены`,
                many: `${count} записей без времени не учтены`,
                other: `${count} записи без времени не учтены`,
            }),
        label: (minutes, goal, reached) =>
            `${minutes} из ${goal} минут кардио${reached ? ', цель выполнена' : ''}`,
        statisticsFor: (name) => `Статистика: ${name}`,
    },
};

/**
 * Shades of the gauge colour for the segments, largest first: each a mix of the fill colour
 * with the dark track, in percent. Past the last one the shade repeats; the breakdown list
 * (with its swatches and names) is what tells the segments apart, never the colour alone.
 */
const SHADES = [100, 72, 52, 38, 28];

/**
 * The cardio counterpart of the weekly volume gauges: minutes of all cardio in the last 7 days
 * against the weekly goal, as one big number and one tube.
 *
 * The tube's fill is split into one segment per exercise, so it shows at a glance where the
 * minutes came from; the breakdown under it names them. Only time is added up across exercises
 * (see `weeklyCardio`), and the goal is a minimum, so the tube is simply full once it is reached.
 */
@Component({
    selector: 'olab-weekly-cardio',
    imports: [RouterLink],
    // A class on the element itself, so the stylesheet switches every colour in one place.
    host: { '[class.reached]': 'reached()' },
    templateUrl: './weekly-cardio.component.html',
    styleUrl: './weekly-cardio.component.scss',
})
export class WeeklyCardioComponent {
    private readonly analytics = inject(AnalyticsService);
    private readonly catalog = inject(CatalogService).catalog;
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    private readonly week = this.analytics.weeklyCardio;
    /** The target window, which the empty text names. */
    protected readonly windowDays = this.analytics.windowDays;

    /** Whole minutes, rounded down: 149:59 shows as 149, which is honest about "not yet". */
    protected readonly minutes = computed(() => Math.floor(this.week().totalSeconds / 60));
    protected readonly goal = computed(() => this.week().goalSeconds / 60);
    protected readonly reached = computed(() => this.week().status === 'reached');
    protected readonly empty = computed(() => this.week().byExercise.length === 0);

    protected readonly label = computed(() =>
        this.t().label(this.minutes(), this.goal(), this.reached()),
    );

    /** One row per exercise, each with its segment of the tube and its shade. */
    protected readonly rows = computed(() => {
        const week = this.week();
        const catalog = this.catalog();
        const language = this.language();
        // Past the goal the segments share the full tube, in proportion.
        const scale = Math.max(week.totalSeconds, week.goalSeconds);
        return week.byExercise.map((share, index) => {
            const exercise =
                share.exerciseId === OTHER_CARDIO
                    ? undefined
                    : catalog.findExercise(share.exerciseId);
            return {
                key: share.exerciseId,
                // "Other" gathers exercises the catalog does not know: nothing to link to.
                exerciseId: exercise?.id,
                name: exercise?.name[language] ?? this.t().other,
                minutes: Math.floor(share.seconds / 60),
                widthPercent: (share.seconds / scale) * 100,
                shade: `${String(SHADES[Math.min(index, SHADES.length - 1)])}%`,
            };
        });
    });

    /** The dim "≈ 820 kcal" side figure, when any bout recorded calories. */
    protected readonly calories = computed(() => {
        const calories = this.week().calories;
        return calories === undefined
            ? undefined
            : `≈ ${formatNumber(this.language(), calories)} ${this.t().kcal}`;
    });

    protected readonly untimed = computed(() => {
        const count = this.week().untimedBouts;
        return count === 0 ? undefined : this.t().untimed(count);
    });
}
