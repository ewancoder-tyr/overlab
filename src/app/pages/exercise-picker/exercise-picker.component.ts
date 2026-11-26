import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { CatalogService } from '@catalog/application/catalog.service';
import { Exercise, ExerciseId, isCardio } from '@catalog/domain/exercise';
import { ExerciseFigureComponent } from '@catalog/presentation/exercise-figure/exercise-figure.component';
import { Locale } from '@shared/application/locale.service';
import { Localized, plural } from '@shared/domain/language';
import { includesLifting } from '@shared/domain/training-focus';
import { LocalizePipe, translations } from '@shared/presentation/i18n';
import { TrainingService } from '@training/application/training.service';
import { primaryExerciseId } from '@training/domain/set';
import { exercisesOf } from '@training/domain/workout';
import { RestClockComponent } from '@training/presentation/rest-clock/rest-clock.component';
import { WorkoutTimeComponent } from '@training/presentation/workout-time/workout-time.component';
import { mainMuscles } from '../exercise-summary';
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
    /** The first planned exercise that has not been started: what to do now. */
    readonly next: boolean;
    /** No progress for the threshold number of sessions in a row: worth changing something. */
    readonly stalled: boolean;
    /** The exercise of the latest set, while its rest runs: where to go back to. */
    readonly current: boolean;
    /**
     * A row of the standalone list: its link opens the logging screen on standalone sets
     * (`?solo=1`), and `sets` counts the standalone session in progress, not the workout.
     */
    readonly solo: boolean;
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
        thePlan: 'The plan',
        thisWorkout: 'This workout',
        nextWorkout: 'Next workout',
        otherFavorites: 'Other favorites',
        favorites: 'Favorites',
        noExercises: 'No exercises yet',
        noExercisesDetail:
            'Star the exercises you do in the catalog and they will be listed here. Once you have logged workouts, the plan for the next one appears on top.',
        noCardioDetail:
            'Star the cardio you do (running, cycling, rowing) in the Cardio section of the catalog and it will be listed here. Once you have logged workouts, the plan for the next one appears on top.',
        lookingElse: 'Looking for something else? Every exercise is in the catalog.',
        openCatalog: 'Open the catalog',
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
        thePlan: 'План',
        thisWorkout: 'Эта тренировка',
        nextWorkout: 'Следующая тренировка',
        otherFavorites: 'Другие избранные',
        favorites: 'Избранное',
        noExercises: 'Упражнений пока нет',
        noExercisesDetail:
            'Отметьте звёздочкой упражнения, которые делаете, в каталоге, и они появятся здесь. Когда наберутся тренировки, сверху появится план следующей.',
        noCardioDetail:
            'Отметьте звёздочкой кардио, которое делаете (бег, велосипед, гребля), в разделе «Кардио» каталога, и оно появится здесь. Когда наберутся тренировки, сверху появится план следующей.',
        lookingElse: 'Ищете что-то другое? Все упражнения есть в каталоге.',
        openCatalog: 'Открыть каталог',
    },
} satisfies Localized<unknown>;

/**
 * Choosing what to do next during a workout.
 *
 * On top is the plan: the exercises of this workout in the order they were done the last time
 * this workout of the rotation came round. Going down the list is the workout. An exercise turns
 * green once it has a set today, so coming back here shows what is left.
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
    private readonly analytics = inject(AnalyticsService);
    private readonly catalogService = inject(CatalogService);
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    protected readonly inProgress = computed(() => this.training.currentWorkout() !== undefined);

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

    /** Which exercises the page lists; see `trainList` for how the focus filters them. */
    private readonly list = computed(() =>
        trainList(
            this.training.plan(),
            this.setsToday().keys(),
            this.catalogService.favorites(),
            this.catalogService.catalog(),
            this.catalogService.focus(),
            this.training.standaloneHabits().keys(),
        ),
    );

    /**
     * The exercises done standalone lately, pinned to the top: one tap to today's push-ups.
     * Each counts the sets of its standalone session in progress, so it shows as done once
     * today's are logged, and never the "Next" badge or the current exercise: those belong to
     * the workout.
     */
    protected readonly standalone = computed<readonly Item[]>(() => {
        const habits = this.training.standaloneHabits();
        return this.toItems(this.list().standalone).map((item) => {
            const sets = habits.get(item.exercise.id)?.length ?? 0;
            return { ...item, sets, doneLabel: this.t().sets(sets), current: false, solo: true };
        });
    });

    /**
     * What was started today, in the order started (planned or not, so it shows as done), then
     * the rest of the plan in order (see `trainList`). Planned exercises appear whether or not
     * they are favorites, and whatever the focus: the plan comes from what was actually logged.
     */
    protected readonly planned = computed<readonly Item[]>(() => {
        const items = this.toItems(this.list().planned);
        const nextIndex = items.findIndex((item) => item.sets === 0);
        return items.map((item, index) => ({ ...item, next: index === nextIndex }));
    });

    /** The favorites that are not already listed in the plan, in catalog order. */
    protected readonly favorites = computed<readonly Item[]>(() =>
        this.toItems(this.list().favorites),
    );

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
