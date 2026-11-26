import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import {
    CardioAxis,
    CardioComparison,
    CardioPace,
    Direction,
    speedKmh,
} from '@analytics/domain/cardio-progression';
import { CardioRecordKind } from '@analytics/domain/cardio-records';
import { RecordKind } from '@analytics/domain/records';
import { RecordMarkComponent } from '@analytics/presentation/record-mark/record-mark.component';
import {
    cardioRecordName,
    describeBout,
    describeCardio,
    describeComparison,
    describeGoal,
    formatDistance,
    formatDuration,
    formatIncline,
} from '@analytics/domain/cardio-wording';
import { CardioKind } from '@catalog/domain/exercise';
import { Locale } from '@shared/application/locale.service';
import { Language, Localized, formatNumber } from '@shared/domain/language';
import { LocalDatePipe, translations } from '@shared/presentation/i18n';
import { CardioId, CardioPerformed, CardioTotals, cardioTotals } from '@training/domain/cardio';

const TEXT = {
    en: {
        newBaseline: 'New baseline',
        nothingYet: 'Nothing to compare with yet. Today sets the line to match next time.',
        toMatch: 'To match',
        different: 'Today and last time tracked different things, so there is no comparison.',
        beaten: 'Beaten',
        behind: 'Behind',
        matched: 'Matched',
        trade: 'A trade',
        neither: 'Neither ahead nor behind.',
        last: 'Last',
        today: 'Today',
        entries: "Today's entries",
        segments: 'Segments',
        units: { km: 'km', time: 'time', kmh: 'km/h', kcal: 'kcal', climb: 'climb m' },
    },
    ru: {
        newBaseline: 'Новая точка отсчёта',
        nothingYet: 'Сравнивать пока не с чем. Сегодня задаёт планку на следующий раз.',
        toMatch: 'Чтобы повторить',
        different: 'Сегодня и в прошлый раз записано разное, сравнить нельзя.',
        beaten: 'Превзойдено',
        behind: 'Отстаёте',
        matched: 'Повторено',
        trade: 'Размен',
        neither: 'Ни лучше, ни хуже.',
        last: 'Прошлый раз',
        today: 'Сегодня',
        entries: 'Записи за сегодня',
        segments: 'Отрезки',
        units: { km: 'км', time: 'время', kmh: 'км/ч', kcal: 'ккал', climb: 'набор м' },
    },
} satisfies Localized<unknown>;

type Units = (typeof TEXT)['en']['units'];

/** The verdict line above the numbers. */
interface Status {
    readonly headline: string;
    readonly detail: string;
    readonly tone: 'up' | 'down' | 'none';
}

/** The numbers a row can show. Which of them it does show depends on the cardio kind. */
type Column = 'distance' | 'time' | 'speed' | 'climb' | 'calories';

/**
 * The columns of each cardio kind, left to right. A treadmill adds its climb; a timed exercise
 * (a sauna) has its time and nothing else.
 */
const COLUMNS: Readonly<Record<CardioKind, readonly Column[]>> = {
    distance: ['distance', 'time', 'speed', 'calories'],
    treadmill: ['distance', 'time', 'speed', 'climb', 'calories'],
    timed: ['time'],
};

/** One number in a row: `5.25` with `km` under it, coloured when it decided the verdict. */
interface Cell {
    readonly column: Column;
    readonly value: string;
    readonly unit: string;
    readonly tone: Direction | 'none';
    /** This number set today's record: it gets the record mark, coloured by this kind. */
    readonly record: RecordKind | undefined;
}

/** One segment of a treadmill session as a block of its profile (see `profileOf`). */
interface SegmentBlock {
    readonly id: CardioId;
    /** How much of the strip's width it takes: its seconds, or 1 when it recorded no time. */
    readonly grow: number;
    /** How tall its bar is, from 0 (flat) to 1 (the steepest segment of either session). */
    readonly height: number;
    /** Written on the bar: the incline, or nothing on a flat one. */
    readonly incline: string;
    /** The segment in words, for screen readers and for the selection line. */
    readonly text: string;
}

interface BoutChip {
    readonly id: CardioId;
    /** The bout in words: `5 km · 30:00 · 10.0 km/h`. */
    readonly text: string;
}

const EMPTY = '–';

/** Which column shows each axis. A burn rate has no column of its own. */
const COLUMN_OF_AXIS: Partial<Record<CardioAxis, Column>> = {
    distance: 'distance',
    duration: 'time',
    speed: 'speed',
    climb: 'climb',
    calories: 'calories',
};

