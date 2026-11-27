import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { describeBout, describeCardio } from '@analytics/domain/cardio-wording';
import { RecordKind } from '@analytics/domain/records';
import { CatalogService } from '@catalog/application/catalog.service';
import { GamificationService } from '@gamification/application/gamification.service';
import { SettingsService } from '@settings/application/settings.service';
import { Clock } from '@shared/application/clock.service';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { LocalDatePipe, translations } from '@shared/presentation/i18n';
import { ProgramsService } from '@training/application/programs.service';
import { TrainingService } from '@training/application/training.service';
import { SlideConfirmComponent } from '@shared/presentation/slide-confirm/slide-confirm.component';
import { CardioId, cardioTotals } from '@training/domain/cardio';
import { SetId } from '@training/domain/set';
import {
    DayBlock,
    DayExercise,
    DayKey,
    addDays,
    addMonths,
    dateOfDay,
    dayKeyOf,
    historyDays,
    monthOf,
    neighbourDay,
    weekOf,
} from '@training/domain/day-history';
import { SetGridComponent } from '@training/presentation/set-grid/set-grid.component';
import { HistoryPosition } from './history-position.service';
import { dayTitle, programTitle } from '../programs/program-wording';

const TEXT = {
    en: {
        heading: 'History',
        previousDay: 'Previous day with something logged',
        nextDay: 'Next day with something logged',
        previousMonth: 'Previous month',
        nextMonth: 'Next month',
        chooseDay: 'Choose a day',
        week: 'Days of this week',
        workout: 'Workout',
        standalone: 'Standalone',
        restDay: 'Rest day. Nothing was logged.',
        nothing: 'Nothing logged yet. Your first set will show up here.',
        logged: 'something logged',
        today: 'today',
        edit: 'Edit',
        done: 'Done',
        pick: 'Tap an entry to delete it.',
        slideToDelete: 'Slide to delete',
        logOnThisDay: 'Log on this day',
        saveAsProgram: 'Save as a program',
        at: 'At',
        start: 'Start logging',
        pastHint:
            'The app goes back to that moment: what you log lands there, as part of that day. "Back to now" at the top returns.',
        notPast: 'That time has not come yet.',
        records: {
            weight: 'Weight record',
            reps: 'Rep record',
            both: 'Weight and rep record',
        } satisfies Record<RecordKind, string>,
    },
    ru: {
        heading: 'История',
        previousDay: 'Предыдущий день с записями',
        nextDay: 'Следующий день с записями',
        previousMonth: 'Предыдущий месяц',
        nextMonth: 'Следующий месяц',
        chooseDay: 'Выбрать день',
        week: 'Дни этой недели',
        workout: 'Тренировка',
        standalone: 'Вне тренировки',
        restDay: 'День отдыха. Ничего не записано.',
        nothing: 'Пока ничего не записано. Первый подход появится здесь.',
        logged: 'есть записи',
        today: 'сегодня',
        edit: 'Править',
        done: 'Готово',
        pick: 'Нажмите на запись, чтобы удалить её.',
        slideToDelete: 'Сдвиньте, чтобы удалить',
        logOnThisDay: 'Записать в этот день',
        saveAsProgram: 'Сохранить как программу',
        at: 'Время',
        start: 'Начать запись',
        pastHint:
            'Приложение вернётся в этот момент: всё записанное попадёт туда, в этот день. «К настоящему» вверху экрана возвращает обратно.',
        notPast: 'Это время ещё не наступило.',
        records: {
            weight: 'Рекорд веса',
            reps: 'Рекорд повторов',
            both: 'Рекорд веса и повторов',
        },
    },
} satisfies Localized<unknown>;

/** A swipe must travel this far sideways (px) to count; shorter is a tap that drifted. */
const SWIPE_DISTANCE = 60;
/**
 * How long the pages take to settle after the finger lets go (ms). Short on purpose: the
 * motion only has to say "that was a swipe", and must never make a fast reader wait. Keep it
 * the same as the transition of `.track` in the styles.
 */
