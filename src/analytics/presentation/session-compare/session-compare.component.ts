import { NgTemplateOutlet } from '@angular/common';
import { Component, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { Progression } from '@analytics/domain/progression';
import { RecordKind } from '@analytics/domain/records';
import { RecordMarkComponent } from '@analytics/presentation/record-mark/record-mark.component';
import { SessionPace } from '@analytics/domain/session-pace';
import { CatalogService } from '@catalog/application/catalog.service';
import { Exercise } from '@catalog/domain/exercise';
import { TechniqueId } from '@catalog/domain/technique';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { LocalDatePipe, translations } from '@shared/presentation/i18n';
import { SetId, SetPerformed, isEasy } from '@training/domain/set';
import { groupSetsByLoad } from '@training/domain/set-rows';
import { formatLoad } from '@training/presentation/set-format';

/** One set as drawn in the table: its rep tiles with the load written underneath. */
interface CellView {
    readonly id: SetId;
    /** One tile per technique used in the set, in the order first performed. */
    readonly tiles: readonly { readonly reps: number; readonly technique: TechniqueId }[];
    readonly load: string;
    readonly failure: boolean;
    /** Done easy on purpose: a mint dot where the failure dot would be. */
    readonly light: boolean;
    /** An easy set (far from failure): a mint ring in the same place. */
    readonly easy: boolean;
    readonly warmUp: boolean;
    readonly tone: Progression | undefined;
    /** Set when today's set is a personal record. Never on last time's sets. */
    readonly record: RecordKind | undefined;
    /** "22 kg × 6", or "22 kg × 5 + 3" for full reps followed by partials. */
    readonly text: string;
}

/** One column of the table: the n-th working set of last time above the n-th of today. */
interface ColumnView {
    readonly heading: string;
    readonly last?: CellView;
    readonly today?: CellView;
    /** Last time's set shown as an outline in today's row: the set to match next. */
    readonly target?: CellView;
}

interface StatusView {
    readonly tone: 'up' | 'same' | 'down' | 'none';
    readonly headline: string;
}

const TEXT = {
    en: {
        warmUpHeading: 'W',
        newBaseline: 'New baseline',
        beatTopRow: 'Beat the top row',
        beaten: 'Last time is beaten',
        level: 'Level with last time',
        matched: 'Last time is matched',
        below: 'Below last time',
        ahead: 'Ahead of last time',
        behind: 'Behind last time',
        warmUp: 'Warm-up',
        set: (heading: string) => `Set ${heading}`,
        plus: ' plus ',
        toFailure: 'to failure',
        light: 'light',
        easy: 'easy',
        records: {
            weight: 'weight record',
            reps: 'rep record',
            both: 'weight and rep record',
        } satisfies Record<RecordKind, string>,
        last: 'Last',
        today: 'Today',
        reps: 'reps',
        lastTime: 'Last time, ',
        todayLabel: 'Today, ',
        nextSet: 'Next set, to match: ',
    },
    ru: {
        warmUpHeading: 'Р',
        newBaseline: 'Новая точка отсчёта',
        beatTopRow: 'Превзойдите верхний ряд',
        beaten: 'Прошлый раз превзойдён',
        level: 'Наравне с прошлым разом',
        matched: 'Прошлый раз повторён',
        below: 'Меньше, чем в прошлый раз',
        ahead: 'Впереди прошлого раза',
        behind: 'Отстаёте от прошлого раза',
        warmUp: 'Разминка',
        set: (heading: string) => `Подход ${heading}`,
        plus: ' плюс ',
        toFailure: 'до отказа',
        light: 'легко',
        easy: 'без усилия',
        records: {
            weight: 'рекорд веса',
            reps: 'рекорд повторов',
            both: 'рекорд веса и повторов',
        },
        last: 'Прошлый раз',
        today: 'Сегодня',
        reps: 'повт.',
        lastTime: 'Прошлый раз, ',
        todayLabel: 'Сегодня, ',
        nextSet: 'Следующий подход, повторить: ',
    },
} satisfies Localized<unknown>;

const totalReps = (sets: readonly SetPerformed[]): number =>
    sets.flatMap((set) => set.repGroups).reduce((sum, group) => sum + group.reps, 0);

/**
 * The centre of the logging screen: last session and today's session as two rows of rep tiles,
 * lined up set by set, so that one glance answers "am I ahead?" and "what should the next set
 * be?".
 *
 *     AHEAD OF LAST TIME
 *
 *              1     2     3     4
 *     LAST    [8]   [8]   [6]   [5]
 *     TODAY   [9]   [8]   ┆6┆            <- dashed: the set to match next
 *
 * All the judging is done by the `sessionPace` projection; this component only words and draws
 * the result.
 */
@Component({
    selector: 'olab-session-compare',
    imports: [LocalDatePipe, NgTemplateOutlet, RecordMarkComponent],
    templateUrl: './session-compare.component.html',
    styleUrl: './session-compare.component.scss',
})
export class SessionCompareComponent {
    private readonly catalog = inject(CatalogService).catalog;
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    /**
     * False until the screen has drawn once. The entry animations (a set stamped in, a record
     * popping, the verdict wiping in) are for what changes while you watch, not for opening the
     * screen, so they are switched on only after the first render. `animate.enter` reads these
     * class names when an element appears; an empty one means no animation.
     */
    private readonly ready = signal(false);
    protected readonly stamp = computed(() => (this.ready() ? 'cell--stamp' : ''));
    protected readonly pop = computed(() => (this.ready() ? 'record--pop' : ''));
    protected readonly wipe = computed(() => (this.ready() ? 'status__headline--wipe' : ''));

    constructor() {
        afterNextRender(() => {
            this.ready.set(true);
        });
    }

    readonly exercise = input.required<Exercise>();
    readonly pace = input.required<SessionPace>();
    /** Today's warm-up sets. They take no part in the comparison but must stay visible. */
    readonly warmUps = input<readonly SetPerformed[]>([]);
    /** Progression of today's sets, for the bar under each one. */
    readonly tones = input<ReadonlyMap<SetId, Progression>>();
    /** Today's personal records, for the biceps on their tiles. */
    readonly records = input<ReadonlyMap<SetId, RecordKind>>();
    readonly selectedId = input<SetId>();
    /** Emits the id of the tapped set (today's sets only). */
    readonly selected = output<SetId>();

    protected readonly lastReps = computed(() => totalReps(this.pace().previous));
    protected readonly todayReps = computed(() => totalReps(this.pace().current));

    protected readonly columns = computed<readonly ColumnView[]>(() => {
        const { previous, current, next } = this.pace();
        const count = Math.max(previous.length, current.length);

        const heading = this.t().warmUpHeading;
        const warmUps = this.warmUps().map((set) => ({ heading, today: this.cell(set, true) }));
        // `Array.from({ length })` with a mapper is the idiomatic "for i in 0..count".
        const working = Array.from({ length: count }, (_, index): ColumnView => {
            const last = previous[index];
            const today = current[index];
            // Optional properties are spread in only when present, as required by
            // `exactOptionalPropertyTypes`.
            return {
                heading: String(index + 1),
                ...(last === undefined ? {} : { last: this.cell(last) }),
                ...(today === undefined ? {} : { today: this.cell(today, true) }),
                ...(last !== undefined && last === next ? { target: this.cell(last) } : {}),
            };
        });
        return [...warmUps, ...working];
    });

    /**
     * The verdict, one coloured line. What the next set needs is not spelled out: the dashed
     * outline in today's row already shows it, and the line saves a row of screen height.
     */
    protected readonly status = computed<StatusView>(() => {
        const { previous, current, next, soFar, session, easy } = this.pace();
        const t = this.t();

        if (previous.length === 0) {
            return { tone: 'none', headline: t.newBaseline };
        }
        if (current.length === 0) {
            return { tone: 'none', headline: t.beatTopRow };
        }
        // A session is judged as a whole, so this can already be true with sets still to go.
        if (session === 'up') {
            return { tone: 'up', headline: t.beaten };
        }
        // No set of last time left to match: the session as a whole is all there is to judge.
        if (next === undefined) {
            if (session !== 'same') {
                return { tone: 'down', headline: t.below };
            }
            // An easy session aims to match last time, so level is a success: green, like
            // beaten. With real effort, level is only level (see "Easy session rule").
            return easy ? { tone: 'up', headline: t.matched } : { tone: 'same', headline: t.level };
        }
        switch (soFar) {
            case 'up':
                return { tone: 'up', headline: t.ahead };
            case 'down':
                return { tone: 'down', headline: t.behind };
            default:
                return { tone: 'same', headline: t.level };
        }
    });

    /**
     * A set as drawn. `isToday`: only today's row shows records; last time's row stays about
     * last time against today.
     */
    private cell(set: SetPerformed, isToday = false): CellView {
        // `groupSetsByLoad` is the projection behind the set grid. For a single set it yields
        // one row, which carries exactly what a cell needs: the loads and the reps per technique.
        const row = groupSetsByLoad([set])[0];
        const tiles = row?.cells[0]?.repsByTechnique ?? [];
        const load = (row?.loads ?? [])
            .map((entry) => formatLoad(this.language(), entry, this.exercise()))
            .join(' → ');
        return {
            id: set.id,
            tiles,
            load,
            failure: set.effort?.kind === 'failure',
            light: set.effort?.kind === 'light',
            easy: isEasy(set),
            warmUp: set.kind === 'warmup',
            tone: this.tones()?.get(set.id),
            record: isToday ? this.records()?.get(set.id) : undefined,
            text: `${load} × ${tiles.map((tile) => tile.reps).join(' + ')}`,
        };
    }

    /** Spoken description of one of today's sets, e.g. "Set 2, 22 kg × 8, to failure". */
    protected label(column: ColumnView, cell: CellView): string {
        const t = this.t();
        const language = this.language();
        const name = cell.warmUp ? t.warmUp : t.set(column.heading);
        const techniques = cell.tiles
            .map(
                (tile) =>
                    `${tile.reps} ${this.catalog().findTechnique(tile.technique)?.name[language] ?? tile.technique}`,
            )
            .join(t.plus);
        return [
            name,
            cell.load,
            techniques,
            ...(cell.failure ? [t.toFailure] : []),
            ...(cell.light ? [t.light] : []),
            ...(cell.easy ? [t.easy] : []),
            ...(cell.record === undefined ? [] : [t.records[cell.record]]),
        ].join(', ');
    }
}
