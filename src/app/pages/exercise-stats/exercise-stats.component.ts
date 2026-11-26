import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { CardioRecordTableComponent } from '@analytics/presentation/cardio-record-table/cardio-record-table.component';
import { CardioProgressComponent } from '@analytics/presentation/cardio-progress/cardio-progress.component';
import { ExerciseProgressComponent } from '@analytics/presentation/exercise-progress/exercise-progress.component';
import { RecordTableComponent } from '@analytics/presentation/record-table/record-table.component';
import { CatalogService } from '@catalog/application/catalog.service';
import { matchedOrBeaten } from '@analytics/domain/cardio-progression';
import { describeCardio, describeComparison } from '@analytics/domain/cardio-wording';
import { ExerciseId, isCardio } from '@catalog/domain/exercise';
import { ExerciseFigureComponent } from '@catalog/presentation/exercise-figure/exercise-figure.component';
import { MuscleMapComponent } from '@catalog/presentation/muscle-map/muscle-map.component';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { LocalDatePipe, LocalizePipe, translations } from '@shared/presentation/i18n';
import { TrainingService } from '@training/application/training.service';
import { isStandalone, primaryExerciseId } from '@training/domain/set';
import { SetGridComponent } from '@training/presentation/set-grid/set-grid.component';

const TEXT = {
    en: {
        allExercises: '← All exercises',
        logCardio: 'Log cardio',
        logSets: 'Log sets',
        progress: 'Progress',
        records: 'Records',
        nothing: 'Nothing logged for this exercise yet.',
        muscles: 'Muscles',
        cardio: 'Cardio',
        noVolume: 'Does not count towards the weekly volume of any muscle group.',
        form: 'Proper form',
        warmUp: 'How to warm up',
        history: 'History',
        whichSets: 'Which sets',
        inWorkouts: 'In workouts',
        standalone: 'Standalone',
        newBaseline: 'new baseline',
        unknown: 'Unknown exercise',
        choose: 'Choose an exercise',
    },
    ru: {
        allExercises: '← Все упражнения',
        // One word: the button shares its line with the exercise name.
        logCardio: 'Записать',
        logSets: 'Записать',
        progress: 'Прогресс',
        records: 'Рекорды',
        nothing: 'По этому упражнению ещё ничего не записано.',
        muscles: 'Мышцы',
        cardio: 'Кардио',
        noVolume: 'Не входит в недельный объём ни одной группы мышц.',
        form: 'Правильная техника',
        warmUp: 'Как размяться',
        history: 'История',
        whichSets: 'Какие подходы',
        inWorkouts: 'На тренировках',
        standalone: 'Вне тренировок',
        newBaseline: 'новая точка отсчёта',
        unknown: 'Неизвестное упражнение',
        choose: 'Выбрать упражнение',
    },
} satisfies Localized<unknown>;

/**
 * Everything about one exercise outside of a workout: the progress chart, the muscles it trains
 * with its form notes, and the complete history.
 */
@Component({
    selector: 'olab-exercise-stats',
    imports: [
        CardioProgressComponent,
        CardioRecordTableComponent,
        ExerciseFigureComponent,
        ExerciseProgressComponent,
        LocalDatePipe,
        LocalizePipe,
        MuscleMapComponent,
        RecordTableComponent,
        RouterLink,
        SetGridComponent,
    ],
    templateUrl: './exercise-stats.component.html',
    styleUrl: './exercise-stats.component.scss',
})
export class ExerciseStatsComponent {
    private readonly training = inject(TrainingService);
    private readonly analytics = inject(AnalyticsService);
    private readonly catalog = inject(CatalogService).catalog;
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    /** Bound from the `:exerciseId` route parameter. */
    readonly exerciseId = input.required<ExerciseId>();

    protected readonly exercise = computed(() => this.catalog().findExercise(this.exerciseId()));
    private readonly inWorkouts = computed(() => this.training.sessionsOf(this.exerciseId()));
    private readonly outside = computed(() =>
        this.training.standaloneSessionsOf(this.exerciseId()),
    );
    /** The switch between the two histories is offered only when the exercise has both. */
    protected readonly hasBoth = computed(
        () => this.inWorkouts().length > 0 && this.outside().length > 0,
    );
    /**
     * Which history the page shows: the sets done in workouts, or the standalone ones. They are
     * never mixed (see "Standalone Set" in docs/glossary.md), so records, the chart, the stall and
     * the list below all follow this. It starts on whichever the latest set of the exercise belongs
     * to; the string (not a boolean) makes another exercise a change, as on the logging screen.
     */
    private readonly usualLane = computed(() => {
        const id = this.exerciseId();
        const latest = this.training.sets().findLast((set) => primaryExerciseId(set) === id);
        return `${id}|${latest !== undefined && isStandalone(latest) ? 'standalone' : 'workout'}`;
    });
    protected readonly standalone = linkedSignal(() => this.usualLane().endsWith('|standalone'));

    protected readonly sessions = computed(() =>
        this.standalone() ? this.outside() : this.inWorkouts(),
    );
    protected readonly tones = computed(() => this.analytics.progressionOf(this.sessions()));
    /** Start of the session still going on: the workout's, or the standalone one's own. */
    protected readonly workoutInProgress = computed(() =>
        this.standalone()
            ? this.training.standaloneInProgressSince(this.sessions())
            : this.training.currentWorkout()?.startedAt,
    );
    /** Sessions in a row without progress, when the exercise is stalled. */
    protected readonly stalledFor = computed(() =>
        this.analytics.stallOf(this.sessions(), this.workoutInProgress()),
    );
    /** The records to beat on the setup of the latest session. */
    protected readonly recordTable = computed(() => this.analytics.recordTableOf(this.sessions()));
    /** Most recent first: on this page you look back from today. */
    protected readonly history = computed(() => this.sessions().toReversed());

    /** A cardio exercise has no sets: its history is a list of sessions in words instead. */
    protected readonly cardio = computed(() => {
        const exercise = this.exercise();
        return exercise !== undefined && isCardio(exercise);
    });

    /** Cardio sessions, oldest first, each with its verdict: what the progress charts plot. */
    protected readonly cardioProgress = computed(() =>
        this.analytics.cardioHistoryOf(this.cardioSessions()),
    );

    private readonly cardioSessions = computed(() =>
        this.training.cardioSessionsOf(this.exerciseId()),
    );
    /** The cardio records to beat, for the measures of the latest session. */
    protected readonly cardioRecordTable = computed(() =>
        this.analytics.cardioRecordTableOf(this.cardioSessions()),
    );

    /** The same sessions in words, most recent first, for the history list. */
    protected readonly cardioHistory = computed(() => {
        const language = this.language();
        return this.cardioProgress()
            .toReversed()
            .map(({ startedAt, totals, comparison }) => ({
                startedAt,
                numbers: describeCardio(language, totals),
                verdict:
                    comparison === undefined
                        ? this.t().newBaseline
                        : describeComparison(language, comparison),
                // Matching the session before is the aim (the cardio match rule), so it reads
                // like beating it. A trade (farther but slower) is neither, like a baseline.
                tone:
                    comparison === undefined || comparison.outcome === 'mixed'
                        ? 'none'
                        : matchedOrBeaten(comparison.outcome)
                          ? 'up'
                          : 'down',
            }));
    });
}