const SETTLE_MS = 130;
/** A finger must move this far (px) before the drag is taken for sideways or for scrolling. */
const DRAG_SLOP = 8;
/** Faster than this (px per ms) is a flick: it turns the page without going a quarter across. */
const FLICK_SPEED = 0.5;
/**
 * A touch that starts this close (px) to a screen edge is left alone: on Android an edge swipe
 * is the system's back gesture, and the page must not also turn on it.
 */
const EDGE = 24;

/** A day as a cell of the week strip or the calendar. */
interface DayCell {
    readonly day: DayKey;
    readonly date: Date;
    /** Something was logged on it: a dot under the number. */
    readonly active: boolean;
    readonly selected: boolean;
    readonly today: boolean;
    /** Days after today cannot be chosen: nothing can have happened on them. */
    readonly future: boolean;
}

/**
 * History: everything that was logged, one day per screen.
 *
 *     ‹   NOVEMBER 2026   ›        the month opens a calendar
 *     M   T   W   T   F   S   S    swipe the strip: a week at a time
 *     9   10  11  12  13  14 [15]
 *     ·       ·       ·       ·    a dot: something was logged
 *
 *     07:10  STANDALONE            the day's blocks, in the order started
 *     18:30  WORKOUT  1:12         swipe here: the nearest day with something logged
 *
 * All the grouping is done by the `historyDays` projection; this page chooses the day and words
 * what the projection gives. It is also where the past is corrected (see "History rule"):
 * - **Edit** lets an entry of the day be tapped and deleted with a slide. Deleting is voiding:
 *   a `SetVoided` or `CardioVoided` is appended, nothing is removed from the log.
 * - **Log on this day** sends the app's clock back to a moment of that day
 *   (`Clock.logInThePast`), so that what is logged next lands there.
 */
@Component({
    selector: 'olab-history',
    imports: [LocalDatePipe, NgTemplateOutlet, RouterLink, SetGridComponent, SlideConfirmComponent],
    templateUrl: './history.component.html',
    styleUrl: './history.component.scss',
})
export class HistoryComponent {
    private readonly training = inject(TrainingService);
    private readonly programs = inject(ProgramsService);
    private readonly analytics = inject(AnalyticsService);
    private readonly gamification = inject(GamificationService);
    private readonly settings = inject(SettingsService);
    private readonly catalog = inject(CatalogService).catalog;
    private readonly language = inject(Locale).language;
    private readonly clock = inject(Clock);
    private readonly router = inject(Router);
    protected readonly t = translations(TEXT);

    /** True while entries can be tapped to delete them; exercises then stop being links. */
    protected readonly editing = signal(false);
    /** The set or cardio bout tapped while editing: the one the slide deletes. */
    protected readonly marked = signal<SetId | CardioId | undefined>(undefined);
    /** True once "Log on this day" was tapped: the time field and its button are shown. */
    protected readonly backfilling = signal(false);
    /** Said when the moment chosen for "Log on this day" is still ahead. */
    protected readonly notPast = signal(false);

    private readonly days = computed(() =>
        historyDays(this.training.workouts(), this.training.sets()),
    );
    /** The days with something logged, oldest first: what a swipe moves between. */
    private readonly loggedDays = computed(() => this.days().map((each) => each.day));
    private readonly logged = computed(() => new Set(this.loggedDays()));
    protected readonly empty = computed(() => this.days().length === 0);

    private readonly today = computed(() => dayKeyOf(this.clock.now()));
    /** Where the page opens: the latest day with something on it, or today in an empty log. */
    private readonly latest = computed(() => this.loggedDays().at(-1) ?? this.today());

    private readonly position = inject(HistoryPosition);

    /**
     * The day on screen: the one the page was left on (`HistoryPosition`, so coming back from an
     * exercise's statistics returns here), else the latest day with something logged.
     */
    protected readonly selected = computed(() => this.position.day() ?? this.latest());
    protected readonly selectedDate = computed(() => dateOfDay(this.selected()));

