import { ExerciseId } from '@catalog/domain/exercise';
import { IsoDateTime } from '@shared/domain/event';
import { WORKOUT_GAP_MS, Workout } from '@training/domain/workout';
import { REASON_ORDER, XpEntry, XpReason } from './experience';
import { CHARACTER_SCALE, EXERCISE_SCALE, levelOf } from './level';

/** What one reason earned an exercise in one workout: "Weight record ×2, +100". */
export interface ReasonLine {
    readonly reason: XpReason;
    /** How many times it was earned: sets, records, bouts. */
    readonly count: number;
    readonly xp: number;
}

/** What one exercise earned in one workout, and the level it reached. */
export interface ExerciseLine {
    readonly exerciseId: ExerciseId;
    readonly xp: number;
    /** In `REASON_ORDER`: the proudest first, the plain sets last. */
    readonly reasons: readonly ReasonLine[];
    readonly levelBefore: number;
    readonly levelAfter: number;
}

/** One workout's worth of experience. */
export interface WorkoutExperience {
    readonly startedAt: IsoDateTime;
    readonly endedAt: IsoDateTime;
    readonly xp: number;
    /** The character's level before this workout and after it. */
    readonly levelBefore: number;
    readonly levelAfter: number;
    /** Most experience first. */
    readonly exercises: readonly ExerciseLine[];
}

/**
 * Projection: the experience history, one entry per workout that earned anything, newest first.
 * Each says when, how much, for what (per exercise and reason) and which levels it reached.
 *
 * It only regroups the ledger (`Experience.entries`), so it always adds up to the total: the
 * same rules, the same reset, nothing judged twice. Every entry's moment is that of a set or a
 * bout. Those inside a workout's span are filed under it. The rest were earned by standalone
 * sets, which belong to no workout: they are listed as entries of their own, a run of them less
 * than the workout gap apart making one (`periodsOf`).
 */
export function experienceHistory(
    entries: readonly XpEntry[],
    workouts: readonly Workout[],
): readonly WorkoutExperience[] {
    const history: WorkoutExperience[] = [];
    // Running totals, to tell the level before and after each workout.
    let character = 0;
    const perExercise = new Map<ExerciseId, number>();

    for (const { startedAt, endedAt, entries: mine } of periodsOf(entries, workouts)) {
        const byExercise = new Map<ExerciseId, XpEntry[]>();
        for (const entry of mine) {
            byExercise.set(entry.exerciseId, [...(byExercise.get(entry.exerciseId) ?? []), entry]);
        }
        const exercises = [...byExercise].map(([exerciseId, earned]): ExerciseLine => {
            const before = perExercise.get(exerciseId) ?? 0;
            const xp = sum(earned);
            perExercise.set(exerciseId, before + xp);
            return {
                exerciseId,
                xp,
                reasons: REASON_ORDER.flatMap((reason) => {
                    const forReason = earned.filter((entry) => entry.reason === reason);
                    return forReason.length === 0
                        ? []
                        : [{ reason, count: forReason.length, xp: sum(forReason) }];
                }),
                levelBefore: levelOf(before, EXERCISE_SCALE).level,
                levelAfter: levelOf(before + xp, EXERCISE_SCALE).level,
            };
        });
        exercises.sort((a, b) => b.xp - a.xp);

        const xp = sum(mine);
        history.push({
            startedAt,
            endedAt,
            xp,
            levelBefore: levelOf(character, CHARACTER_SCALE).level,
            levelAfter: levelOf(character + xp, CHARACTER_SCALE).level,
            exercises,
        });
        character += xp;
    }
    return history.reverse();
}

/** A stretch of time with the experience earned in it: a workout, or a run of standalone sets. */
interface Period {
    startedAt: IsoDateTime;
    endedAt: IsoDateTime;
    readonly entries: XpEntry[];
}

/**
 * Files every entry under a period, oldest period first; periods that earned nothing are left
 * out. An entry inside a workout's span goes to that workout (a standalone set done in the
 * middle of a workout is simply listed with it). Any other starts or joins a standalone period.
 *
 * @param entries - oldest first, as in `Experience.entries`.
 * @param workouts - oldest first; their spans never overlap.
 */
function periodsOf(entries: readonly XpEntry[], workouts: readonly Workout[]): readonly Period[] {
    const ofWorkouts = workouts.map((workout): Period => ({
        startedAt: workout.startedAt,
        endedAt: workout.endedAt,
        entries: [],
    }));
    const standalone: Period[] = [];
    let next = 0; // The first workout that has not ended before the entry at hand.
    for (const entry of entries) {
        while ((ofWorkouts[next]?.endedAt ?? entry.at) < entry.at) {
            next++;
        }
        const workout = ofWorkouts[next];
        if (workout !== undefined && entry.at >= workout.startedAt) {
            workout.entries.push(entry);
            continue;
        }
        const current = standalone.at(-1);
        if (
            current !== undefined &&
            Date.parse(entry.at) - Date.parse(current.endedAt) < WORKOUT_GAP_MS
        ) {
            current.entries.push(entry);
            current.endedAt = entry.at;
        } else {
            standalone.push({ startedAt: entry.at, endedAt: entry.at, entries: [entry] });
        }
    }
    return [...ofWorkouts, ...standalone]
        .filter((period) => period.entries.length > 0)
        .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
}

function sum(entries: readonly XpEntry[]): number {
    return entries.reduce((total, entry) => total + entry.xp, 0);
}
