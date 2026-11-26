import { Component, computed, inject, signal } from '@angular/core';
import { CatalogService } from '@catalog/application/catalog.service';
import { GamificationService } from '@gamification/application/gamification.service';
import { experienceHistory } from '@gamification/domain/experience-history';
import { Locale } from '@shared/application/locale.service';
import { Language, Localized } from '@shared/domain/language';
import { LocalDatePipe, translations } from '@shared/presentation/i18n';
import { TrainingService } from '@training/application/training.service';
import { REASON_NAMES } from '../reason-names';

interface Text {
    readonly empty: string;
    readonly level: (from: number, to: number) => string;
    readonly lv: (from: number, to: number) => string;
    readonly more: string;
    readonly reasons: (typeof REASON_NAMES)['en'];
}

const TEXT: Localized<Text> = {
    en: {
        empty: 'Nothing earned yet. Every working set earns experience.',
        level: (from, to) => `Level ${from} → ${to}`,
        lv: (from, to) => (from === to ? `Lv ${to}` : `Lv ${from} → ${to}`),
        more: 'Show earlier',
        reasons: REASON_NAMES.en,
    },
    ru: {
        empty: 'Опыта пока нет. Каждый рабочий подход приносит опыт.',
        level: (from, to) => `Уровень ${from} → ${to}`,
        lv: (from, to) => (from === to ? `Ур. ${to}` : `Ур. ${from} → ${to}`),
        more: 'Показать раньше',
        reasons: REASON_NAMES.ru,
    },
};

/** Workouts shown at first, and added by each "Show earlier". */
const PAGE = 20;

/**
 * Experience is fractional inside (a light set is 5, a mixed set splits its 10). Each line here
 * is rounded on its own, so a workout's lines may miss its total by a point; the total is
 * what was really earned.
 */
function wholeXp(language: Language, xp: number): string {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(Math.round(xp));
}

/**
 * The experience history: every workout that earned anything, newest first, with what each
 * exercise earned and why ("Weight record +50", "Sets ×4 +40") and the levels it reached.
 * Older workouts come in pages, so a long history costs nothing until it is scrolled to.
 */
@Component({
    selector: 'olab-experience-history',
    imports: [LocalDatePipe],
    templateUrl: './experience-history.component.html',
    styleUrl: './experience-history.component.scss',
})
export class ExperienceHistoryComponent {
    private readonly gamification = inject(GamificationService);
    private readonly training = inject(TrainingService);
    private readonly catalog = inject(CatalogService).catalog;
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    private readonly shownCount = signal(PAGE);

    private readonly history = computed(() =>
        experienceHistory(this.gamification.experience().entries, this.training.workouts()),
    );

    protected readonly empty = computed(() => this.history().length === 0);
    protected readonly hasMore = computed(() => this.history().length > this.shownCount());

    protected readonly workouts = computed(() => {
        const catalog = this.catalog();
        const language = this.language();
        const t = this.t();
        return this.history()
            .slice(0, this.shownCount())
            .map((workout) => ({
                startedAt: workout.startedAt,
                xp: wholeXp(language, workout.xp),
                levelUp:
                    workout.levelAfter > workout.levelBefore
                        ? t.level(workout.levelBefore, workout.levelAfter)
                        : undefined,
                exercises: workout.exercises.map((line) => ({
                    id: line.exerciseId,
                    name: catalog.findExercise(line.exerciseId)?.name[language] ?? line.exerciseId,
                    xp: wholeXp(language, line.xp),
                    level: t.lv(line.levelBefore, line.levelAfter),
                    leveled: line.levelAfter > line.levelBefore,
                    reasons: line.reasons.map((reason) => ({
                        reason: reason.reason,
                        // Minutes are already the amount: "×3" would count bouts, not time.
                        name:
                            reason.count > 1 && reason.reason !== 'cardio-time'
                                ? `${t.reasons[reason.reason]} ×${reason.count}`
                                : t.reasons[reason.reason],
                        xp: wholeXp(language, reason.xp),
                    })),
                })),
            }));
    });

    protected showMore(): void {
        this.shownCount.update((count) => count + PAGE);
    }
}