    /**
     * The day in the middle of the screen. Normally the selected one; while the pages are
     * still settling after a swipe it stays the old one, so the picker above can move on at once
     * while the pages change places only when the motion is over.
     */
    private readonly leaving = signal<DayKey | undefined>(undefined);
    private readonly displayed = computed(() => this.leaving() ?? this.selected());

    protected readonly previous = computed(() =>
        neighbourDay(this.loggedDays(), this.selected(), -1),
    );
    protected readonly next = computed(() => neighbourDay(this.loggedDays(), this.selected(), 1));

    /** The calendar takes the place of the week strip while it is open. */
    protected readonly calendarOpen = signal(false);
    /** Any day of the month the calendar shows. It follows the selected day until paged. */
    protected readonly calendarMonth = linkedSignal(() => this.selected());
    protected readonly calendarDate = computed(() => dateOfDay(this.calendarMonth()));

    protected readonly week = computed(() => weekOf(this.selected()).map((day) => this.cell(day)));
    protected readonly month = computed(() =>
        monthOf(this.calendarMonth()).map((row) =>
            row.map((day) => (day === undefined ? undefined : this.cell(day))),
        ),
    );

    private cell(day: DayKey): DayCell {
        return {
            day,
            date: dateOfDay(day),
            active: this.logged().has(day),
            selected: day === this.selected(),
            today: day === this.today(),
            future: day > this.today(),
        };
    }

    /** "Sunday 15 November, something logged, today": what a screen reader says for a cell. */
    protected describe(cell: DayCell): string {
        const t = this.t();
        return [...(cell.active ? [t.logged] : []), ...(cell.today ? [t.today] : [])].join(', ');
    }

    /**
     * A day arriving from further away than the next logged one (a tap on the strip or the
     * calendar): it is put on the side it comes from, in place of the neighbour.
     */
    private readonly arriving = signal<DayKey | undefined>(undefined);

    /** The logged days on either side of the one in the middle: what a drag reveals. */
    private readonly before = computed(() => neighbourDay(this.loggedDays(), this.displayed(), -1));
    private readonly after = computed(() => neighbourDay(this.loggedDays(), this.displayed(), 1));

    /**
     * The three pages of the pager: the day in the middle and the one on each side, already
     * drawn so that it is there the moment a swipe starts. A side with no day to go to has no
     * page.
     */
    protected readonly pages = computed(() => {
        const middle = this.displayed();
        const arriving = this.arriving();
        const left = arriving !== undefined && arriving < middle ? arriving : this.before();
        const right = arriving !== undefined && arriving > middle ? arriving : this.after();
        return [
            ...(left === undefined ? [] : [this.page(left, 'before' as const)]),
            this.page(middle, 'middle' as const),
            ...(right === undefined ? [] : [this.page(right, 'after' as const)]),
        ];
    });

    /** One day, worded and with everything the template draws. */
    private page<Place extends string>(
        day: DayKey,
        place: Place,
    ): {
        readonly place: Place;
        readonly date: Date;
        readonly xp: number | undefined;
        readonly blocks: readonly {
            readonly id: string;
            readonly kind: DayBlock['kind'];
            readonly startedAt: DayBlock['startedAt'];
            readonly duration: string | undefined;
            /** `Split · Day 2`, for a workout that was a program day. */
            readonly programDay: string | undefined;
            readonly exercises: readonly ReturnType<HistoryComponent['exerciseView']>[];
        }[];
    } {
        const blocks = this.days().find((each) => each.day === day)?.blocks ?? [];
        return {
            place,
            date: dateOfDay(day),
            xp: this.xpOf(day),
            blocks: blocks.map((block) => ({
                id: `${block.kind}-${block.startedAt}-${block.exercises[0]?.exerciseId ?? ''}`,
                kind: block.kind,
                startedAt: block.startedAt,
                duration: durationOf(block),
                programDay: block.kind === 'workout' ? this.programDayOf(block) : undefined,
                exercises: block.exercises.map((exercise) => this.exerciseView(block, exercise)),
            })),
        };
    }

