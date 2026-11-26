/**
 * Where an amount of experience stands on the level curve: the level reached and the span of
 * experience that level covers, for drawing the bar towards the next one.
 */
export interface LevelProgress {
    /** 1 for a beginner with no experience at all. */
    readonly level: number;
    readonly xp: number;
    /** The experience at which `level` was reached. */
    readonly levelStart: number;
    /** The experience at which the next level is reached. */
    readonly nextLevelAt: number;
}

/**
 * How steep the curves are: level L needs `scale × (L − 1)²` experience in total.
 *
 * The character's curve is tuned to a lifter who does about 60 working sets a week (some
 * 900 XP with the bonuses): level 2 after the first workout, level 10 after about a month and a
 * half, level 30 after about a year, level 50 after some three years.
 *
 * An exercise gets a small share of that, so its curve is flatter: one set reaches level 2,
 * and five sets a week reach level 10 in about four months.
 */
export const CHARACTER_SCALE = 50;
export const EXERCISE_SCALE = 10;

/** The total experience needed to reach `level`. */
export function experienceFor(level: number, scale: number): number {
    return scale * (level - 1) ** 2;
}

/**
 * The level curve: quadratic in the total, so every level costs a fixed `2 × scale` more than
 * the one before. That is the RPG feel of "each level takes longer" without the exponential
 * wall that would stop anyone levelling up in their second year of training.
 */
export function levelOf(xp: number, scale: number): LevelProgress {
    // The square root gives the level directly; the two loops only correct a float that lands a
    // hair below a whole number (sqrt of 81.00000000000001 and the like).
    let level = Math.floor(Math.sqrt(Math.max(0, xp) / scale)) + 1;
    while (experienceFor(level + 1, scale) <= xp) {
        level++;
    }
    while (level > 1 && experienceFor(level, scale) > xp) {
        level--;
    }
    return {
        level,
        xp,
        levelStart: experienceFor(level, scale),
        nextLevelAt: experienceFor(level + 1, scale),
    };
}