/**
 * The lifting record each cardio record stands for, which decides the mark's colour. More of an
 * amount (farther, longer, more climb, more calories) is cardio's weight record; faster or a
 * higher burn rate at that amount is its rep record. The same pairing as the cardio records
 * rule in docs/rules/cardio.md.
 */
const LIFTING_KIND: Readonly<Record<CardioRecordKind, RecordKind>> = {
    distance: 'weight',
    calories: 'weight',
    duration: 'weight',
    climb: 'weight',
    speed: 'reps',
    'burn-rate': 'reps',
};

/** Which column carries the biceps for each kind of record. A burn rate goes on calories. */
const COLUMN_OF_RECORD: Readonly<Record<CardioRecordKind, Column>> = {
    distance: 'distance',
    duration: 'time',
    speed: 'speed',
    climb: 'climb',
    calories: 'calories',
    'burn-rate': 'calories',
};

const sentence = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/** The columns of a row for this cardio kind. Unknown numbers show a dash. */
function cellsOf(
    language: Language,
    units: Units,
    kind: CardioKind,
    totals: CardioTotals,
    comparison?: CardioComparison,
    record?: CardioRecordKind,
): readonly Cell[] {
    // "5.25 km" is split into its number and its unit, which are styled differently.
    const [distance = EMPTY, distanceUnit = units.km] =
        totals.distanceMeters === undefined
            ? []
            : formatDistance(language, totals.distanceMeters).split(' ');
    const speed = speedKmh(totals);

    const values: Readonly<Record<Column, readonly [value: string, unit: string]>> = {
        distance: [distance, distanceUnit],
        time: [
            totals.durationSeconds === undefined ? EMPTY : formatDuration(totals.durationSeconds),
            units.time,
        ],
        speed: [speed === undefined ? EMPTY : formatNumber(language, speed, 1), units.kmh],
        climb: [
            totals.climbMeters === undefined ? EMPTY : String(Math.round(totals.climbMeters)),
            units.climb,
        ],
        calories: [totals.calories === undefined ? EMPTY : String(totals.calories), units.kcal],
    };
    const tones = new Map(
        (comparison?.axes ?? []).map(({ axis, direction }) => [COLUMN_OF_AXIS[axis], direction]),
    );
    const recordColumn = record === undefined ? undefined : COLUMN_OF_RECORD[record];

    return COLUMNS[kind].map((column) => {
        const [value, unit] = values[column];
        return {
            column,
            value,
            unit,
            tone: tones.get(column) ?? 'none',
            record:
                record !== undefined && column === recordColumn ? LIFTING_KIND[record] : undefined,
        };
    });
}

/**
 * A treadmill session as a profile: one block per segment, as wide as its time and as tall as
 * its incline, like the hill a treadmill draws on its own display.
 *
 *              ┌──┐
 *        ┌─────┤  ├────┐
 *     ───┘     │  │    └──      walk flat, run at 4%, a steep 10%, 4% again, cool down
 *
 * @param steepest - the steepest incline of both sessions on screen, so that the two profiles
 *   share one scale and a lower hill today looks lower.
 */
function profileOf(
    language: Language,
    bouts: readonly CardioPerformed[],
    steepest: number,
): readonly SegmentBlock[] {
    return bouts.map((bout) => {
        const incline = bout.incline ?? 0;
        return {
            id: bout.id,
            grow: bout.durationSeconds ?? 1,
            height: steepest === 0 ? 0 : incline / steepest,
            incline: incline === 0 ? '' : formatIncline(language, incline),
            text: describeBout(language, bout),
        };
    });
}

const steepestOf = (bouts: readonly CardioPerformed[]): number =>
    Math.max(0, ...bouts.map((bout) => bout.incline ?? 0));

/**
 * The middle of the cardio logging screen: last session against today's, as two rows of the same
 * four numbers (distance, time, speed, calories) under a one-line verdict.
 *
 * Today's row is there from the start, filled with dashes, so nothing jumps when a bout is
 * logged. Speed is worked out here from distance and time; it is never typed in or stored.
 */