    /** Which program day a workout was, in words; undefined for one done on a whim. */
    private programDayOf(block: DayBlock): string | undefined {
        const mark = this.programs.workoutDays().get(block.startedAt);
        const program = this.programs.programs().find((other) => other.id === mark?.programId);
        const index = program?.days.findIndex((day) => day.id === mark?.dayId) ?? -1;
        if (program === undefined || index < 0) {
            return undefined;
        }
        const language = this.language();
        return `${programTitle(program, this.catalog(), language)} · ${dayTitle(index, language)}`;
    }

    private exerciseView(
        block: DayBlock,
        { exerciseId, sets, bouts }: DayExercise,
    ): {
        readonly id: string;
        readonly name: string;
        readonly cardio: string | undefined;
        /** A cardio exercise's bouts one by one, for picking the one to delete. */
        readonly bouts: readonly { readonly id: CardioId; readonly text: string }[];
        readonly sets: DayExercise['sets'];
        readonly tones: ReturnType<AnalyticsService['progressionOf']> | undefined;
        readonly record: string | undefined;
    } {
        const name = this.catalog().findExercise(exerciseId)?.name[this.language()] ?? exerciseId;
        if (bouts.length > 0) {
            // Cardio is told in words, as on its statistics page: "5 km in 30:00, 10.0 km/h".
            const cardio = describeCardio(this.language(), cardioTotals(bouts));
            return {
                id: exerciseId,
                name,
                cardio,
                bouts: bouts.map((bout) => ({
                    id: bout.id,
                    text: describeBout(this.language(), bout),
                })),
                sets: [],
                tones: undefined,
                record: undefined,
            };
        }
        // The two histories are never mixed (see "Standalone set rule"), so the colouring and
        // the records of a block come from the history its sets belong to.
        const sessions =
            block.kind === 'standalone'
                ? this.training.standaloneSessionsOf(exerciseId)
                : this.training.sessionsOf(exerciseId);
        const records = this.analytics.recordsOf(sessions);
        const kinds = sets.flatMap((set) => records.get(set.id) ?? []);
        // One line for the exercise: the weight record (or both) outranks the rep record.
        const kind = kinds.find((each) => each !== 'reps') ?? kinds[0];
        return {
            id: exerciseId,
            name,
            cardio: undefined,
            bouts: [],
            sets,
            tones: this.analytics.progressionOf(sessions),
            record: kind === undefined ? undefined : this.t().records[kind],
        };
    }

    /**
     * The experience earned on a day, in whole points; `undefined` when gamification is off
     * (then experience is never even derived) or the day earned nothing.
     */
    private xpOf(day: DayKey): number | undefined {
        if (!this.settings.preferences().gamification) {
            return undefined;
        }
        const earned = this.gamification
            .experience()
            .entries.filter((entry) => dayKeyOf(entry.at) === day)
            .reduce((sum, entry) => sum + entry.xp, 0);
        return earned >= 1 ? Math.floor(earned) : undefined;
    }

    /** Whether the marked entry is one of `sets`: then the slide goes under that exercise. */
    protected holdsMarked(sets: DayExercise['sets']): boolean {
        return sets.some((set) => set.id === this.marked());
    }

    protected toggleEditing(): void {
        this.editing.update((editing) => !editing);
        this.marked.set(undefined);
    }

    /** Tapping an entry marks it for deleting; tapping it again lets it go. */
    protected mark(id: SetId | CardioId): void {
        this.marked.update((current) => (current === id ? undefined : id));
    }

    /**
     * Deletes the marked entry. "Deleting" in an event log is voiding: one more event that says
     * the entry was a mistake, after which no projection counts it.
     */
    protected async deleteMarked(kind: 'set' | 'cardio'): Promise<void> {
        const id = this.marked();
        if (id === undefined) {
            return;
        }
        this.marked.set(undefined);
        // The template knows which list the entry was tapped in, so it says which kind it is;
        // the two id types are both strings and cannot be told apart at run time.
        if (kind === 'set') {
            await this.training.voidSet(id as SetId);
        } else {
            await this.training.voidCardio(id as CardioId);
        }
    }

