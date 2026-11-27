import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { CatalogService } from '@catalog/application/catalog.service';
import { Exercise, ExerciseId, isCardio } from '@catalog/domain/exercise';
import { ExerciseFigureComponent } from '@catalog/presentation/exercise-figure/exercise-figure.component';
import { describeSchedule } from '@settings/presentation/schedule-wording';
import { Locale } from '@shared/application/locale.service';
import { Localized, plural } from '@shared/domain/language';
import { includesLifting } from '@shared/domain/training-focus';
import { LocalizePipe, translations } from '@shared/presentation/i18n';
import { ProgramsService } from '@training/application/programs.service';
import { TrainingService } from '@training/application/training.service';
import { Program, ProgramDayId, ProgramStatus } from '@training/domain/program';
import { primaryExerciseId } from '@training/domain/set';
import { exercisesOf } from '@training/domain/workout';
import { RestClockComponent } from '@training/presentation/rest-clock/rest-clock.component';
import { WorkoutTimeComponent } from '@training/presentation/workout-time/workout-time.component';
import { mainMuscles } from '../exercise-summary';
import { dayTitle, programTitle } from '../programs/program-wording';
import { trainList } from './train-list';

interface Item {
    readonly exercise: Exercise;
    /** Secondary line: the muscles trained. */
    readonly detail: string;
    /**
     * Sets (or, for cardio, bouts) logged for it in the workout in progress. Above 0 the
     * exercise counts as done.
     */
    readonly sets: number;
    /** The badge of a done exercise: `3 sets`, or just `Done` for cardio. */
    readonly doneLabel: string;
    /** The first listed exercise that has not been started: what to do now. */
    readonly next: boolean;
    /** No progress for the threshold number of sessions in a row: worth changing something. */
    readonly stalled: boolean;
    /** The exercise of the latest set, while its rest runs: where to go back to. */
    readonly current: boolean;
    /**
     * A row of the solo list: its link opens the logging screen on standalone sets
     * (`?solo=1`), and `sets` counts the standalone session in progress, not the workout.
     */
    readonly solo: boolean;
}

/** One regular program as a card: its shown day's exercises, and the days to switch between. */
interface ProgramCard {
    readonly program: Program;
    readonly title: string;
    /** `Today`, or the program's days in a few words when today is not one of them. */
    readonly when: string;
    readonly dueToday: boolean;
    readonly shownDayId: ProgramDayId | undefined;
    readonly shownDayTitle: string;
    /** Whether the workout in progress (or about to start) is a day of this program. */
    readonly chosen: boolean;
    readonly days: readonly { readonly id: ProgramDayId; readonly title: string }[];
    readonly items: readonly Item[];
    /**
     * Whether to offer saving what was done as this day's list: the workout is this day, and
     * it holds something the day does not, or it has stopped short of the day's list.
     */
    readonly offersUpdate: boolean;
}

