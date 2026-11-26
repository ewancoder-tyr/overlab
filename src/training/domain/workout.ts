import { ExerciseId } from '@catalog/domain/exercise';
import { IsoDateTime, byOccurrence } from '@shared/domain/event';
import { CardioPerformed, isCardioPerformed } from './cardio';
import { SetPerformed, isSetPerformed, isStandalone, primaryExerciseId } from './set';

/** Sets (and cardio bouts) separated by less than this belong to the same workout. */
export const WORKOUT_GAP_MS = 3 * 60 * 60 * 1000;

/**
 * A workout is never stored. It is derived from the time between sets, so there is nothing to
 * start or stop and a forgotten "finish" button cannot corrupt the history.
 */
export interface Workout {
    readonly startedAt: IsoDateTime;
    readonly endedAt: IsoDateTime;
    readonly sets: readonly SetPerformed[];
    /** The cardio bouts of the workout. A workout may be cardio only, sets only, or both. */
    readonly cardio: readonly CardioPerformed[];
}

/**
 * All the sets of one exercise within one workout. For standalone sets, which belong to no
 * workout, a session is a run of them less than `WORKOUT_GAP_MS` apart (`standaloneSessions`).
 */
export interface ExerciseSession {
    readonly exerciseId: ExerciseId;
    /** Start of the workout; for a standalone session, the time of its first set. */
    readonly workoutStartedAt: IsoDateTime;
    readonly sets: readonly SetPerformed[];
}

/** All the cardio bouts of one exercise within one workout. */
export interface CardioSession {
    readonly exerciseId: ExerciseId;
    readonly workoutStartedAt: IsoDateTime;
    readonly bouts: readonly CardioPerformed[];
}

/** Anything done in a workout. Both kinds count when deciding where a workout starts and ends. */
type Activity = SetPerformed | CardioPerformed;

/** Sets and cardio bouts as one timeline, in the order they happened. */
function timeline(
    sets: readonly SetPerformed[],
    cardio: readonly CardioPerformed[],
): readonly Activity[] {
    return [...sets, ...cardio].sort(byOccurrence);
}

/**
 * Projection: splits sets and cardio bouts into workouts wherever the gap between two
 * consecutive ones reaches `WORKOUT_GAP_MS`. A day of nothing but running is a workout too.
 */
export function groupIntoWorkouts(
    sets: readonly SetPerformed[],
    cardio: readonly CardioPerformed[] = [],
): readonly Workout[] {
    const groups: Activity[][] = [];
    let previousTime = Number.NEGATIVE_INFINITY;

    for (const activity of timeline(sets, cardio)) {
        const time = Date.parse(activity.occurredAt);
        const current = groups.at(-1);
        if (current === undefined || time - previousTime >= WORKOUT_GAP_MS) {
            groups.push([activity]);
        } else {
            current.push(activity);
        }
        previousTime = time;
    }

    return groups.flatMap((group) => {
        const first = group.at(0);
        const last = group.at(-1);
        // Groups are never empty, but the compiler cannot know that; this keeps us honest
        // without a non-null assertion.
        return first === undefined || last === undefined
            ? []
            : [
                  {
                      startedAt: first.occurredAt,
                      endedAt: last.occurredAt,
                      sets: group.filter(isSetPerformed),
                      cardio: group.filter(isCardioPerformed),
                  },
              ];
    });
}

/**
 * The workout in progress: the latest one, as long as its last set is less than the gap ago.
 * After that the next set would start a new workout, so there is no current one.
 */
export function currentWorkout(workouts: readonly Workout[], now: Date): Workout | undefined {
    const latest = workouts.at(-1);
    if (latest === undefined) {
        return undefined;
    }
    return now.getTime() - Date.parse(latest.endedAt) < WORKOUT_GAP_MS ? latest : undefined;
}

/**
 * Projection: the history of one exercise as one session per workout, oldest first.
 * A set belongs to the exercise of its first rep group.
 */
export function exerciseSessions(
    workouts: readonly Workout[],
    exerciseId: ExerciseId,
): readonly ExerciseSession[] {
    return workouts.flatMap((workout) => {
        const sets = workout.sets.filter((set) => primaryExerciseId(set) === exerciseId);
        return sets.length === 0 ? [] : [{ exerciseId, workoutStartedAt: workout.startedAt, sets }];
    });
}

