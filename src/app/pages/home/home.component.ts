import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WeeklyCardioComponent } from '@analytics/presentation/weekly-cardio/weekly-cardio.component';
import { WeeklyVolumeComponent } from '@analytics/presentation/weekly-volume/weekly-volume.component';
import { CatalogService } from '@catalog/application/catalog.service';
import { ExperienceCardComponent } from '@gamification/presentation/experience-card/experience-card.component';
import { ExperienceSummaryComponent } from '@gamification/presentation/experience-summary/experience-summary.component';
import { LeaderboardPlaceComponent } from '@leaderboard/presentation/leaderboard-place/leaderboard-place.component';
import { SettingsService } from '@settings/application/settings.service';
import { Locale } from '@shared/application/locale.service';
import { Localized, lastDays } from '@shared/domain/language';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { includesCardio, includesLifting } from '@shared/domain/training-focus';
import { translations } from '@shared/presentation/i18n';
import { TrainingService } from '@training/application/training.service';
import { primaryExerciseId } from '@training/domain/set';
import { exercisesOf } from '@training/domain/workout';
import { SetGridComponent } from '@training/presentation/set-grid/set-grid.component';
import { HistoryPosition } from '../history/history-position.service';

const TEXT = {
    en: {
        weeklyVolume: 'Volume',
        cardio: 'Cardio',
        experience: 'Experience',
        inProgress: 'In progress',
        currentWorkout: 'Current workout',
        quiet: 'The lab is quiet. Logging a set starts a workout.',
        train: 'Train',
        history: 'History',
        historyLabel: 'History: everything you did, day by day',
    },
    ru: {
        weeklyVolume: 'Объём',
        cardio: 'Кардио',
        experience: 'Опыт',
        inProgress: 'Идёт',
        currentWorkout: 'Текущая тренировка',
        quiet: 'В лаборатории тихо. Первый записанный подход начнёт тренировку.',
        train: 'Тренироваться',
        history: 'История',
        historyLabel: 'История: всё, что вы делали, день за днём',
    },
} satisfies Localized<unknown>;

/**
 * Home (the Week page): while gamification is on, a slim level summary first; then weekly volume
 * per muscle group, weekly cardio, the workout in progress, and last the experience details. The
 * training focus hides the half the user does not do.
 */
@Component({
    selector: 'olab-home',
    imports: [
        ExperienceCardComponent,
        ExperienceSummaryComponent,
        LeaderboardPlaceComponent,
        RouterLink,
        SetGridComponent,
        WeeklyCardioComponent,
        WeeklyVolumeComponent,
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent {
    private readonly training = inject(TrainingService);
    private readonly settings = inject(SettingsService);
    private readonly catalogService = inject(CatalogService);
    private readonly catalog = this.catalogService.catalog;
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);
    /**
     * The History link starts a fresh visit, on the latest day. Coming back to History from an
     * exercise's statistics is not a fresh visit, and returns to the day it was left on.
     */
    private readonly historyPosition = inject(HistoryPosition);

    protected freshHistory(): void {
        this.historyPosition.forget();
    }
    private readonly windowDays = inject(AnalyticsService).windowDays;
    /**
     * "Last 7 days" over both cards: the target window, which the user may lengthen. The
     * headings below it say only "Volume" and "Cardio", since "weekly" is wrong at 14 days.
     */
    protected readonly window = computed(() => lastDays(this.language(), this.windowDays()));

    protected readonly showsLifting = computed(() => includesLifting(this.catalogService.focus()));
    protected readonly showsCardio = computed(() => includesCardio(this.catalogService.focus()));
    /** A preference: off by default, and while off the experience is never even derived. */
    protected readonly showsExperience = computed(() => this.settings.preferences().gamification);

    /** The exercises of the current workout with their sets, or undefined between workouts. */
    protected readonly workout = computed(() => {
        const workout = this.training.currentWorkout();
        if (workout === undefined) {
            return undefined;
        }
        const catalog = this.catalog();
        return exercisesOf(workout).map((exerciseId) => ({
            exerciseId,
            name: catalog.findExercise(exerciseId)?.name[this.language()] ?? exerciseId,
            sets: workout.sets.filter((set) => primaryExerciseId(set) === exerciseId),
        }));
    });
}