@Component({
    selector: 'olab-cardio-compare',
    imports: [LocalDatePipe, NgTemplateOutlet, RecordMarkComponent],
    templateUrl: './cardio-compare.component.html',
    styleUrl: './cardio-compare.component.scss',
})
export class CardioCompareComponent {
    readonly pace = input.required<CardioPace>();
    /** Today's bouts, in order. Each is listed and can be tapped to select it (for voiding). */
    readonly bouts = input.required<readonly CardioPerformed[]>();
    /** What the exercise records: decides the columns, and whether segments are drawn. */
    readonly kind = input<CardioKind>('distance');
    /** The bouts of the session compared against, for its segment profile (treadmill only). */
    readonly lastBouts = input<readonly CardioPerformed[]>([]);
    /** The record today's session has set so far, if any (see `cardioRecords`). */
    readonly record = input<CardioRecordKind>();
    readonly selectedId = input<CardioId>();
    readonly selected = output<CardioId>();

    protected readonly t = translations(TEXT);
    private readonly language = inject(Locale).language;

    protected readonly status = computed<Status>(() => {
        const { previous, current, comparison } = this.pace();
        const language = this.language();
        const t = this.t();
        if (previous === undefined) {
            return { headline: t.newBaseline, detail: t.nothingYet, tone: 'none' };
        }
        const goal = describeGoal(language, previous);
        if (current === undefined) {
            return { headline: t.toMatch, detail: goal, tone: 'none' };
        }
        if (comparison === undefined) {
            return { headline: t.newBaseline, detail: t.different, tone: 'none' };
        }

        const words = sentence(describeComparison(language, comparison));
        // Matching last time is the aim ("Cardio match rule" in docs/rules/cardio.md), so `same` is
        // a success in green, like beating it. Only falling short is red.
        switch (comparison.outcome) {
            case 'up':
                return { headline: t.beaten, detail: words, tone: 'up' };
            case 'down':
                return { headline: t.behind, detail: `${words} ${goal}`, tone: 'down' };
            case 'same':
                return { headline: t.matched, detail: words, tone: 'up' };
            case 'mixed':
                return { headline: t.trade, detail: `${words} ${t.neither}`, tone: 'none' };
        }
    });

    protected readonly lastCells = computed(() => {
        const previous = this.pace().previous;
        return previous === undefined
            ? undefined
            : cellsOf(this.language(), this.t().units, this.kind(), previous);
    });

    /**
     * Today's row: all of today's bouts added up, which is what the verdict is about. Before the
     * first bout it is four dashes holding the place.
     */
    protected readonly todayCells = computed(() => {
        const { current, comparison } = this.pace();
        return current === undefined
            ? undefined
            : cellsOf(
                  this.language(),
                  this.t().units,
                  this.kind(),
                  current,
                  comparison,
                  this.record(),
              );
    });

    /** "Distance record" and the like, next to the "Today" label: which record it is. */
    protected readonly recordLabel = computed(() => {
        const record = this.record();
        return record === undefined ? undefined : cardioRecordName(this.language(), record);
    });

    /**
     * Each bout of today as a small chip under the row. Tapping one selects it, which is how a
     * mistyped bout is voided. Chips rather than a full row each, so that a session of several
     * bouts still fits the screen without scrolling.
     */
    protected readonly chips = computed<readonly BoutChip[]>(() =>
        // A treadmill's segments are the blocks of its profile instead (see `todayProfile`).
        this.kind() === 'treadmill'
            ? []
            : this.bouts().map((bout) => ({
                  id: bout.id,
                  text: describeCardio(this.language(), cardioTotals([bout])),
              })),
    );

    /** One scale for both profiles: the steepest segment of last time and of today. */
    private readonly steepest = computed(() =>
        Math.max(steepestOf(this.lastBouts()), steepestOf(this.bouts())),
    );

    /** Last session's segments, under its numbers. Treadmill only, and only when it has any. */
    protected readonly lastProfile = computed(() =>
        this.kind() === 'treadmill'
            ? profileOf(this.language(), this.lastBouts(), this.steepest())
            : [],
    );

    /**
     * Today's segments, under today's numbers. Each is a button: tapping one selects it, which
     * is how a mistyped segment is voided.
     */
    protected readonly todayProfile = computed(() =>
        this.kind() === 'treadmill'
            ? profileOf(this.language(), this.bouts(), this.steepest())
            : [],
    );

    /** Today's row before anything is logged: four dashes holding the place. */
    protected readonly emptyCells = computed(() =>
        cellsOf(this.language(), this.t().units, this.kind(), {}),
    );
}