    /**
     * Goes back to `time` (`HH:mm`, from a time field) on the day on screen and opens Train, so
     * that whatever is logged next lands there. Refused when that moment is still ahead.
     */
    protected logOnThisDay(time: string): void {
        const [hours = Number.NaN, minutes = Number.NaN] = time.split(':').map(Number);
        const moment = dateOfDay(this.selected());
        moment.setHours(hours, minutes, 0, 0);
        const moved = this.clock.logInThePast(moment);
        this.notPast.set(!moved);
        if (moved) {
            this.backfilling.set(false);
            void this.router.navigate(['/exercises']);
        }
    }

    /*
     * The pager. The three pages sit side by side on one track, and the track is moved: by
     * `drag` pixels under the finger, and by one whole page (`turn`) when the day changes. The
     * next day is therefore on screen from the first pixel of a swipe, as in a native pager,
     * and letting go only has to finish the movement.
     */

    /** How far the finger has pulled the track sideways, in px. */
    protected readonly drag = signal(0);
    /** Which page the track rests on: 0 the middle one, 1 the one after, -1 the one before. */
    protected readonly turn = signal<-1 | 0 | 1>(0);
    /** True while the track must move at once: under the finger, or swapping the pages round. */
    protected readonly instant = signal(true);
    /**
     * Counts the turns started. The end of an older turn (its timer fires late) sees a newer
     * number and does nothing, so a quick second swipe never fights the first.
     */
    private run = 0;

    /** Shows `day`: the track turns to its page, then the pages change places unseen. */
    private show(day: DayKey): void {
        const from = this.displayed();
        if (day === from) {
            this.release();
            return;
        }
        const run = ++this.run;
        // Another day: whatever was being edited or set up on the old one is dropped.
        this.editing.set(false);
        this.marked.set(undefined);
        this.backfilling.set(false);
        this.notPast.set(false);
        this.leaving.set(from);
        this.arriving.set(day);
        this.position.day.set(day);
        // Ease from wherever the finger left the track to the page of the new day.
        this.instant.set(false);
        this.drag.set(0);
        this.turn.set(day > from ? 1 : -1);

        setTimeout(() => {
            if (run === this.run) {
                this.rest();
            }
        }, SETTLE_MS);
    }

    /**
     * The turn is over: the new day becomes the middle page and the track goes back to the
     * middle, both at once and without easing, so nothing is seen to move.
     */
    private rest(): void {
        this.instant.set(true);
        this.leaving.set(undefined);
        this.arriving.set(undefined);
        this.turn.set(0);
        this.drag.set(0);
    }

    /** A drag given up: the track eases back to the page it was on. */
    private release(): void {
        this.instant.set(false);
        this.drag.set(0);
    }

    protected select(day: DayKey): void {
        this.show(day);
        this.calendarOpen.set(false);
    }

    /** The arrows beside the month: a logged day at a time, or a month while the calendar is open. */
    protected step(direction: -1 | 1): void {
        if (this.calendarOpen()) {
            this.calendarMonth.update((day) => addMonths(day, direction));
            return;
        }
        const day = direction === 1 ? this.next() : this.previous();
        if (day !== undefined) {
            this.show(day);
        }
    }

    protected canStep(direction: -1 | 1): boolean {
        return (
            this.calendarOpen() || (direction === 1 ? this.next() : this.previous()) !== undefined
        );
    }

    /** A year at a time, for going far back. */
    protected stepYear(direction: -1 | 1): void {
        this.calendarMonth.update((day) => addMonths(day, 12 * direction));
    }

    /** A week at a time: the same weekday, which may be a rest day. Never past this week. */
    private stepWeek(direction: -1 | 1): void {
        const day = addDays(this.selected(), 7 * direction);
        if ((weekOf(day)[0] ?? day) <= this.today()) {
            this.show(day > this.today() ? this.today() : day);
        }
    }

    /*
     * Touch. Touch events rather than a gesture library: a few handlers are all it takes, and
     * `touch-action: pan-y` (see the styles) leaves vertical scrolling to the browser while
     * still sending us the sideways moves.
     */

