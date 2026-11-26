import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import {
    SessionVerdict,
    exerciseProgress,
    summariseProgress,
} from '@analytics/domain/exercise-progress';
import { isPending } from '@analytics/domain/stall';
import { CatalogService } from '@catalog/application/catalog.service';
import { Exercise } from '@catalog/domain/exercise';
import { Locale } from '@shared/application/locale.service';
import { IsoDateTime } from '@shared/domain/event';
import { Localized, plural } from '@shared/domain/language';
import { LocalDatePipe, translations } from '@shared/presentation/i18n';
import { ExerciseSession } from '@training/domain/workout';
import { SetGridComponent } from '@training/presentation/set-grid/set-grid.component';
import { formatLoad } from '@training/presentation/set-format';

/** How many of the most recent sessions the chart shows. */
const MAX_POINTS = 12;

/*
 * Chart geometry, in SVG user units. The drawing is 300 wide and scales with its container.
 * It holds two small charts that share the horizontal axis (one column per session):
 * load on top as a line, reps below as bars. They are separate charts on purpose: load and
 * reps have unrelated scales, and squeezing both onto one plot would suggest a relationship
 * between the two lines that is only an artefact of how the axes happen to be scaled.
 */
const WIDTH = 300;
const PADDING_X = 16;
const LOAD_TITLE_Y = 9;
const LOAD_TOP = 32;
const LOAD_BOTTOM = 76;
const REPS_TITLE_Y = 100;
const REPS_TOP = 122;
const REPS_BOTTOM = 162;
const VERDICT_Y = 177;
const HEIGHT = 184;
/** Gap between a mark and the value written above it. */
const LABEL_GAP = 7;
const MAX_BAR_WIDTH = 14;

/**
 * A verdict as shown: the domain's, "pending" for a session that is still going on, or
 * "matched" for an easy session level with the one before, which is a success there.
 */
type ShownVerdict = SessionVerdict | 'pending' | 'matched';

const GLYPHS: Readonly<Record<ShownVerdict, string>> = {
    pending: '…',
    up: '▲',
    same: '=',
    matched: '=',
    down: '▼',
    baseline: '●',
};

const TEXT = {
    en: {
        verdicts: {
            pending: 'In progress: not yet more than the session before',
            up: 'Better than the session before',
            same: 'Same as the session before',
            matched: 'Matched the session before, the aim of an easy one',
            down: 'Below the session before',
            baseline: 'Baseline',
        } satisfies Record<ShownVerdict, string>,
        of: 'of',
        beatBefore: 'sessions beat the one before',
        inARow: (streak: number) => `${streak} in a row`,
        heaviestLoad: 'Heaviest load',
        totalReps: 'Total reps',
        caption:
            'Line: the heaviest weight you used. Bars: all your reps added up. ▲ means you did more than the session before, ▼ less. Tap a session to see it.',
        reps: 'reps',
        noProgress: 'No progress yet',
        stalled: (count: number) =>
            `No progress in the last ${count} ${plural('en', count, { one: 'session', other: 'sessions' })}`,
        stalledAdvice:
            'Try a lighter week, a different rep range, or another exercise for this muscle.',
        describe: (
            count: number,
            firstReps: number,
            firstLoad: string,
            lastReps: number,
            lastLoad: string,
        ) =>
            `Last ${count} sessions: from ${firstReps} reps with up to ${firstLoad}, to ${lastReps} reps with up to ${lastLoad}.`,
    },
    ru: {
        verdicts: {
            pending: 'Идёт: пока не больше предыдущей тренировки',
            up: 'Лучше предыдущей тренировки',
            same: 'Так же, как в предыдущий раз',
            matched: 'Повторён предыдущий раз: цель подходов без усилия',
            down: 'Хуже предыдущей тренировки',
            baseline: 'Точка отсчёта',
        },
        of: 'из',
        beatBefore: 'тренировок лучше предыдущей',
        inARow: (streak: number) => `${streak} подряд`,
        heaviestLoad: 'Максимальный вес',
        totalReps: 'Всего повторов',
        caption:
            'Линия — самый большой вес. Столбцы — все повторы вместе. ▲ — больше, чем в предыдущий раз, ▼ — меньше. Нажмите на тренировку, чтобы увидеть её.',
        reps: 'повт.',
        noProgress: 'Прогресса пока нет',
        stalled: (count: number) =>
            `Без прогресса ${count} ${plural('ru', count, { one: 'тренировка', few: 'тренировки', many: 'тренировок', other: 'тренировки' })} подряд`,
        stalledAdvice:
            'Попробуйте лёгкую неделю, другой диапазон повторов или другое упражнение на эту мышцу.',
        describe: (
            count: number,
            firstReps: number,
            firstLoad: string,
            lastReps: number,
            lastLoad: string,
        ) =>
            `Последние тренировки (${count}): от ${firstReps} повт. с весом до ${firstLoad} до ${lastReps} повт. с весом до ${lastLoad}.`,
    },
} satisfies Localized<unknown>;