/**
 * Projection: the standalone history of one exercise, oldest first. Standalone sets are not
 * grouped into workouts at all: each exercise has its own sessions, split wherever two
 * consecutive standalone sets of it are `WORKOUT_GAP_MS` or more apart. So 10 push-ups and 8
 * more twenty minutes later are one session of 18, the evening's are another, and stretching
 * done in between belongs to neither.
 *
 * These sessions are a history of their own, never mixed with the workout ones
 * (`exerciseSessions`): 10 easy push-ups each morning say nothing about 30 done to failure at
 * the gym, and the other way round.
 *
 * @param sets - the active sets, standalone or not, in any order.
 */
export function standaloneSessions(
    sets: readonly SetPerformed[],
    exerciseId: ExerciseId,
): readonly ExerciseSession[] {
    const sessions: {
        exerciseId: ExerciseId;
        workoutStartedAt: IsoDateTime;
        sets: SetPerformed[];
    }[] = [];
    let previousTime = Number.NEGATIVE_INFINITY;
    const mine = sets
        .filter((set) => isStandalone(set) && primaryExerciseId(set) === exerciseId)
        .sort(byOccurrence); // `filter` made a copy, so sorting in place is safe.

    for (const set of mine) {
        const time = Date.parse(set.occurredAt);
        const current = sessions.at(-1);
        if (current === undefined || time - previousTime >= WORKOUT_GAP_MS) {
            sessions.push({ exerciseId, workoutStartedAt: set.occurredAt, sets: [set] });
        } else {
            current.sets.push(set);
        }
        previousTime = time;
    }
    return sessions;
}

/** An exercise counts as a standalone habit while it was done standalone within this many days. */
export const STANDALONE_HABIT_DAYS = 30;

/**
 * Projection: the exercises done standalone lately, each with the sets of its standalone
 * session in progress (empty when there is none, see `standaloneInProgressSince`).
 *
 * These are the user's habits outside workouts (push-ups every morning), which the Train page
 * pins to its top. "Lately" is the last `STANDALONE_HABIT_DAYS` days: a habit that was dropped
 * leaves the list by itself, as a dropped exercise stops marking its muscle group, and one
 * standalone set brings it back. Nothing is stored or asked.
 *
 * @param sets - the active sets, standalone or not, in any order.
 */
export function standaloneHabits(
    sets: readonly SetPerformed[],
    now: Date,
): ReadonlyMap<ExerciseId, readonly SetPerformed[]> {
    const since = now.getTime() - STANDALONE_HABIT_DAYS * 24 * 60 * 60 * 1000;
    const recent = new Set<ExerciseId>();
    for (const set of sets) {
        const id = primaryExerciseId(set);
        if (id !== undefined && isStandalone(set) && Date.parse(set.occurredAt) > since) {
            recent.add(id);
        }
    }
    const habits = new Map<ExerciseId, readonly SetPerformed[]>();
    for (const id of recent) {
        const sessions = standaloneSessions(sets, id);
        const inProgress = standaloneInProgressSince(sessions, now) !== undefined;
        habits.set(id, inProgress ? (sessions.at(-1)?.sets ?? []) : []);
    }
    return habits;
}

/**
 * When the standalone session in progress started: the latest one, as long as its last set is
 * less than the gap ago (another set now would still join it). The standalone counterpart of
 * `currentWorkout`.
 *
 * @param sessions - one exercise's standalone sessions, oldest first.
 */
export function standaloneInProgressSince(
    sessions: readonly ExerciseSession[],
    now: Date,
): IsoDateTime | undefined {
    const latest = sessions.at(-1);
    const last = latest?.sets.at(-1);
    if (latest === undefined || last === undefined) {
        return undefined;
    }
    return now.getTime() - Date.parse(last.occurredAt) < WORKOUT_GAP_MS
        ? latest.workoutStartedAt
        : undefined;
}

/** Projection: the history of one cardio exercise as one session per workout, oldest first. */
export function cardioSessions(
    workouts: readonly Workout[],
    exerciseId: ExerciseId,
): readonly CardioSession[] {
    return workouts.flatMap((workout) => {
        const bouts = workout.cardio.filter((bout) => bout.exerciseId === exerciseId);
        return bouts.length === 0
            ? []
            : [{ exerciseId, workoutStartedAt: workout.startedAt, bouts }];
    });
}

/** The distinct exercises of a workout, lifting and cardio, in the order first performed. */
export function exercisesOf(workout: Workout): readonly ExerciseId[] {
    const ids = new Set<ExerciseId>();
    for (const activity of timeline(workout.sets, workout.cardio)) {
        const id = isCardioPerformed(activity) ? activity.exerciseId : primaryExerciseId(activity);
        if (id !== undefined) {
            ids.add(id); // A Set keeps insertion order.
        }
    }
    return [...ids];
}
