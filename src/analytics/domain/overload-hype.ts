import { Catalog } from '@catalog/domain/catalog';
import { Exercise, ExerciseId, isCardio } from '@catalog/domain/exercise';
import { DEFAULT_TECHNIQUE_ID } from '@catalog/domain/technique';
import { Language, Localized } from '@shared/domain/language';
import { CardioTotals, cardioTotals } from '@training/domain/cardio';
import { formatReps, formatWeight } from '@training/domain/load-wording';
import { LoadUnit, RepGroup, SetPerformed } from '@training/domain/set';
import { ExerciseSession, Workout, cardioSessions } from '@training/domain/workout';
import { describeTarget } from './cardio-wording';
import { comparableLoad } from './progression';

/**
 * One line of pre-workout hype: what you did on an exercise last time and the number to go for
 * today, both already worded: `{ exercise: 'Bench press', last: '25 kg', target: '30 kg' }`.
 * Worded in the user's language, because the server only slots these into its sentences.
 *
 * It feeds the gym day reminder. For lifting it is deliberately bolder than the progression rule
 * (which is satisfied by a single extra rep): a reminder is there to fire you up, not to plan the
 * session. For cardio it is the session to match, nothing more (see `cardioHypeFor`).
 */
export interface OverloadHype {
    readonly exercise: string;
    readonly last: string;
    readonly target: string;
    /** Cardio is roasted in other words: nobody's 5 km run has a warm-up weight. */
    readonly cardio: boolean;
}

/**
 * How much load the hype adds: one plate on each end of a bar, or the next dumbbell up.
 * Per-side loads (dumbbells) move in smaller steps than a barbell or a machine stack.
 */
const LOAD_JUMP: Record<LoadUnit, { readonly total: number; readonly perSide: number }> = {
    kg: { total: 5, perSide: 2.5 },
    lb: { total: 10, perSide: 5 },
};

const PER_SIDE: Localized<string> = { en: 'per side', ru: 'на руку' };

/** The best full-range rep group: the heaviest, and among equally heavy ones the longest. */
function topRepGroup(groups: readonly RepGroup[]): RepGroup | undefined {
    return groups.toSorted(
        (a, b) => comparableLoad(b.load) - comparableLoad(a.load) || b.reps - a.reps,
    )[0];
}

function hypeFor(exercise: Exercise, top: RepGroup, language: Language): OverloadHype {
    // Bodyweight work is pushed by reps: 10 pull-ups last time, 11 today.
    if (exercise.loadType === 'bodyweight') {
        return {
            exercise: exercise.name[language],
            last: formatReps(language, top.reps),
            target: formatReps(language, top.reps + 1),
            cardio: false,
        };
    }
    // Loaded work is pushed by weight: 25 kg last time, 30 kg today.
    const { value, unit } = top.load;
    const jump = LOAD_JUMP[unit];
    const word = (load: number): string =>
        formatWeight(language, load, unit) + (exercise.perSide ? ` ${PER_SIDE[language]}` : '');
    return {
        exercise: exercise.name[language],
        last: word(value),
        target: word(value + (exercise.perSide ? jump.perSide : jump.total)),
        cardio: false,
    };
}

/**
 * The best full-range rep group of the most recent workout in which the exercise was done.
 *
 * Only working sets and full-range reps count: a warm-up or a few partials are nothing to brag
 * about, so a workout that had only those is passed over for an earlier one.
 */
function latestTopRepGroup(
    // Workouts, or the sessions of one exercise: anything that is a list of sets, oldest first.
    workouts: readonly { readonly sets: readonly SetPerformed[] }[],
    exerciseId: ExerciseId,
): RepGroup | undefined {
    for (const workout of workouts.toReversed()) {
        const groups = workout.sets
            .filter((set) => set.kind === 'working')
            .flatMap((set) => set.repGroups)
            .filter(
                (group) =>
                    group.exerciseId === exerciseId && group.technique === DEFAULT_TECHNIQUE_ID,
            );
        const top = topRepGroup(groups);
        if (top !== undefined) {
            return top;
        }
    }
    return undefined;
}

/**
 * Cardio is not pushed to a bigger number: its goal is to MATCH last time (see "Cardio match
 * rule" in docs/rules/cardio.md), so the target is that session itself, `5 km in 30:00`, and `last`
 * and `target` are the same words. The server's cardio wordings quote only `{last}`; `target` is
 * still filled because the server requires every field (and older wordings used it).
 */
function cardioHypeFor(
    exercise: Exercise,
    last: CardioTotals,
    language: Language,
): OverloadHype | undefined {
    const target = describeTarget(language, last);
    return target === undefined
        ? undefined
        : { exercise: exercise.name[language], last: target, target, cardio: true };
}

/** The hype line of a cardio exercise, from its most recent session. */
function latestCardioHype(
    workouts: readonly Workout[],
    exercise: Exercise,
    language: Language,
): OverloadHype | undefined {
    const latest = cardioSessions(workouts, exercise.id).at(-1);
    return latest === undefined
        ? undefined
        : cardioHypeFor(exercise, cardioTotals(latest.bouts), language);
}

/**
 * Projection: one hype line per planned exercise, in the order of the plan.
 *
 * WHICH exercises to hype comes from the plan of the next workout: there is no point in
 * teasing about a deadlift on a day without one. The NUMBERS come from the last time each
 * exercise was done, in whatever workout that was: an exercise that is part of every workout of
 * the rotation is quoted from two days ago, one that comes round every third workout from then.
 *
 * `workouts` is the whole history, oldest first. Exercises the catalog does not know are skipped.
 * `language` is the one the lines are worded in.
 */
export function overloadHype(
    planned: readonly ExerciseId[],
    workouts: readonly Workout[],
    catalog: Catalog,
    language: Language,
): readonly OverloadHype[] {
    return planned.flatMap((exerciseId) => {
        const exercise = catalog.findExercise(exerciseId);
        if (exercise === undefined) {
            return [];
        }
        if (isCardio(exercise)) {
            const hype = latestCardioHype(workouts, exercise, language);
            return hype === undefined ? [] : [hype];
        }
        const top = latestTopRepGroup(workouts, exerciseId);
        return top === undefined ? [] : [hypeFor(exercise, top, language)];
    });
}

/**
 * Projection: the hype line of a solo reminder, for one exercise done outside workouts.
 *
 * The same roast as a gym day's, but the numbers come from the exercise's standalone history
 * only (`standaloneSessions`, oldest first): 10 easy push-ups each morning and 30 to failure at
 * the gym are two histories, and the morning alarm should quote the morning's.
 *
 * `undefined` until there is a standalone working set to quote, and for cardio, which is never
 * logged as standalone sets.
 */
export function soloHype(
    exercise: Exercise,
    standalone: readonly ExerciseSession[],
    language: Language,
): OverloadHype | undefined {
    if (isCardio(exercise)) {
        return undefined;
    }
    const top = latestTopRepGroup(standalone, exercise.id);
    return top === undefined ? undefined : hypeFor(exercise, top, language);
}