    /** Where a touch that may become a swipe began; `undefined` when it cannot (see `begin`). */
    private touchFrom:
        | { readonly x: number; readonly y: number; readonly at: number; axis?: 'across' | 'along' }
        | undefined;

    private begin(event: TouchEvent): void {
        const touch = event.touches[0];
        const fromEdge =
            touch !== undefined &&
            (touch.clientX < EDGE || touch.clientX > window.innerWidth - EDGE);
        // Two fingers are a pinch, not a swipe.
        this.touchFrom =
            touch === undefined || event.touches.length > 1 || fromEdge
                ? undefined
                : { x: touch.clientX, y: touch.clientY, at: event.timeStamp };
    }

    /** The week strip: one swipe is one week. Nothing follows the finger there. */
    protected weekTouchStart(event: TouchEvent): void {
        this.begin(event);
    }

    protected weekTouchEnd(event: TouchEvent): void {
        const from = this.touchFrom;
        const touch = event.changedTouches[0];
        this.touchFrom = undefined;
        if (from === undefined || touch === undefined) {
            return;
        }
        const across = touch.clientX - from.x;
        const along = touch.clientY - from.y;
        // Clearly sideways: far enough, and at least twice as far across as up or down.
        if (Math.abs(across) >= SWIPE_DISTANCE && Math.abs(across) >= 2 * Math.abs(along)) {
            // Like turning a page: swiping to the left brings the later week in.
            this.stepWeek(across < 0 ? 1 : -1);
        }
    }

    /** The day area: the pages follow the finger, and letting go turns the page or not. */
    protected dayTouchStart(event: TouchEvent): void {
        this.begin(event);
    }

    protected dayTouchMove(event: TouchEvent): void {
        const from = this.touchFrom;
        const touch = event.touches[0];
        if (from === undefined || touch === undefined) {
            return;
        }
        const across = touch.clientX - from.x;
        const along = touch.clientY - from.y;
        if (from.axis === undefined) {
            if (Math.max(Math.abs(across), Math.abs(along)) < DRAG_SLOP) {
                return;
            }
            // Decided once, by the first real movement: a scroll that drifts sideways later
            // must not start dragging the day, nor a drag start scrolling.
            from.axis = Math.abs(across) > Math.abs(along) ? 'across' : 'along';
            if (from.axis === 'across') {
                this.run++; // Take over from a turn still under way: finish it at once.
                this.rest();
            }
        }
        if (from.axis === 'across') {
            // With no day to go to on that side the content resists: it moves a quarter as far.
            this.drag.set(this.neighbour(across) === undefined ? across / 4 : across);
        }
    }

    protected dayTouchEnd(event: TouchEvent): void {
        const from = this.touchFrom;
        const touch = event.changedTouches[0];
        this.touchFrom = undefined;
        if (from?.axis !== 'across' || touch === undefined) {
            return;
        }
        const across = touch.clientX - from.x;
        const far = Math.abs(across) > Math.min(70, window.innerWidth / 5);
        const speed = Math.abs(across) / Math.max(1, event.timeStamp - from.at);
        const flick = Math.abs(across) > 30 && speed > FLICK_SPEED;
        const day = this.neighbour(across);
        if (day !== undefined && (far || flick)) {
            this.show(day);
        } else {
            this.release();
        }
    }

    /** The system took the touch away (a notification, a gesture): put the day back. */
    protected dayTouchCancel(): void {
        this.touchFrom = undefined;
        this.release();
    }

    /** The logged day a drag by `across` px leads to: to the left is the later one. */
    private neighbour(across: number): DayKey | undefined {
        return across < 0 ? this.after() : this.before();
    }
}

/**
 * "1:12" (hours and minutes) for a block that lasted; nothing for a single set, which has no
 * length. From the first set to the last, like workout time once it has stopped.
 */
function durationOf(block: DayBlock): string | undefined {
    const minutes = Math.floor((Date.parse(block.endedAt) - Date.parse(block.startedAt)) / 60_000);
    // Under a minute is one set, or two logged together: not worth a "0:00".
    return minutes < 1
        ? undefined
        : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
