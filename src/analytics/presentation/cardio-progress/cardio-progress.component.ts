import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import {
    CardioHistoryEntry,
    CardioOutcome,
    matchedOrBeaten,
    speedKmh,
} from '@analytics/domain/cardio-progression';
import {
    describeCardio,
    describeComparison,
    formatClimb,
    formatDistance,
    formatDuration,
    formatSpeed,
} from '@analytics/domain/cardio-wording';
import { Locale } from '@shared/application/locale.service';
import { Language, Localized } from '@shared/domain/language';
import { LocalDatePipe, translations } from '@shared/presentation/i18n';
import { CardioTotals } from '@training/domain/cardio';

/** How many of the most recent sessions the charts show. */
const MAX_POINTS = 12;

/*
 * Chart geometry, in SVG user units. The drawing is 300 wide and scales with its container.
 * It stacks one small line chart per measure (distance, speed, time), all sharing the
 * horizontal axis: one column per session. They are separate charts on purpose, like load and
 * reps on the lifting chart: kilometres, km/h and minutes have unrelated scales, and lines
 * drawn on one plot would cross at points that mean nothing.
 */
const WIDTH = 300;
const PADDING_X = 16;
/** Height of one chart with its title; the next one starts this much lower. */
const PANEL_HEIGHT = 70;
const TITLE_Y = 9;
const PLOT_TOP = 32;
const PLOT_BOTTOM = 58;
/** Room under the last chart for the row of verdict marks. */
const VERDICT_ROW = 22;
/** Gap between a dot and the value written above it. */
const LABEL_GAP = 7;

/** A verdict as shown under a session. `baseline` is a session with nothing to compare with. */
type ShownVerdict = CardioOutcome | 'baseline';

const GLYPHS: Readonly<Record<ShownVerdict, string>> = {
    up: '▲',
    same: '=',
    down: '▼',
    mixed: '◆',
    baseline: '●',
};

const TEXT = {
    en: {
        verdicts: {
            up: 'Better than the session before',
            same: 'Matched the session before',
            down: 'Below the session before',
            mixed: 'A trade against the session before',
            baseline: 'Baseline',
        } satisfies Record<ShownVerdict, string>,
        measures: { distance: 'Distance', speed: 'Speed', climb: 'Climb', time: 'Time' },
        of: 'of',
        matchedBefore: 'sessions matched or beat the one before',
        noProgress: 'No progress yet',
        caption:
            '▲ means the session beat the one before, = that it matched it, ▼ that it fell short, ◆ a trade (farther but slower, or the other way round). Tap a session to see it.',
        describe: (count: number, first: string, last: string) =>
            `Last ${count} sessions: from ${first} to ${last}.`,
    },
    ru: {
        verdicts: {
            up: 'Лучше предыдущей тренировки',
            same: 'Наравне с предыдущей тренировкой',
            down: 'Хуже предыдущей тренировки',
            mixed: 'Размен с предыдущей тренировкой',
            baseline: 'Точка отсчёта',
        },
        measures: {
            distance: 'Дистанция',
            speed: 'Скорость',
            climb: 'Набор высоты',
            time: 'Время',
        },
        of: 'из',
        matchedBefore: 'тренировок не хуже предыдущей',
        noProgress: 'Прогресса пока нет',
        caption:
            '▲ — тренировка лучше предыдущей, = — наравне, ▼ — хуже, ◆ — размен (дальше, но медленнее, или наоборот). Нажмите на тренировку, чтобы увидеть её.',
        describe: (count: number, first: string, last: string) =>
            `Последние тренировки (${count}): от ${first} до ${last}.`,
    },
} satisfies Localized<unknown>;

/** One of the stacked charts: what it plots and how its values are written. */
interface Measure {
    readonly key: keyof (typeof TEXT)['en']['measures'];
    readonly read: (totals: CardioTotals) => number | undefined;
    readonly format: (language: Language, value: number) => string;
}

const MEASURES: readonly Measure[] = [
    { key: 'distance', read: (totals) => totals.distanceMeters, format: formatDistance },
    { key: 'speed', read: speedKmh, format: formatSpeed },
    // Only a treadmill has a climb, so every other exercise gets no chart for it.
    { key: 'climb', read: (totals) => totals.climbMeters, format: formatClimb },
    {
        key: 'time',
        read: (totals) => totals.durationSeconds,
        format: (_, value) => formatDuration(value),
    },
];

/** A session's dot on one chart. */
interface Mark {
    /** Index of the session among the plotted ones: its column. */
    readonly column: number;
    readonly x: number;
    readonly y: number;
    readonly label: string;
}

interface Panel {
    readonly title: string;
    readonly titleY: number;
    /** The line through the marks, broken wherever a session did not record this measure. */
    readonly line: string;
    readonly marks: readonly Mark[];
}

/**
 * Progress of one cardio exercise over time: distance, speed and time, one small chart each,
 * with a mark under every session saying whether it beat the one before. Tap a session for its
 * numbers.
 *
 * A measure that was never recorded gets no chart, and a session that lacks one leaves a gap in
 * that chart's line rather than a made-up point.
 */