/** A bar with a rounded top, standing on the baseline. */
function barPath(x: number, width: number, height: number): string {
    const radius = Math.min(4, width / 2, height);
    const left = x - width / 2;
    const top = REPS_BOTTOM - height;
    return (
        `M${left},${REPS_BOTTOM} V${top + radius} a${radius},${radius} 0 0,1 ${radius},${-radius} ` +
        `h${width - radius * 2} a${radius},${radius} 0 0,1 ${radius},${radius} V${REPS_BOTTOM} Z`
    );
}

/**
 * Progress of one exercise: is every workout really more than the last one?
 *
 * A session is judged on everything done for the exercise in it. The headline counts how many
 * sessions beat the one before; the chart shows the heaviest load and the total reps over time,
 * with a marker under each session saying whether it was better, the same or worse. Tap a
 * session for its numbers.
 */
@Component({
    selector: 'olab-exercise-progress',
    imports: [LocalDatePipe, SetGridComponent],
    templateUrl: './exercise-progress.component.html',
    styleUrl: './exercise-progress.component.scss',
})
export class ExerciseProgressComponent {
    private readonly catalog = inject(CatalogService).catalog;
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    readonly exercise = input.required<Exercise>();
    /** The exercise's sessions, oldest first. */
    readonly sessions = input.required<readonly ExerciseSession[]>();
    /**
     * Start time of the workout in progress, if there is one. Its session is not judged as
     * "worse" while sets are still being added: until it beats the previous one it is pending.
     */
    readonly inProgressSince = input<IsoDateTime>();
    /**
     * Sessions in a row without progress, when that makes the exercise stalled (see
     * `AnalyticsService.stallOf`); absent when it is not.
     */
    readonly stalledFor = input<number>();

    protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
    protected readonly layout = {
        loadLabelY: LOAD_TITLE_Y,
        repsLabelY: REPS_TITLE_Y,
        repsBottom: REPS_BOTTOM,
        verdictY: VERDICT_Y,
        width: WIDTH,
        height: HEIGHT,
    };

    private readonly progress = computed(() => exerciseProgress(this.sessions(), this.catalog()));

    /** Whether the latest session is unfinished and has not (yet) beaten the one before. */
    private readonly latestIsPending = computed(() =>
        isPending(this.progress(), this.inProgressSince()),
    );

    /** The headline leaves a pending session out rather than counting it as a miss. */
    protected readonly summary = computed(() =>
        summariseProgress(this.latestIsPending() ? this.progress().slice(0, -1) : this.progress()),
    );

    /** One entry per plotted session, with everything the template needs to draw it. */
    protected readonly points = computed(() => {
        const exercise = this.exercise();
        const shown = this.progress().slice(-MAX_POINTS);
        const loads = shown.map((entry) => entry.loadInKilograms);
        const minLoad = Math.min(...loads);
        const loadRange = Math.max(...loads) - minLoad;
        const maxReps = Math.max(...shown.map((entry) => entry.reps), 1);
        // Horizontal distance between sessions. A single session sits in the middle.
        const slot = shown.length > 1 ? (WIDTH - PADDING_X * 2) / (shown.length - 1) : 0;
        const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(4, slot * 0.55));

        const pending = this.latestIsPending();
        const language = this.language();
        const verdicts = this.t().verdicts;

        return shown.map((entry, index) => {
            const x = shown.length > 1 ? PADDING_X + index * slot : WIDTH / 2;
            const verdict: ShownVerdict =
                pending && index === shown.length - 1
                    ? 'pending'
                    : entry.easy && entry.verdict === 'same'
                      ? 'matched'
                      : entry.verdict;
            const barHeight = (entry.reps / maxReps) * (REPS_BOTTOM - REPS_TOP);
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
                repsLabelY: REPS_BOTTOM - barHeight - LABEL_GAP + 3,
                // A flat load history is drawn as a line through the middle of the chart.
                loadY:
                    loadRange === 0
                        ? (LOAD_TOP + LOAD_BOTTOM) / 2
                        : LOAD_BOTTOM -
                          ((entry.loadInKilograms - minLoad) / loadRange) *
                              (LOAD_BOTTOM - LOAD_TOP),
                loadLabelGap: LABEL_GAP,
                bar: barPath(x, barWidth, barHeight),
                // The tappable column is wider than the marks, to be easy to hit.
                hitX: x - Math.max(slot, barWidth * 2) / 2,
                hitWidth: Math.max(slot, barWidth * 2),
                verdict,
                glyph: GLYPHS[verdict],
                verdictLabel: verdicts[verdict],
                startedAt: entry.startedAt,
                load: formatLoad(language, entry.load, exercise),
                reps: entry.reps,
                sets: entry.sets,
            };
        });
    });

    protected readonly loadLine = computed(() =>
        this.points()
            .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.loadY}`)
            .join(' '),
    );

    /** The session whose numbers are shown under the chart. Starts at the latest one. */
    protected readonly selectedIndex = linkedSignal(() => this.points().length - 1);
    protected readonly selected = computed(() => this.points()[this.selectedIndex()]);

    /** Text alternative for the drawing. */
    protected readonly description = computed(() => {
        const points = this.points();
        const first = points[0];
        const last = points.at(-1);
        const t = this.t();
        return first === undefined || last === undefined
            ? t.noProgress
            : t.describe(points.length, first.reps, first.load, last.reps, last.load);
    });
}
