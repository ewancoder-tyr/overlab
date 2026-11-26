import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { CatalogService } from '@catalog/application/catalog.service';
import { Exercise, isCardio, isShown } from '@catalog/domain/exercise';
import { MUSCLE_GROUPS, MuscleGroupId } from '@catalog/domain/muscle-group';
import { ExerciseFigureComponent } from '@catalog/presentation/exercise-figure/exercise-figure.component';
import { Locale } from '@shared/application/locale.service';
import { LocalText, Localized } from '@shared/domain/language';
import { includesLifting } from '@shared/domain/training-focus';
import { LocalizePipe, translations } from '@shared/presentation/i18n';
import { CARDIO, MUSCLE_NAMES, mainMuscles } from '../exercise-summary';

interface Item {
    readonly exercise: Exercise;
    /** Secondary line: the muscles trained, or the involvement of the filtered muscle. */
    readonly detail: string;
    readonly favorite: boolean;
}

interface Section {
    readonly title: string;
    readonly items: readonly Item[];
}

const TEXT = {
    en: {
        heading: 'Exercise catalog',
        intro: 'Star the exercises you do. Only starred ones are offered on the Train page.',
        search: 'Search by exercise or muscle',
        filter: 'Filter by muscle group',
        underTargetHidden: '(under target)',
        underTarget: 'under target',
        results: 'Results',
        favorite: (name: string) => `Favorite: ${name}`,
        nothing: 'Nothing matches. Try another search or clear the filter.',
    },
    ru: {
        heading: 'Каталог упражнений',
        intro: 'Отметьте звёздочкой упражнения, которые делаете. Только они предлагаются на странице «Зал».',
        search: 'Поиск по упражнению или мышце',
        filter: 'Фильтр по группе мышц',
        underTargetHidden: '(ниже цели)',
        underTarget: 'ниже цели',
        results: 'Результаты',
        favorite: (name: string) => `В избранное: ${name}`,
        nothing: 'Ничего не нашлось. Попробуйте другой запрос или снимите фильтр.',
    },
} satisfies Localized<unknown>;

/**
 * Every exercise the app knows, and the place to star the ones you actually do. Only starred
 * exercises (favorites) are offered on the Train page, which keeps that page short.
 *
 * Two ways to find an exercise: a muscle group filter, which also marks the groups still under
 * their weekly target, and search by exercise or muscle name.
 */
@Component({
    selector: 'olab-catalog',
    imports: [ExerciseFigureComponent, LocalizePipe, RouterLink],
    templateUrl: './catalog.component.html',
    styleUrl: './catalog.component.scss',
})
export class CatalogComponent {
    private readonly analytics = inject(AnalyticsService);
    private readonly catalogService = inject(CatalogService);
    private readonly catalog = this.catalogService.catalog;
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    protected readonly query = signal('');
    protected readonly muscleFilter = signal<MuscleGroupId | undefined>(undefined);
    protected readonly error = signal<LocalText | undefined>(undefined);

    /**
     * The exercises the training focus shows (see `isShown`): no cardio for lifting only, no
     * lifts for cardio only. Everything below lists from this, never from the whole catalog.
     */
    private readonly shownExercises = computed(() => {
        const focus = this.catalogService.focus();
        return this.catalog().exercises.filter((exercise) => isShown(exercise, focus));
    });

    /** Muscle chips mean nothing to someone who only does cardio. */
    protected readonly showsMuscles = computed(() => includesLifting(this.catalogService.focus()));

    /** Filter chips, one per muscle group, flagged when the group is behind this week. */
    protected readonly muscles = computed(() =>
        this.analytics.weeklyVolume().map((volume) => ({
            id: volume.muscleGroup.id,
            name: volume.muscleGroup.name[this.language()],
            behind: volume.status === 'under',
        })),
    );

    protected readonly sections = computed<readonly Section[]>(() => {
        const query = this.query().trim().toLowerCase();
        // A muscle chosen before switching to cardio only must not keep filtering out of sight.
        const filter = this.showsMuscles() ? this.muscleFilter() : undefined;
        return query === '' && filter === undefined
            ? this.browseSections()
            : [{ title: this.t().results, items: this.search(query, filter) }];
    });

    /** Matches on exercise name or muscle name, optionally limited to one muscle group. */
    private search(query: string, filter: MuscleGroupId | undefined): readonly Item[] {
        const favorites = this.catalogService.favorites();
        const language = this.language();
        const ratioFor = (exercise: Exercise): number =>
            exercise.involvements.find((involvement) => involvement.muscleGroupId === filter)
                ?.ratio ?? 0;

        return this.shownExercises()
            .filter((exercise) => filter === undefined || ratioFor(exercise) > 0)
            .filter(
                (exercise) =>
                    exercise.name[language].toLowerCase().includes(query) ||
                    mainMuscles(exercise, language).toLowerCase().includes(query),
            )
            .toSorted((a, b) => ratioFor(b) - ratioFor(a))
            .map((exercise) => ({
                exercise,
                detail:
                    filter === undefined
                        ? mainMuscles(exercise, language)
                        : `${MUSCLE_NAMES.get(filter)?.[language] ?? filter} ${Math.round(ratioFor(exercise) * 100)}%`,
                favorite: favorites.has(exercise.id),
            }));
    }

    /** The default view: everything, grouped by main muscle group, with cardio last. */
    private browseSections(): readonly Section[] {
        const favorites = this.catalogService.favorites();
        const exercises = this.shownExercises();
        const language = this.language();
        const section = (title: string, belongs: (exercise: Exercise) => boolean): Section => ({
            title,
            items: exercises.filter(belongs).map((exercise) => ({
                exercise,
                detail: mainMuscles(exercise, language),
                favorite: favorites.has(exercise.id),
            })),
        });

        return [
            // An exercise is listed under the muscle it involves most.
            ...MUSCLE_GROUPS.map((group) =>
                section(
                    group.name[language],
                    (exercise) => exercise.involvements[0]?.muscleGroupId === group.id,
                ),
            ),
            section(CARDIO[language], isCardio),
        ].filter(({ items }) => items.length > 0);
    }

    protected toggleMuscle(id: MuscleGroupId): void {
        this.muscleFilter.update((current) => (current === id ? undefined : id));
    }

    protected async toggleFavorite(item: Item): Promise<void> {
        const result = await this.catalogService.setFavorite(item.exercise.id, !item.favorite);
        this.error.set(result.ok ? undefined : result.error);
    }
}
