import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { CatalogService } from '@catalog/application/catalog.service';
import { ExerciseId } from '@catalog/domain/exercise';
import { GamificationService } from '@gamification/application/gamification.service';
import { Experience, XpReason } from '@gamification/domain/experience';
import { ReasonGain, experienceGain } from '@gamification/domain/experience-gain';
import { titleOf } from '@gamification/domain/title';
import { Clock } from '@shared/application/clock.service';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';
import { REASON_NAMES } from '../reason-names';

interface Text {
    readonly levelUp: string;
    readonly level: (level: number) => string;
    readonly exerciseLevel: (name: string, level: number) => string;
    /** What a screen reader announces, since the animation itself is hidden from it. */
    readonly gained: (xp: number) => string;
    /** The bonuses' names. The plain set and cardio minutes are never shown: they are the base. */
    readonly reasons: Record<XpReason, string>;
}

const TEXT: Localized<Text> = {
    en: {
        levelUp: 'Level up',
        level: (level) => `Level ${level}`,
        exerciseLevel: (name, level) => `${name} · Lv ${level}`,
        gained: (xp) => `${xp} experience earned`,
        reasons: REASON_NAMES.en,
    },
    ru: {
        levelUp: 'Новый уровень',
        level: (level) => `Уровень ${level}`,
        exerciseLevel: (name, level) => `${name} · ур. ${level}`,
        gained: (xp) => `Получено опыта: ${xp}`,
        reasons: REASON_NAMES.ru,
    },
};

/** How long each animation stays on screen, matching the keyframes in the stylesheet. */
const TOAST_MS = 1800;
/** A gain with a bonus stays longer: there is more to read, and it deserves the moment. */
const BONUS_TOAST_MS = 3000;
const LEVEL_UP_MS = 2800;

/** One "+10 XP" on screen. The id lets several overlap and each leave on its own timer. */
interface Toast {
    readonly id: number;
    readonly xp: number;
    readonly exerciseId: ExerciseId | undefined;
    /** An exercise that reached a new level with this gain, if any. */
    readonly exerciseLevel: { readonly exerciseId: ExerciseId; readonly level: number } | undefined;
    /** The bonuses of this gain, proudest first; empty for a plain set. */
    readonly bonuses: readonly ReasonGain[];
}

/** A reason that is a bonus, not the base experience every set or minute earns. */
function isBonus(
    gain: ReasonGain,
): gain is ReasonGain & { readonly reason: Exclude<XpReason, 'set' | 'cardio-time'> } {
    return gain.reason !== 'set' && gain.reason !== 'cardio-time';
}

/**
 * The game's feedback: a "+10 XP" that rises and fades whenever experience is earned, and a
 * "Level up" burst when the character reaches a new level. The shell shows it on every page
 * while gamification is on.
 *
 * It is an overlay (`position: fixed`, `pointer-events: none`): it takes no space and catches no
 * taps, so nothing on the page moves, the logging screen's fixed zones included, and the next
 * set can be logged straight through it.
 *
 * It compares each new reading of experience with the previous one. The first reading is only
 * remembered: opening the app, or switching the game on, is not earning anything.
 */
@Component({
    selector: 'olab-experience-celebration',
    templateUrl: './experience-celebration.component.html',
    styleUrl: './experience-celebration.component.scss',
})
export class ExperienceCelebrationComponent {
    private readonly gamification = inject(GamificationService);
    private readonly clock = inject(Clock);
    private readonly catalog = inject(CatalogService).catalog;
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    private readonly toasts = signal<readonly Toast[]>([]);
    /** The character's new level while its burst is on screen. */
    protected readonly levelUp = signal<number | undefined>(undefined);
    /** The title that comes with the new level, in the current language. */
    protected readonly levelTitle = computed(() => {
        const level = this.levelUp();
        return level === undefined ? '' : titleOf(level)[this.language()];
    });
    /** The latest gain, worded for screen readers in the `aria-live` region. */
    protected readonly announcement = signal('');

    private nextId = 0;
    private readonly timers = new Set<ReturnType<typeof setTimeout>>();

    protected readonly shown = computed(() => {
        const catalog = this.catalog();
        const language = this.language();
        const name = (id: ExerciseId | undefined): string | undefined =>
            id === undefined ? undefined : catalog.findExercise(id)?.name[language];
        return this.toasts().map((toast) => {
            const leveled = toast.exerciseLevel;
            const leveledName = name(leveled?.exerciseId);
            return {
                id: toast.id,
                xp: toast.xp,
                // A new exercise level is the bigger news; otherwise just which exercise it was.
                line:
                    leveled !== undefined && leveledName !== undefined
                        ? this.t().exerciseLevel(leveledName, leveled.level)
                        : name(toast.exerciseId),
                leveled: leveled !== undefined,
                bonuses: toast.bonuses.filter(isBonus).map((bonus) => ({
                    reason: bonus.reason,
                    name: this.t().reasons[bonus.reason],
                    xp: bonus.xp,
                })),
            };
        });
    });

    constructor() {
        let previous: Experience | undefined;
        let previouslyInThePast = false;
        effect(() => {
            const current = this.gamification.experience();
            // While logging in the past the app shows the log as it was then, so going there
            // drops experience and coming back restores it. Neither is earning anything.
            const inThePast = this.clock.inThePast();
            // `untracked`: the effect re-runs only when experience changes, not when the
            // toasts it adds change.
            untracked(() => {
                if (previous !== undefined && inThePast === previouslyInThePast) {
                    this.celebrate(previous, current);
                }
            });
            previous = current;
            previouslyInThePast = inThePast;
        });
        inject(DestroyRef).onDestroy(() => {
            for (const timer of this.timers) {
                clearTimeout(timer);
            }
        });
    }

    private celebrate(before: Experience, after: Experience): void {
        const gain = experienceGain(before, after);
        if (gain === undefined) {
            return;
        }
        const id = ++this.nextId;
        const bonuses = gain.reasons.filter(isBonus);
        this.toasts.update((toasts) => [
            ...toasts,
            {
                id,
                xp: gain.xp,
                exerciseId: gain.exerciseId,
                exerciseLevel: gain.exerciseLevelUps[0],
                bonuses,
            },
        ]);
        this.after(bonuses.length > 0 ? BONUS_TOAST_MS : TOAST_MS, () => {
            this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
        });
        const said = [this.t().gained(gain.xp), ...bonuses.map((b) => this.t().reasons[b.reason])];
        this.announcement.set(said.join('. '));

        const level = gain.levelUp;
        if (level !== undefined) {
            this.levelUp.set(level);
            const title = titleOf(level)[this.language()];
            this.announcement.set([...said, this.t().level(level), title].join('. '));
            this.after(LEVEL_UP_MS, () => {
                // Only clear our own burst: a second level-up meanwhile keeps its full time.
                if (this.levelUp() === level) {
                    this.levelUp.set(undefined);
                }
            });
        }
    }

    private after(ms: number, action: () => void): void {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            action();
        }, ms);
        this.timers.add(timer);
    }
}