const TEXT = {
    en: {
        done: 'Done',
        sets: (count: number) => `${count} ${plural('en', count, { one: 'set', other: 'sets' })}`,
        doneToday: 'Done today:',
        current: 'Current exercise.',
        next: 'Next',
        stalled: 'Stalled',
        stalledDetail: 'No progress for several sessions.',
        statisticsFor: (name: string) => `Statistics for ${name}`,
        outsideWorkouts: 'Outside workouts',
        solo: 'Solo',
        today: 'Today',
        programDays: 'Program days',
        emptyDay: 'Nothing is listed for this day yet. Train, then save what you did as its list.',
        updateDay: (day: string) => `Save what I did as ${day}`,
        edit: (name: string) => `Edit ${name}`,
        onAWhim: 'Outside any program',
        thisWorkout: 'This workout',
        saveAsProgram: 'Save as a program',
        otherFavorites: 'Other favorites',
        favorites: 'Favorites',
        noExercises: 'No exercises yet',
        noExercisesDetail:
            'Star the exercises you do in the catalog and they will be listed here. Or build a program: your own list of exercises for each day you train.',
        noCardioDetail:
            'Star the cardio you do (running, cycling, rowing) in the Cardio section of the catalog and it will be listed here. Or build a program: your own list for each day you train.',
        lookingElse: 'Looking for something else? Every exercise is in the catalog.',
        openCatalog: 'Open the catalog',
        programs: 'Programs',
    },
    ru: {
        done: 'Готово',
        sets: (count: number) =>
            `${count} ${plural('ru', count, { one: 'подход', few: 'подхода', many: 'подходов', other: 'подхода' })}`,
        doneToday: 'Сделано сегодня:',
        current: 'Текущее упражнение.',
        next: 'Далее',
        stalled: 'Застой',
        stalledDetail: 'Нет прогресса несколько тренировок подряд.',
        statisticsFor: (name: string) => `Статистика: ${name}`,
        outsideWorkouts: 'Вне тренировок',
        solo: 'Соло',
        today: 'Сегодня',
        programDays: 'Дни программы',
        emptyDay:
            'Для этого дня пока ничего не указано. Потренируйтесь и сохраните сделанное как его список.',
        updateDay: (day: string) => `Сохранить сделанное как ${day}`,
        edit: (name: string) => `Изменить: ${name}`,
        onAWhim: 'Вне программ',
        thisWorkout: 'Эта тренировка',
        saveAsProgram: 'Сохранить как программу',
        otherFavorites: 'Другие избранные',
        favorites: 'Избранное',
        noExercises: 'Упражнений пока нет',
        noExercisesDetail:
            'Отметьте звёздочкой упражнения, которые делаете, в каталоге, и они появятся здесь. Или соберите программу: свой список упражнений на каждый тренировочный день.',
        noCardioDetail:
            'Отметьте звёздочкой кардио, которое делаете (бег, велосипед, гребля), в разделе «Кардио» каталога, и оно появится здесь. Или соберите программу: свой список на каждый тренировочный день.',
        lookingElse: 'Ищете что-то другое? Все упражнения есть в каталоге.',
        openCatalog: 'Открыть каталог',
        programs: 'Программы',
    },
} satisfies Localized<unknown>;

/**
 * Choosing what to do next during a workout.
 *
 * On top are the solo exercises, then the programs, the ones due today first: each shows the
 * day that comes next, in the order the user prepared. Going down the list is the workout. An
 * exercise turns green once it has a set today, so coming back here shows what is left.
 * Opening an exercise from a program's list makes the workout that program day; the chips
 * switch to another day. See "Program rule" in docs/rules/training.md.
 *
 * Below are the other favorites. Everything else lives in the Catalog.
 */
@Component({
    selector: 'olab-exercise-picker',
    imports: [
        ExerciseFigureComponent,
        LocalizePipe,
        NgTemplateOutlet,
        RouterLink,
        RestClockComponent,
        WorkoutTimeComponent,
    ],
    templateUrl: './exercise-picker.component.html',
    styleUrl: './exercise-picker.component.scss',
})
export class ExercisePickerComponent {
    private readonly training = inject(TrainingService);
    private readonly programsService = inject(ProgramsService);
    private readonly analytics = inject(AnalyticsService);
    private readonly catalogService = inject(CatalogService);
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    protected readonly inProgress = computed(() => this.training.currentWorkout() !== undefined);
    /** Where "Save as a program" starts from: the workout in progress, by its start. */
    protected readonly workoutStart = computed(() => this.training.currentWorkout()?.startedAt);

    /**
     * With focus `cardio` only sets start rest and there is nothing to show, so the rest clock
     * is hidden. Workout time still runs.
     */
    protected readonly showsRest = computed(() => includesLifting(this.catalogService.focus()));
    /** The empty state points a cardio-only user at the catalog's cardio, not at lifts. */
    protected readonly cardioOnly = computed(() => this.catalogService.focus() === 'cardio');

    /**
     * Sets and cardio bouts per exercise in the workout in progress, in the order the exercises
     * were started.
     */
    private readonly setsToday = computed(() => {
        const workout = this.training.currentWorkout();
        const counts = new Map<ExerciseId, number>();
        if (workout === undefined) {
            return counts;
        }
        for (const id of exercisesOf(workout)) {
            const sets = workout.sets.filter((set) => primaryExerciseId(set) === id).length;
            const bouts = workout.cardio.filter((bout) => bout.exerciseId === id).length;
            counts.set(id, sets + bouts);
        }
        return counts;
    });

    private readonly statuses = this.programsService.statuses;

    /** Which exercises the page lists; see `trainList` for the rules. */
    private readonly list = computed(() =>
        trainList(
            this.statuses().map((status) => ({
                id: status.program.id,
                solo: status.program.solo,
                chosen: status.chosen,
                exercises: status.shown?.exercises ?? [],
            })),
            this.setsToday().keys(),
            this.catalogService.favorites(),
            this.catalogService.catalog(),
            this.catalogService.focus(),
        ),
    );

