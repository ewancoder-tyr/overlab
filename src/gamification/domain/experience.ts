import { matchedOrBeaten, cardioHistory } from '@analytics/domain/cardio-progression';
import { cardioRecords } from '@analytics/domain/cardio-records';
import { SessionProgress, exerciseProgress } from '@analytics/domain/exercise-progress';
import { topSet } from '@analytics/domain/records';
import { isStalled, stalledFor } from '@analytics/domain/stall';
import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId, isCardio } from '@catalog/domain/exercise';
import { IsoDateTime } from '@shared/domain/event';
import { SetPerformed, isEasy, primaryExerciseId, totalReps } from '@training/domain/set';
import {
    Workout,
    cardioSessions,
    exerciseSessions,
    standaloneSessions,
} from '@training/domain/workout';
import { CHARACTER_SCALE, EXERCISE_SCALE, LevelProgress, levelOf } from './level';

/**
 * How much experience each thing is worth (docs/rules/experience.md).
 *
 * Absolute weight earns nothing by itself: loads are stored in kg or lb as entered, per hand
 * for dumbbells, negative when assisted, and a leg press moves ten times what a lateral raise
 * does. Weight earns through progress instead: going heavier than last time or than ever is
 * what the bonuses pay for.
 */
export const XP = {
    /** A working set. A light set gets the light set weight of it, a warm-up nothing. */
    set: 10,
    /**
     * An easy set: half a set, whatever the light set weight. Showing up is worth something,
     * and adding a rep still pays through the bonuses below.
     */
    easySet: 5,
    /**
     * On top of `set` for a set taken to failure: 12 in all. Kept small on purpose. Effort is
     * one self-reported tap, the usual set is already close to failure (about 1 rep in reserve),
     * and failure on every heavy squat is no habit to pay for. Beating last time must still be
     * worth far more.
     */
    failure: 2,
    /** A session of an exercise that beat the previous one on its setup. */
    sessionBeaten: 30,
    /** A set heavier than any before it on its setup. */
    weightRecord: 50,
    /** A set with more reps than any before it at the heaviest load. */
    repRecord: 25,
    /** The first beaten session after a stall: on top of `sessionBeaten`. */
    stallBroken: 50,
    /** Every minute of cardio. */
    cardioMinute: 1,
    /** A cardio session that matched or beat the one before (the cardio match rule). */
    cardioMatched: 30,
    /** A cardio session that set a record. */
    cardioRecord: 50,
} as const;

/** Why experience was earned: each amount in `XP` is one reason. */
export type XpReason =
    | 'set'
    | 'failure'
    | 'beaten'
    | 'weight-record'
    | 'rep-record'
    | 'stall-broken'
    | 'cardio-time'
    | 'cardio-matched'
    | 'cardio-record';

/**
 * The order reasons are told in: the rarest and proudest first, the plain set or minute last.
 */
export const REASON_ORDER: readonly XpReason[] = [
    'weight-record',
    'rep-record',
    'cardio-record',
    'stall-broken',
    'beaten',
    'cardio-matched',
    'failure',
    'set',
    'cardio-time',
];

/**
 * One earning: so much experience, for one reason, on one exercise, at one moment (the time of
 * the set or bout, or of a session's last one for a session bonus). The totals are these added
 * up, and the experience history lists them.
 */
export interface XpEntry {
    readonly at: IsoDateTime;
    readonly exerciseId: ExerciseId;
    readonly reason: XpReason;
    readonly xp: number;
}

/** The rules experience depends on that are the user's preferences. */
export interface ExperienceRules {
    /** What a light set is worth, 0 to 1, as in weekly volume. */
    readonly lightSetWeight: number;
    /** Sessions without progress that make a stall; 0 means no stalls, so no stall bonus. */
    readonly stallThreshold: number;
}

export interface ExerciseExperience {
    readonly exerciseId: ExerciseId;
    readonly progress: LevelProgress;
}

export interface Experience {
    /** The character: all the experience of every exercise added up. */
    readonly progress: LevelProgress;
    /** Every exercise with any experience, most first (ties in catalog order). */
    readonly byExercise: readonly ExerciseExperience[];
    /**
     * The same total split by why it was earned. Comparing two readings tells what a new set
     * earned and for what: "+90 XP: beat last time, weight record".
     */
    readonly byReason: ReadonlyMap<XpReason, number>;
    /** Every earning, oldest first (by `at`; same moment, a set before its bonuses). */
    readonly entries: readonly XpEntry[];
}

