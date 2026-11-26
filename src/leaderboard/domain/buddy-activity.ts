import { topSet } from '@analytics/domain/records';
import { describeBout } from '@analytics/domain/cardio-wording';
import { Catalog } from '@catalog/domain/catalog';
import { DeviceId, DomainEvent, IsoDateTime } from '@shared/domain/event';
import { LANGUAGES, Language, LocalText } from '@shared/domain/language';
import { CardioPerformed } from '@training/domain/cardio';
import { formatReps, formatWeight } from '@training/domain/load-wording';
import { SetPerformed, primaryExerciseId, totalReps } from '@training/domain/set';

/**
 * One thing just done, as a buddy is told about it (docs/leaderboard.md, "Buddies"): the exercise
 * and what was done on it, worded in every language, because the phone that reads it may speak
 * another one than the phone that logged it. The server only wraps these words in a roast.
 */
export interface BuddyActivity {
    /**
     * Names the notification on the buddy's phone: one with the same tag replaces the earlier
     * one. Today it is the event's id, so every set is a notification of its own. Telling a
     * whole workout as one notification that grows would only take sending the workout so far
     * under one tag per workout; nothing on the server would change.
     */
    readonly tag: string;
    readonly exercise: LocalText;
    /** `80 kg × 8`, `12 reps`, `5 km · 30:00 · 10.0 km/h`. */
    readonly done: LocalText;
    /** Cardio is roasted in other words: a run is not a set. */
    readonly cardio: boolean;
    /** Whether it holds a personal record, which gets wordings of its own. */
    readonly record: boolean;
}

/**
 * How old a set may be and still be news. A set logged with no connection is told when the
 * phone is back online, but not an hour later, when it would arrive as a burst of old ones.
 */
export const FRESH_MS = 10 * 60 * 1000;

/** A clock that is a little ahead on the device that logged it must not make a set "future". */
const CLOCK_SLACK_MS = 60 * 1000;

/** Whether something done at `occurredAt` is still news at `now`. */
export function isFresh(occurredAt: IsoDateTime, now: Date): boolean {
    const age = now.getTime() - Date.parse(occurredAt);
    return age >= -CLOCK_SLACK_MS && age <= FRESH_MS;
}

/**
 * Which of `events` are news to tell: those logged on this very device, still fresh, and not
 * seen before. Everything else is no news and never will be: what another device logged (it
 * tells its own; here it only arrived by sync), and what is old (a backup imported, the history
 * uploaded at sign-in, a set that waited too long for a connection).
 *
 * @param known - the ids already dealt with: told, or passed over.
 */
export function news<T extends DomainEvent>(
    events: readonly T[],
    known: ReadonlySet<string>,
    deviceId: DeviceId,
    now: Date,
): readonly T[] {
    return events.filter(
        (event) =>
            !known.has(event.id) && event.deviceId === deviceId && isFresh(event.occurredAt, now),
    );
}

/** Words something in every language the app speaks. */
function inEveryLanguage(word: (language: Language) => string): LocalText {
    // `fromEntries` cannot know that every language is among the keys; `LANGUAGES` makes it so.
    return Object.fromEntries(LANGUAGES.map((language) => [language, word(language)])) as LocalText;
}

/**
 * A lifting set as a buddy is told about it, or `undefined` for what is not told: a warm-up,
 * or an exercise the catalog does not know.
 *
 * The set is quoted as the records rule judges it (`topSet`): its heaviest load and the full
 * reps at it. A bodyweight set without added load is just its reps; one that has only partials
 * is the reps it had.
 *
 * @param record - whether the set holds a personal record; the caller knows the history.
 */
export function setActivity(
    set: SetPerformed,
    catalog: Catalog,
    record: boolean,
): BuddyActivity | undefined {
    const exerciseId = primaryExerciseId(set);
    const exercise = exerciseId === undefined ? undefined : catalog.findExercise(exerciseId);
    if (set.kind !== 'working' || exercise === undefined) {
        return undefined;
    }
    const top = topSet(set, exercise.id, catalog);
    const bodyweight = exercise.loadType === 'bodyweight';
    return {
        tag: set.id,
        exercise: exercise.name,
        done: inEveryLanguage((language) => {
            if (top === undefined) {
                return formatReps(language, totalReps(set));
            }
            if (bodyweight && top.load.value === 0) {
                return formatReps(language, top.reps);
            }
            // Added load is signed; say the plus, so "+10 kg" does not read as the whole load.
            const sign = bodyweight && top.load.value > 0 ? '+' : '';
            const weight = formatWeight(language, top.load.value, top.load.unit);
            return `${sign}${weight} × ${top.reps}`;
        }),
        cardio: false,
        record,
    };
}

/**
 * A cardio bout (or treadmill segment) as a buddy is told about it, or `undefined` for an
 * exercise the catalog does not know.
 *
 * @param record - whether the session it belongs to holds a record.
 */
export function cardioActivity(
    bout: CardioPerformed,
    catalog: Catalog,
    record: boolean,
): BuddyActivity | undefined {
    const exercise = catalog.findExercise(bout.exerciseId);
    if (exercise === undefined) {
        return undefined;
    }
    return {
        tag: bout.id,
        exercise: exercise.name,
        done: inEveryLanguage((language) => describeBout(language, bout)),
        cardio: true,
        record,
    };
}