    /**
     * The exercises of the solo programs, pinned to the top: one tap to today's push-ups. Each
     * counts the sets of its standalone session in progress, so it shows as done once today's
     * are logged, and never the "Next" badge or the current exercise: those belong to the
     * workout.
     */
    protected readonly solo = computed<readonly Item[]>(() => {
        const habits = this.training.standaloneHabits();
        return this.toItems(this.list().solo).map((item) => {
            const sets = habits.get(item.exercise.id)?.length ?? 0;
            return { ...item, sets, doneLabel: this.t().sets(sets), current: false, solo: true };
        });
    });

    /** The regular programs as cards, in the order of `statuses` (due today first). */
    protected readonly programs = computed<readonly ProgramCard[]>(() =>
        this.statuses()
            .filter((status) => !status.program.solo)
            .map((status) => this.toCard(status)),
    );

    /** A workout done on a whim: what was started, in the order started. */
    protected readonly thisWorkout = computed<readonly Item[]>(() =>
        this.toItems(this.list().thisWorkout),
    );

    /** The favorites that are not already listed above, in catalog order. */
    protected readonly favorites = computed<readonly Item[]>(() =>
        this.toItems(this.list().favorites),
    );

    protected readonly listsSomething = computed(
        () => this.programs().length + this.solo().length + this.favorites().length > 0,
    );

    /**
     * Opening an exercise from a program's list says which day this workout is. Recorded once:
     * while the workout already is that day there is nothing to add.
     */
    protected choose(card: ProgramCard): void {
        if (!card.chosen && card.shownDayId !== undefined) {
            void this.programsService.chooseDay(card.program, card.shownDayId);
        }
    }

    /** Switches the workout in progress, or about to start, to another day of the program. */
    protected switchDay(card: ProgramCard, dayId: ProgramDayId): void {
        if (dayId !== card.shownDayId || !card.chosen) {
            void this.programsService.chooseDay(card.program, dayId);
        }
    }

    /** Makes what was done in the workout in progress the list of the day it is. */
    protected updateDay(card: ProgramCard): void {
        const done = [...this.setsToday().keys()];
        void this.programsService.define({
            ...card.program,
            days: card.program.days.map((day) =>
                day.id === card.shownDayId ? { ...day, exercises: done } : day,
            ),
        });
    }

    private toCard(status: ProgramStatus): ProgramCard {
        const { program, shown, chosen, dueToday } = status;
        const language = this.language();
        const items = this.toItems(this.list().programs.get(program.id) ?? []);
        const nextIndex = items.findIndex((item) => item.sets === 0);
        const days = program.days.map((day, index) => ({
            id: day.id,
            title: dayTitle(index, language),
        }));
        const done = [...this.setsToday().keys()];
        const listed = new Set(shown?.exercises ?? []);
        const hasExtras = done.some((id) => !listed.has(id));
        const stoppedShort =
            this.training.workoutTime()?.running === false && done.length < listed.size;
        return {
            program,
            title: programTitle(program, this.catalogService.catalog(), language),
            when: dueToday ? this.t().today : describeSchedule(language, status.schedule),
            dueToday,
            shownDayId: shown?.id,
            shownDayTitle: days.find((day) => day.id === shown?.id)?.title ?? '',
            chosen,
            days,
            // "Next" only where the workout is: a program that is not being done has no next.
            items: items.map((item, index) => ({ ...item, next: chosen && index === nextIndex })),
            offersUpdate: chosen && done.length > 0 && (hasExtras || stoppedShort),
        };
    }

    /** Turns ids into list items, skipping exercises the catalog does not know. */
    private toItems(ids: readonly ExerciseId[]): readonly Item[] {
        const catalog = this.catalogService.catalog();
        const setsToday = this.setsToday();
        const stalled = this.analytics.stalledExercises();
        const current = this.training.currentExercise();
        return ids.flatMap((id) => {
            const exercise = catalog.findExercise(id);
            if (exercise === undefined) {
                return [];
            }
            const sets = setsToday.get(id) ?? 0;
            // Counting bouts says little about a run, so cardio is simply "Done".
            const t = this.t();
            const doneLabel = isCardio(exercise) ? t.done : t.sets(sets);
            const detail = mainMuscles(exercise, this.language());
            return [
                {
                    exercise,
                    detail,
                    sets,
                    doneLabel,
                    next: false,
                    stalled: stalled.has(id),
                    current: id === current,
                    solo: false,
                },
            ];
        });
    }
}