/**
 * Projection: the experience earned since `epoch` (the latest reset; all history when there is
 * none), per exercise and in total, with the level of each.
 *
 * Everything is derived again from the log on every change, so tuning the numbers above
 * recomputes everyone's level, and voiding a set takes its experience back.
 *
 * What is judged against the past (beaten, records, stalls) is judged against ALL of history,
 * the time before the reset included: a reset wipes the experience, not the lifter's strength,
 * so after one a record bonus still means a real all-time best. Only when it was earned decides
 * whether it counts: a set by its own time, a session's bonus by the time of its last set.
 *
 * @param standalone - the standalone sets, which are in no workout. They earn like any set, and
 *   their sessions (`standaloneSessions`) are judged among themselves.
 */
export function experience(
    workouts: readonly Workout[],
    catalog: Catalog,
    epoch: IsoDateTime | undefined,
    rules: ExperienceRules,
    standalone: readonly SetPerformed[] = [],
): Experience {
    const counts = (time: IsoDateTime | undefined): boolean =>
        time !== undefined && (epoch === undefined || time > epoch);
    const totals = new Map<ExerciseId, number>();
    const reasons = new Map<XpReason, number>();
    const entries: XpEntry[] = [];
    const add = (exerciseId: ExerciseId, reason: XpReason, xp: number, at: IsoDateTime): void => {
        totals.set(exerciseId, (totals.get(exerciseId) ?? 0) + xp);
        reasons.set(reason, (reasons.get(reason) ?? 0) + xp);
        entries.push({ at, exerciseId, reason, xp });
    };

    const lifting = new Set<ExerciseId>();
    const cardio = new Set<ExerciseId>();

    // Standalone sets are run through the same loop as a "workout" with no cardio.
    for (const workout of [...workouts, { sets: standalone, cardio: [] }]) {
        for (const set of workout.sets) {
            const primary = primaryExerciseId(set);
            if (primary !== undefined) {
                lifting.add(primary);
            }
            if (set.kind !== 'working' || !counts(set.occurredAt)) {
                continue;
            }
            const repsInSet = totalReps(set);
            if (repsInSet === 0) {
                continue;
            }
            const setXp = isEasy(set)
                ? XP.easySet
                : XP.set * (set.effort?.kind === 'light' ? rules.lightSetWeight : 1);
            // Effort is one kind or another, so a light set is never also to failure.
            const failureXp = set.effort?.kind === 'failure' ? XP.failure : 0;
            // A set that mixes exercises is split by each one's share of its reps, as in
            // weekly volume: 4 curls and 4 hammer curls give each half a set's experience.
            // Shares are gathered per exercise first, so a set is one entry per exercise even
            // when it alternates them rep by rep.
            const shares = new Map<ExerciseId, number>();
            for (const group of set.repGroups) {
                const exercise = catalog.findExercise(group.exerciseId);
                // Unknown exercises are skipped (tolerant reader), and so are the sets logged
                // for cardio on the 0.3.0 day: their reps stood for minutes or distances.
                if (exercise !== undefined && !isCardio(exercise)) {
                    shares.set(
                        exercise.id,
                        (shares.get(exercise.id) ?? 0) + group.reps / repsInSet,
                    );
                }
            }
            for (const [exerciseId, share] of shares) {
                add(exerciseId, 'set', setXp * share, set.occurredAt);
                if (failureXp > 0) {
                    add(exerciseId, 'failure', failureXp * share, set.occurredAt);
                }
            }
        }
        for (const bout of workout.cardio) {
            cardio.add(bout.exerciseId);
            if (counts(bout.occurredAt) && catalog.findExercise(bout.exerciseId) !== undefined) {
                add(
                    bout.exerciseId,
                    'cardio-time',
                    (XP.cardioMinute * (bout.durationSeconds ?? 0)) / 60,
                    bout.occurredAt,
                );
            }
        }
    }

    for (const exerciseId of lifting) {
        const exercise = catalog.findExercise(exerciseId);
        if (exercise === undefined || isCardio(exercise)) {
            continue;
        }
        // The workout sessions and the standalone ones are two histories, each judged alone.
        for (const sessions of [
            exerciseSessions(workouts, exerciseId),
            standaloneSessions(standalone, exerciseId),
        ]) {
            sessionBonuses(exerciseProgress(sessions, catalog), exerciseId);
        }
    }

    /** The bonuses of one history of one exercise: records set, sessions beaten, stalls broken. */
    function sessionBonuses(progress: readonly SessionProgress[], exerciseId: ExerciseId): void {
        for (const record of recordsSet(progress, exerciseId, catalog)) {
            if (counts(record.at)) {
                add(
                    exerciseId,
                    record.kind,
                    record.kind === 'weight-record' ? XP.weightRecord : XP.repRecord,
                    record.at,
                );
            }
        }
        progress.forEach((session, index) => {
            const last = session.sets.at(-1)?.occurredAt;
            if (session.verdict !== 'up' || last === undefined || !counts(last)) {
                return;
            }
            // An easy session is paid for beating last time, never for only matching it: the
            // same ten easy push-ups every morning must not out-earn sets taken to failure.
            add(exerciseId, 'beaten', XP.sessionBeaten, last);
            // Was the exercise stalled up to this session? Then this one broke the stall.
            // Not an easy one: the stall count skips those, so they cannot end a stall.
            const before = stalledFor(progress.slice(0, index), false);
            if (!session.easy && isStalled(before, rules.stallThreshold)) {
                add(exerciseId, 'stall-broken', XP.stallBroken, last);
            }
        });
    }

    for (const exerciseId of cardio) {
        if (catalog.findExercise(exerciseId) === undefined) {
            continue;
        }
        const sessions = cardioSessions(workouts, exerciseId);
        const history = cardioHistory(sessions);
        const records = cardioRecords(sessions);
        sessions.forEach((session, index) => {
            const last = session.bouts.at(-1)?.occurredAt;
            if (last === undefined || !counts(last)) {
                return;
            }
            const outcome = history[index]?.comparison?.outcome;
            const matched = outcome !== undefined && matchedOrBeaten(outcome);
            const record = records[index]?.record !== undefined;
            if (matched) {
                add(exerciseId, 'cardio-matched', XP.cardioMatched, last);
            }
            if (record) {
                add(exerciseId, 'cardio-record', XP.cardioRecord, last);
            }
        });
    }

    const catalogOrder = (id: ExerciseId): number =>
        catalog.exercises.findIndex((exercise) => exercise.id === id);
    const byExercise = [...totals]
        .filter(([, xp]) => xp > 0)
        .sort(([a, xpA], [b, xpB]) => xpB - xpA || catalogOrder(a) - catalogOrder(b))
        .map(([exerciseId, xp]) => ({ exerciseId, progress: levelOf(xp, EXERCISE_SCALE) }));
    const total = byExercise.reduce((sum, entry) => sum + entry.progress.xp, 0);
    // Gathered pass by pass (sets, then bonuses), so put into time order. The sort is stable:
    // at the same moment a set stays before the bonuses it earned.
    entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return {
        progress: levelOf(total, CHARACTER_SCALE),
        byExercise,
        byReason: reasons,
        entries,
    };
}

