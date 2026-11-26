import { ExerciseId } from '@catalog/domain/exercise';
import { Experience, REASON_ORDER, XpReason } from './experience';

/** An exercise that reached a new level. */
export interface ExerciseLevelUp {
    readonly exerciseId: ExerciseId;
    readonly level: number;
}

/** Part of a gain: how much of it was earned for one reason. */
export interface ReasonGain {
    readonly reason: XpReason;
    readonly xp: number;
}

/** What changed between two readings of experience, when the user earned some. */
export interface ExperienceGain {
    /** Experience earned, whole points (the screen never shows fractions). */
    readonly xp: number;
    /** The exercise that earned the most of it, to name it next to the number. */
    readonly exerciseId: ExerciseId | undefined;
    /** The character's new level, when it went up. */
    readonly levelUp: number | undefined;
    /** Exercises that reached a new level, most experience first. */
    readonly exerciseLevelUps: readonly ExerciseLevelUp[];
    /** What the experience was earned for, in `REASON_ORDER`; only reasons that grew. */
    readonly reasons: readonly ReasonGain[];
}

/**
 * What to celebrate after experience changed from `before` to `after`; `undefined` when
 * nothing was earned.
 *
 * Experience can also go down (a voided set, starting from scratch) or change because a rule
 * did (the light set weight). Only a whole point more is a gain: nobody cheers for a point lost,
 * and half a point from a split set is not yet a number the screen would show.
 */
export function experienceGain(before: Experience, after: Experience): ExperienceGain | undefined {
    const xp = Math.floor(after.progress.xp) - Math.floor(before.progress.xp);
    if (xp <= 0) {
        return undefined;
    }
    const earlier = new Map(before.byExercise.map((entry) => [entry.exerciseId, entry.progress]));
    let exerciseId: ExerciseId | undefined;
    let most = 0;
    const exerciseLevelUps: ExerciseLevelUp[] = [];
    // `byExercise` is most experience first, so level-ups come out in that order too.
    for (const entry of after.byExercise) {
        const previous = earlier.get(entry.exerciseId);
        const gained = entry.progress.xp - (previous?.xp ?? 0);
        if (gained > most) {
            most = gained;
            exerciseId = entry.exerciseId;
        }
        if (entry.progress.level > (previous?.level ?? 1)) {
            exerciseLevelUps.push({ exerciseId: entry.exerciseId, level: entry.progress.level });
        }
    }
    const reasons = REASON_ORDER.flatMap((reason) => {
        const gained = Math.round(
            (after.byReason.get(reason) ?? 0) - (before.byReason.get(reason) ?? 0),
        );
        return gained > 0 ? [{ reason, xp: gained }] : [];
    });
    return {
        xp,
        exerciseId,
        levelUp: after.progress.level > before.progress.level ? after.progress.level : undefined,
        exerciseLevelUps,
        reasons,
    };
}
