import { ExerciseId } from '@catalog/domain/exercise';
import { byOccurrence } from '@shared/domain/event';
import { SetPerformed, primaryExerciseId } from './set';
import { Workout, currentWorkout } from './workout';

/**
 * Ten minutes with nothing logged. After it, rest is no longer shown and workout time stops.
 *
 * A display rule only. It is not `WORKOUT_GAP_MS` (3 hours), which decides where one workout ends
 * and the next begins: a 20-minute chat between two sets hides the timers but keeps the workout.
 */
export const IDLE_LIMIT_MS = 10 * 60_000;

/**
 * Projection: when the current rest began, or `undefined` when there is no rest to show.
 *
 * Rest is derived from the log and never stored: it counts from the most recent set, of any
 * exercise and any kind (a warm-up is followed by rest too). With no `RestStarted` event and no
 * timer state, it survives reloads and app switches and needs nothing to sync.
 *
 * `sets` are the active (non-voided) sets of workouts, so voiding the latest set moves rest back
 * to the one before it. Cardio bouts are not passed in at all, and neither are standalone sets
 * (`workoutSets`): only a workout's sets start rest.
 */
export function restStart(sets: readonly SetPerformed[], now: Date): Date | undefined {
    const latest = latestSet(sets, now);
    return latest === undefined ? undefined : new Date(latest.occurredAt);
}

/**
 * Projection: the current exercise, the one whose set started the current rest (the primary
 * exercise of the latest set), or `undefined` when there is no rest to show.
 *
 * It decides which rest alert applies (see `restAlertFor`) and which exercise the Train page
 * highlights, so the user can find the way back to it.
 */
export function currentExercise(sets: readonly SetPerformed[], now: Date): ExerciseId | undefined {
    const latest = latestSet(sets, now);
    return latest === undefined ? undefined : primaryExerciseId(latest);
}

/**
 * The set the current rest counts from: the latest, if it is within the idle limit.
 */
function latestSet(sets: readonly SetPerformed[], now: Date): SetPerformed | undefined {
    // The latest by `occurredAt`, then `id`, rather than the last in the array: "latest" must
    // not depend on the order events were stored in, and a tie must pick the same set on every
    // device.
    const latest = sets.reduce<SetPerformed | undefined>(
        (best, set) => (best === undefined || byOccurrence(set, best) > 0 ? set : best),
        undefined,
    );
    if (latest === undefined) {
        return undefined;
    }
    return withinIdleLimit(new Date(latest.occurredAt), now) ? latest : undefined;
}

/** The two rest alerts, in seconds, 0 meaning off. Both are preferences. */
export interface RestAlerts {
    /** Between sets of the same exercise: while on the current exercise's logging screen. */
    readonly sameExercise: number;
    /** Before moving on: on any other screen, including another exercise and the Train list. */
    readonly switchExercise: number;
}

/**
 * Rule: which rest alert applies, given the exercise whose logging screen is open (`undefined`
 * for any other page). Only the current exercise's own screen means "another set of the same";
 * everywhere else the user is moving on, or deciding to, and gets the longer rest.
 *
 * It depends on where the user is, not on what they log next, because the alert has to go off
 * before the next set exists. Going back into the current exercise brings the shorter alert back.
 */
export function restAlertFor(
    alerts: RestAlerts,
    current: ExerciseId | undefined,
    viewing: ExerciseId | undefined,
): number {
    return current !== undefined && current === viewing
        ? alerts.sameExercise
        : alerts.switchExercise;
}

/**
 * How long the workout in progress has lasted.
 *
 * - `running`: something was logged within the idle limit. The time is `now - startedAt`, and
 *   `endsAt` is undefined because the end is not known yet.
 * - Stopped: the idle limit has passed. The time is `endsAt - startedAt`, from the first to the
 *   last activity. The idle minutes are not added: the workout ended with its last set.
 */
export interface WorkoutTime {
    readonly startedAt: Date;
    readonly endsAt: Date | undefined;
    readonly running: boolean;
}

/**
 * Projection: the workout time of the workout in progress, or `undefined` between workouts.
 *
 * It reuses the workout grouping (activities less than 3 hours apart), so a cardio warm-up starts
 * the clock, and logging again after a pause shorter than 3 hours resumes the same workout and
 * so the same time, pause included. A stopped time stays available for as long as the workout is
 * still in progress, so the finished total can be shown.
 */
export function workoutTime(workouts: readonly Workout[], now: Date): WorkoutTime | undefined {
    // `groupIntoWorkouts` already sorted the activities by `occurredAt`, then `id`.
    const workout = currentWorkout(workouts, now);
    if (workout === undefined) {
        return undefined;
    }
    const startedAt = new Date(workout.startedAt);
    const lastActivity = new Date(workout.endedAt);
    const running = withinIdleLimit(lastActivity, now);
    return { startedAt, endsAt: running ? undefined : lastActivity, running };
}

/**
 * Elapsed time for a stopwatch: `m:ss` below an hour, `h:mm:ss` from an hour. The digits are the
 * same in every language, so this takes none. A negative span (a clock set back) shows 0:00.
 */
export function formatElapsed(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return hours === 0
        ? `${minutes}:${seconds}`
        : `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
}

function withinIdleLimit(time: Date, now: Date): boolean {
    return now.getTime() - time.getTime() <= IDLE_LIMIT_MS;
}