/** A set that was a new best on its setup when it was done. */
interface RecordSet {
    readonly kind: 'weight-record' | 'rep-record';
    readonly at: IsoDateTime;
}

/**
 * Every set that set a new best on its setup at the time it was done. Unlike the record
 * standings (`recordsOf`), which move to whoever holds a record now, this asks "was it a best
 * when it happened?". Experience earned must not disappear when a later, heavier set takes the
 * record over.
 *
 * As in the records rule, a set is judged on its top load and the full reps at it, and the first
 * session on a setup is the baseline: it sets the bests but earns nothing. Every set that beats
 * the best so far counts, several in one session included: a second record in the same workout
 * is as real as the first.
 */
function recordsSet(
    progress: readonly SessionProgress[],
    exerciseId: ExerciseId,
    catalog: Catalog,
): readonly RecordSet[] {
    // Sets on the default setup have no `setupId`; '' gives them a stable map key.
    const bests = new Map<string, { kilograms: number; reps: number }>();
    const records: RecordSet[] = [];
    for (const session of progress) {
        const key = session.setupId ?? '';
        const baseline = !bests.has(key);
        for (const set of session.sets) {
            const top = topSet(set, exerciseId, catalog);
            if (top === undefined) {
                continue;
            }
            const best = bests.get(key);
            let kind: RecordSet['kind'] | undefined;
            if (best === undefined || top.kilograms > best.kilograms) {
                kind = 'weight-record';
            } else if (top.kilograms === best.kilograms && top.reps > best.reps) {
                kind = 'rep-record';
            }
            if (kind !== undefined) {
                bests.set(key, { kilograms: top.kilograms, reps: top.reps });
                if (!baseline) {
                    records.push({ kind, at: set.occurredAt });
                }
            }
        }
    }
    return records;
}
