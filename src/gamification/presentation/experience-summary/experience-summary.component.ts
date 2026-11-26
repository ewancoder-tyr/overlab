import { Component, computed, inject } from '@angular/core';
import { GamificationService } from '@gamification/application/gamification.service';
import { titleOf } from '@gamification/domain/title';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';
import { percentThrough, wholeXp } from '@gamification/presentation/experience-format';

interface Text {
    readonly lv: string;
    /** The sentence a screen reader reads instead of the number and the bar. */
    readonly label: (level: number, title: string, xp: string, next: string) => string;
}

const TEXT: Localized<Text> = {
    en: {
        lv: 'Lv',
        label: (level, title, xp, next) => `Level ${level}, ${title}, ${xp} of ${next} experience`,
    },
    ru: {
        lv: 'Ур.',
        label: (level, title, xp, next) => `Уровень ${level}, ${title}, ${xp} из ${next} опыта`,
    },
};

/**
 * The character at a glance, at the top of the Week page: level, title, experience and a thin
 * bar towards the next level, in about the height of one line. Deliberately slim, so the volume
 * gauges right under it stay on screen and their pour animation is seen. The rest (what is left
 * to the next level, the history, every exercise's level) is the experience card further down.
 */
@Component({
    selector: 'olab-experience-summary',
    templateUrl: './experience-summary.component.html',
    styleUrl: './experience-summary.component.scss',
})
export class ExperienceSummaryComponent {
    private readonly experience = inject(GamificationService).experience;
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    protected readonly level = computed(() => this.experience().progress.level);
    protected readonly title = computed(() => titleOf(this.level())[this.language()]);
    protected readonly xp = computed(() => wholeXp(this.language(), this.experience().progress.xp));
    protected readonly percent = computed(() => percentThrough(this.experience().progress));
    protected readonly label = computed(() => {
        const progress = this.experience().progress;
        return this.t().label(
            progress.level,
            this.title(),
            wholeXp(this.language(), progress.xp),
            wholeXp(this.language(), progress.nextLevelAt),
        );
    });
}
