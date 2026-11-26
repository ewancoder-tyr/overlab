import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '@catalog/application/catalog.service';
import { isShown } from '@catalog/domain/exercise';
import { GamificationService } from '@gamification/application/gamification.service';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';
import { percentThrough, wholeXp } from '@gamification/presentation/experience-format';

interface Text {
    readonly lv: string;
    readonly toNext: (xp: string, level: number) => string;
    readonly empty: string;
    readonly exercises: (count: number) => string;
    /** The link to the experience history: when and why each point was earned. */
    readonly history: string;
}

const TEXT: Localized<Text> = {
    en: {
        lv: 'Lv',
        toNext: (xp, level) => `${xp} XP to level ${level}`,
        empty: 'Every working set earns experience. Beat last time for a bonus.',
        exercises: (count) => `Exercises (${count})`,
        history: 'History',
    },
    ru: {
        lv: 'Ур.',
        toNext: (xp, level) => `${xp} XP до уровня ${level}`,
        empty: 'Каждый рабочий подход приносит опыт. Обгоните прошлый раз ради бонуса.',
        exercises: (count) => `Упражнения (${count})`,
        history: 'История',
    },
};

/**
 * The experience details of the Week page, below the volume and cardio: what is left to the next
 * level, the link to the history, and the level of every exercise behind a disclosure. The level
 * itself is the slim summary at the top (`ExperienceSummaryComponent`). Shown only while
 * gamification is switched on (the page asks settings), so nothing here is ever derived otherwise.
 */
@Component({
    selector: 'olab-experience-card',
    imports: [RouterLink],
    templateUrl: './experience-card.component.html',
    styleUrl: './experience-card.component.scss',
})
export class ExperienceCardComponent {
    private readonly gamification = inject(GamificationService);
    private readonly catalogService = inject(CatalogService);
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    private readonly experience = this.gamification.experience;

    protected readonly toNext = computed(() => {
        const progress = this.experience().progress;
        // Rounded up: with 4049.5 of 4050 there is still a point to go, not none.
        const left = Math.ceil(progress.nextLevelAt - progress.xp);
        return this.t().toNext(wholeXp(this.language(), left), progress.level + 1);
    });
    protected readonly empty = computed(() => this.experience().byExercise.length === 0);

    /**
     * Every exercise with experience, most first. The training focus hides cardio or lifting
     * from the list (`isShown`, the one rule for lists); the total above still counts it all.
     */
    protected readonly exercises = computed(() => {
        const catalog = this.catalogService.catalog();
        const focus = this.catalogService.focus();
        const language = this.language();
        return this.experience().byExercise.flatMap((entry) => {
            const exercise = catalog.findExercise(entry.exerciseId);
            return exercise === undefined || !isShown(exercise, focus)
                ? []
                : [
                      {
                          id: exercise.id,
                          name: exercise.name[language],
                          level: entry.progress.level,
                          xp: wholeXp(language, entry.progress.xp),
                          percent: percentThrough(entry.progress),
                      },
                  ];
        });
    });
}