@Component({
    selector: 'olab-cardio-progress',
    imports: [LocalDatePipe],
    templateUrl: './cardio-progress.component.html',
    styleUrl: './cardio-progress.component.scss',
})
export class CardioProgressComponent {
    /** The exercise's sessions with their verdicts, oldest first. */
    readonly history = input.required<readonly CardioHistoryEntry[]>();

    protected readonly t = translations(TEXT);
    private readonly language = inject(Locale).language;

    private readonly shown = computed(() => this.history().slice(-MAX_POINTS));

    /**
     * How many sessions matched or beat the one before, out of those that could be compared.
     * Matching counts: it is the aim (see "Cardio match rule" in docs/rules/cardio.md).
     */
    protected readonly summary = computed(() => {
        const compared = this.history().filter((entry) => entry.comparison !== undefined);
        return {
            compared: compared.length,
            reached: compared.filter(
                (entry) =>
                    entry.comparison !== undefined && matchedOrBeaten(entry.comparison.outcome),
            ).length,
        };
    });

    /** One entry per plotted session: where its column is and what its verdict was. */
    protected readonly columns = computed(() => {
        const shown = this.shown();
        const language = this.language();
        const verdicts = this.t().verdicts;
        // Horizontal distance between sessions. A single session sits in the middle.
        const slot = shown.length > 1 ? (WIDTH - PADDING_X * 2) / (shown.length - 1) : 0;
        const hitWidth = Math.max(slot, 28);

        return shown.map((entry, index) => {
            const x = shown.length > 1 ? PADDING_X + index * slot : WIDTH / 2;
            const verdict: ShownVerdict = entry.comparison?.outcome ?? 'baseline';
            const isFirst = index === 0;
            const isLast = index === shown.length - 1;
            return {
                x,
                // Values are written on the first and last session only (plus the selected
                // one, see the template): enough to read the scale without crowding the chart.
                isEndpoint: isFirst || isLast,
                // End labels are anchored inwards so that long ones are not cut off.
                labelAnchor:
                    shown.length === 1 ? 'middle' : isFirst ? 'start' : isLast ? 'end' : 'middle',
                labelX: shown.length === 1 ? x : isFirst ? x - 8 : isLast ? x + 8 : x,
                // The tappable column is wider than the marks, to be easy to hit.
                hitX: x - hitWidth / 2,
                hitWidth,
                verdict,
                glyph: GLYPHS[verdict],
                // "Better than the session before: farther, same speed".
                verdictText:
                    entry.comparison === undefined
                        ? verdicts[verdict]
                        : `${verdicts[verdict]}: ${describeComparison(language, entry.comparison)}`,
                startedAt: entry.startedAt,
                numbers: describeCardio(language, entry.totals),
            };
        });
    });

    /** The charts to draw, top to bottom: one per measure that has at least one value. */
    protected readonly panels = computed<readonly Panel[]>(() => {
        const shown = this.shown();
        const columns = this.columns();
        const language = this.language();
        const titles = this.t().measures;

        return MEASURES.flatMap((measure) => {
            const values = shown.map((entry) => measure.read(entry.totals));
            const known = values.filter((value) => value !== undefined);
            // Nothing but zeros (a treadmill never inclined) is no more worth a chart than
            // nothing at all.
            return known.every((value) => value === 0) ? [] : [{ measure, values, known }];
        }).map(({ measure, values, known }, panelIndex) => {
            const offset = panelIndex * PANEL_HEIGHT;
            const min = Math.min(...known);
            const range = Math.max(...known) - min;

            const marks = values.flatMap((value, column): Mark[] => {
                const x = columns[column]?.x;
                if (value === undefined || x === undefined) {
                    return [];
                }
                // A flat history is drawn as a line through the middle of the chart.
                const y =
                    range === 0
                        ? (PLOT_TOP + PLOT_BOTTOM) / 2
                        : PLOT_BOTTOM - ((value - min) / range) * (PLOT_BOTTOM - PLOT_TOP);
                return [{ column, x, y: offset + y, label: measure.format(language, value) }];
            });

            // "M" starts a new stroke, "L" continues one. A mark whose left neighbour is
            // missing starts a new stroke, which is what leaves the gap.
            const line = marks
                .map((mark, index) => {
                    const continues = marks[index - 1]?.column === mark.column - 1;
                    return `${continues ? 'L' : 'M'}${mark.x},${mark.y}`;
                })
                .join(' ');

            return { title: titles[measure.key], titleY: offset + TITLE_Y, line, marks };
        });
    });

    protected readonly layout = computed(() => {
        const height = this.panels().length * PANEL_HEIGHT + VERDICT_ROW;
        return { height, verdictY: height - 7, viewBox: `0 0 ${WIDTH} ${height}` };
    });

    protected readonly labelGap = LABEL_GAP;

    /** The session whose numbers are shown under the charts. Starts at the latest one. */
    protected readonly selectedIndex = linkedSignal(() => this.columns().length - 1);
    protected readonly selected = computed(() => this.columns()[this.selectedIndex()]);

    /** Text alternative for the drawing. */
    protected readonly description = computed(() => {
        const columns = this.columns();
        const first = columns[0];
        const last = columns.at(-1);
        const t = this.t();
        return first === undefined || last === undefined
            ? t.noProgress
            : t.describe(columns.length, first.numbers, last.numbers);
    });
}
