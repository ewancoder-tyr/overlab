import { LevelProgress } from '@gamification/domain/level';
import { Language } from '@shared/domain/language';

/**
 * Experience is fractional inside (a mixed set splits its 10 points), whole on screen: rounded
 * down, like the cardio minutes, so the bar never claims a point not yet earned. Grouped in
 * thousands (`12,340` / `12 340`), because experience grows into the tens of thousands.
 */
export function wholeXp(language: Language, xp: number): string {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(Math.floor(xp));
}

/** How far through its current level an amount of experience is, in percent. */
export function percentThrough(progress: LevelProgress): number {
    const span = progress.nextLevelAt - progress.levelStart;
    return span === 0 ? 0 : ((progress.xp - progress.levelStart) / span) * 100;
}
