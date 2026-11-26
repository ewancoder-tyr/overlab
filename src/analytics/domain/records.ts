import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId, SetupId } from '@catalog/domain/exercise';
import { IsoDateTime, byOccurrence } from '@shared/domain/event';
import { Load, SetId, SetPerformed } from '@training/domain/set';
import { ExerciseSession } from '@training/domain/workout';
import { comparableLoad } from './progression';

/**
 * Which record a set holds (docs/rules/progression.md, "Records and stall rule"):
 * - `weight`: the first set ever at the heaviest load.
 * - `reps`: the first set with the most reps at the heaviest load.
 * - `both`: one set that is both.
 */
export type RecordKind = 'weight' | 'reps' | 'both';

/** What a set is judged on: its top load and the full reps done at it. */
export interface TopSet {
    /** The heaviest load of the set's full reps, as entered. */
    readonly load: Load;
    /** The same load in kilograms: what loads are compared on. */
    readonly kilograms: number;
    /** Full reps at that load, added up over the set's rep groups. */
    readonly reps: number;
}

/** One line of the record table: the most reps ever done at a load, and when. */
export interface RecordRow extends TopSet {
    readonly occurredAt: IsoDateTime;
}

/**
 * The set's `(load, reps)` pair for one exercise: of its rep groups of that exercise with the
 * first technique in catalog order (full reps), the heaviest load and the reps at it.
 * `undefined` when the set has no full reps of that exercise, so it can never be a record.
 *
 * Only the exercise's own rep groups count: in an alternating curl and hammer curl set, the
 * hammer curls say nothing about the curl's records.
 */
export function topSet(
    set: SetPerformed,
    exerciseId: ExerciseId,
    catalog: Catalog,
): TopSet | undefined {
    const full = catalog.techniques[0]?.id;
    const groups = set.repGroups.filter(
        (group) => group.exerciseId === exerciseId && group.technique === full,
    );
    // `comparableLoad` makes kg and lb comparable and keeps the sign, so -15 is heavier than -20.
    const heaviest = groups.toSorted((a, b) => comparableLoad(b.load) - comparableLoad(a.load))[0];
    if (heaviest === undefined) {
        return undefined;
    }
    const kilograms = comparableLoad(heaviest.load);
    const reps = groups
        .filter((group) => comparableLoad(group.load) === kilograms)
        .reduce((sum, group) => sum + group.reps, 0);
    return { load: heaviest.load, kilograms, reps };
}

/** Sets on the exercise's default setup have no `setupId`; give them a stable map key. */
const setupKey = (setupId: SetupId | undefined): string => setupId ?? '';

/** One working set with its pair, the setup it was done on, and which session it belongs to. */
interface Attempt {
    readonly set: SetPerformed;
    readonly setup: string;
    readonly session: IsoDateTime;
    readonly top: TopSet;
}

/**
 * Every working set of the sessions that has full reps of the exercise, in the order performed
 * (`occurredAt`, then `id`: never the order the events happen to be stored in).
 */
function attemptsOf(sessions: readonly ExerciseSession[], catalog: Catalog): readonly Attempt[] {
    const exerciseId = sessions[0]?.exerciseId;
    if (exerciseId === undefined) {
        return [];
    }
    return sessions
        .flatMap((session) =>
            session.sets.map((set) => ({ set, session: session.workoutStartedAt })),
        )
        .filter(({ set }) => set.kind === 'working')
        .toSorted((a, b) => byOccurrence(a.set, b.set))
        .flatMap(({ set, session }) => {
            const top = topSet(set, exerciseId, catalog);
            return top === undefined ? [] : [{ set, setup: setupKey(set.setupId), session, top }];
        });
}

/**
 * Projection: the personal records of one exercise as they stand now, by set id. At most two
 * sets per setup hold one, however long the history:
 *
 * - The **weight record** is the first working set ever done at the heaviest load (its top
 *   load, any reps). Doing that load again, even for more reps, does not take it over.
 * - The **rep record** is the first working set with the most full reps at that same heaviest
 *   load. Lighter sets never hold a record, however many reps: 100 reps at 30 kg do not beat
 *   40 reps at 40 kg.
 *
 * When one set holds both (the only set at a new heaviest load, say) it is `both`.
 *
 * Records are standings, not events: they are derived again from the whole log every time, so
 * a heavier set moves the weight record to itself and the old set simply stops being one. Ties
 * stay with the earlier set (`occurredAt`, then `id`).
 *
 * A setup with a single session has no records yet, or every first workout would be full of
 * them. From its second session on, the records may be anywhere in its history, the first
 * session included.
 *
 * @param sessions - one exercise's sessions, as from `exerciseSessions`.
 */
export function recordsOf(
    sessions: readonly ExerciseSession[],
    catalog: Catalog,
): ReadonlyMap<SetId, RecordKind> {
    const records = new Map<SetId, RecordKind>();
    const bySetup = new Map<string, Attempt[]>();
    for (const attempt of attemptsOf(sessions, catalog)) {
        bySetup.set(attempt.setup, [...(bySetup.get(attempt.setup) ?? []), attempt]);
    }

    for (const attempts of bySetup.values()) {
        if (new Set(attempts.map((attempt) => attempt.session)).size < 2) {
            continue;
        }
        const heaviest = Math.max(...attempts.map((attempt) => attempt.top.kilograms));
        const atHeaviest = attempts.filter((attempt) => attempt.top.kilograms === heaviest);
        const mostReps = Math.max(...atHeaviest.map((attempt) => attempt.top.reps));
        // `attempts` is in the order performed, so `find` gives the earliest of any tie.
        const weight = atHeaviest[0];
        const reps = atHeaviest.find((attempt) => attempt.top.reps === mostReps);
        if (weight === undefined || reps === undefined) {
            continue;
        }
        records.set(weight.set.id, weight === reps ? 'both' : 'weight');
        if (weight !== reps) {
            records.set(reps.set.id, 'reps');
        }
    }
    return records;
}

/**
 * Projection: the record table of one exercise on one setup. For each load, the most reps ever
 * done at it, keeping only rows that no other set beats on both load and reps (with 9 at 100 kg
 * done, 8 at 95 kg is no record to beat). Heaviest first, each row dated by the first set that
 * reached it. These are the numbers to beat: "4 at 110, 7 at 105, or anything heavier".
 *
 * Empty until the setup has a second session, because records start from there.
 */
export function recordTable(
    sessions: readonly ExerciseSession[],
    setupId: SetupId | undefined,
    catalog: Catalog,
): readonly RecordRow[] {
    const setup = setupKey(setupId);
    const attempts = attemptsOf(sessions, catalog).filter((attempt) => attempt.setup === setup);
    if (new Set(attempts.map((attempt) => attempt.session)).size < 2) {
        return [];
    }

    // Heaviest first; at one load, most reps first; at equal pairs, the earliest first, because
    // `toSorted` is stable and the attempts are already in the order performed.
    const sorted = attempts.toSorted(
        (a, b) => b.top.kilograms - a.top.kilograms || b.top.reps - a.top.reps,
    );
    // Walking down the loads, a row stays only when it has more reps than every heavier row.
    const rows: RecordRow[] = [];
    for (const { top, set } of sorted) {
        if (top.reps > (rows.at(-1)?.reps ?? 0)) {
            rows.push({ ...top, occurredAt: set.occurredAt });
        }
    }
    return rows;
}
