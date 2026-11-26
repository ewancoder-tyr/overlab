import { Component, computed, inject } from '@angular/core';
import { CatalogService } from '@catalog/application/catalog.service';
import { GamificationService } from '@gamification/application/gamification.service';
import { LevelProgress } from '@gamification/domain/level';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';
import { RestAlert } from '@training/application/rest-alert.service';
import { TrainingService } from '@training/application/training.service';

interface Text {
    readonly exercise: (name: string, level: number, percent: number) => string;
    readonly character: (level: number, percent: number) => string;
}

const TEXT: Localized<Text> = {
    en: {
        exercise: (name, level, percent) => `${name}: level ${level}, ${percent}% to the next`,
        character: (level, percent) => `Level ${level}, ${percent}% to the next`,
    },
    ru: {
        exercise: (name, level, percent) => `${name}: уровень ${level}, ${percent}% до следующего`,
        character: (level, percent) => `Уровень ${level}, ${percent}% до следующего`,
    },
};

/** How far through its current level an amount of experience is, in percent. */
function percentThrough(progress: LevelProgress): number {
    const span = progress.nextLevelAt - progress.levelStart;
    return span === 0 ? 0 : ((progress.xp - progress.levelStart) / span) * 100;
}

/**
 * Two hairlines framing the screen while gamification is on: along the top edge, the current
 * exercise's progress towards its next level; along the bottom edge, the character's.
 *
 * "Current" is the exercise whose logging screen is open, else the current exercise of the
 * workout (that of the latest set, while its rest is shown); with neither, there is no top
 * line. Like the celebration, they are fixed, take no space and catch no taps.
 */
@Component({
    selector: 'olab-experience-lines',
    templateUrl: './experience-lines.component.html',
    styleUrl: './experience-lines.component.scss',
})
export class ExperienceLinesComponent {
    private readonly gamification = inject(GamificationService);
    private readonly training = inject(TrainingService);
    private readonly viewing = inject(RestAlert).viewing;
    private readonly catalog = inject(CatalogService).catalog;
    private readonly language = inject(Locale).language;
    private readonly t = translations(TEXT);

    protected readonly character = computed(() => {
        const progress = this.gamification.experience().progress;
        const percent = percentThrough(progress);
        const rounded = Math.floor(percent);
        return { percent, rounded, label: this.t().character(progress.level, rounded) };
    });

    protected readonly exercise = computed(() => {
        const id = this.viewing() ?? this.training.currentExercise();
        if (id === undefined) {
            return undefined;
        }
        const entry = this.gamification
            .experience()
            .byExercise.find((each) => each.exerciseId === id);
        // An exercise with no experience yet starts at level 1, an empty line.
        const level = entry?.progress.level ?? 1;
        const percent = entry === undefined ? 0 : percentThrough(entry.progress);
        const name = this.catalog().findExercise(id)?.name[this.language()] ?? id;
        const rounded = Math.floor(percent);
        return { percent, rounded, label: this.t().exercise(name, level, rounded) };
    });
}
