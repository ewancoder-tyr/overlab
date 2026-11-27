import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId } from '@catalog/domain/exercise';
import { favoriteExercise } from '@catalog/domain/favorites';
import { DEFAULT_TECHNIQUE_ID, TechniqueId } from '@catalog/domain/technique';
import { DeviceId, DomainEvent, EventContext } from '@shared/domain/event';
import { toLocalDate } from '@shared/domain/schedule';
import { performCardio } from '@training/domain/cardio';
import {
    Program,
    ProgramDayId,
    ProgramId,
    chooseProgramDay,
    defineProgram,
} from '@training/domain/program';
import { RepGroup, SetPerformed, performSet } from '@training/domain/set';

/**
 * Generates a believable training history for trying the app out: about nine weeks of training
 * every second day, rotating between three distinct full-body workouts that each put one area
 * first (a rotation of 3, so each workout comes round every six days). Loads follow double
 * progression: add reps until the top of the range, then add load and start again at the bottom.
 *
 * Every exercise used is also starred, so the Train page has its favorites, and the three
 * workouts are a program of three days (`demoProgram`), each workout marked as the day it was.
 *
 * So that every screen has something to show, a few lifts stall at the end (see `plateau`), and
 * each workout ends with a cardio bout: running after A and C, cycling after B, whose last rides
 * only match the one before (which is the aim, see the cardio match rule).
 *
 * The events go through the real `performSet` factory, so demo data is held to exactly the same
 * rules as real data. Everything is deterministic for a given day: loading it twice on the same
 * day produces the same event ids, and merging skips the duplicates.
 */

interface Lift {
    readonly exercise: string;
    readonly startLoad: number;
    /** Load added once every set reaches the top of the rep range. */
    readonly step: number;
    readonly reps: readonly [low: number, high: number];
    readonly sets: number;
    /** Finish the last set with a few long-length partials after reaching failure. */
    readonly partials?: boolean;
    /**
     * For its last `plateau` sessions the lift repeats the session before them exactly: same
     * load, same reps. Each is `same`, so the lift ends stalled for `plateau` sessions.
     */
    readonly plateau?: number;
}

const lift = (
    exercise: string,
    startLoad: number,
    step: number,
    reps: readonly [number, number],
    sets = 3,
    partials = false,
    plateau = 0,
): Lift => ({ exercise, startLoad, step, reps, sets, partials, plateau });

/**
 * The three workouts of the rotation, in the order they are done. Each one trains the whole body
 * but opens with its focus while you are fresh. Some exercises are in two workouts (calf raise,
 * lateral raise, incline curl): their progress carries over from one workout to the next.
 */
const ROTATION: readonly (readonly Lift[])[] = [
    // A: chest and triceps first.
    [
        lift('dumbbell-bench-press', 20, 2.5, [8, 12], 4),
        lift('lat-prayer', 15, 2.5, [10, 13]),
        lift('bicep-curl', 12.5, 2.5, [5, 8], 3, true),
        lift('overhead-tricep-extension', 7.5, 2.5, [10, 13]),
        lift('leg-extension', 15, 5, [10, 12], 2),
        lift('high-to-low-cable-fly', 10, 2.5, [10, 13]),
        lift('katana-tricep-extension', 5, 2.5, [10, 14], 2),
        lift('cross-body-hammer-curl', 12.5, 2.5, [10, 13], 2),
        // Stalls while the other curls still progress, so biceps (on target) only names it.
        lift('preacher-curl', 10, 2.5, [8, 12], 2, false, 4),
        // Stalls: the only exercise that trains side delts directly, which are under target.
        lift('lateral-raise', 7, 1, [10, 13], 2, false, 5),
    ],
    // B: back and shoulders first.
    [
        lift('deadlift', 60, 5, [6, 8]),
        lift('dumbbell-shoulder-press', 15, 2.5, [8, 12]),
        lift('lat-pulldown', 45, 5, [8, 12]),
        lift('low-to-high-cable-fly', 7.5, 2.5, [10, 13]),
        lift('calf-raise', 90, 10, [8, 11], 2),
        lift('bulgarian-split-squat', 10, 2.5, [8, 10], 2),
        // Stalls exactly at the default threshold of three sessions; hamstrings are under target.
        lift('leg-curl', 20, 5, [10, 13], 2, false, 3),
        lift('incline-dumbbell-curl', 12.5, 2.5, [5, 8], 3, true),
        lift('machine-rear-delt-fly', 5, 2.5, [10, 14], 2),
        lift('seated-cable-row', 35, 5, [8, 12], 2),
    ],
    // C: biceps and legs first.
    [
        // Assisted: the load is negative, and progress is taking assistance away.
        lift('pull-up', -21, 3.5, [6, 10]),
        lift('smith-machine-squat', 17.5, 2.5, [6, 8]),
        lift('calf-raise', 90, 10, [8, 11], 2),
        lift('incline-dumbbell-curl', 12.5, 2.5, [5, 8], 3, true),
        lift('pec-deck', 15, 5, [8, 12]),
        lift('cross-body-tricep-extension', 7.5, 2.5, [12, 15], 2),
        lift('lateral-raise', 7, 1, [10, 13], 2, false, 5),
        // Seconds held, logged as reps.
        lift('dead-hang', 0, 0, [30, 45], 1),
    ],
];

/**
 * The cardio bout that ends each workout of the rotation, in the same order: a run after A and
 * C, a ride after B.
 */
const FINISHERS: readonly ExerciseId[] = [
    'running' as ExerciseId,
    'cycling' as ExerciseId,
    'running' as ExerciseId,
];

/** The rides repeat themselves exactly this many times at the end: matched, but no record. */
const CYCLING_PLATEAU = 4;

/**
 * The n-th run: a long slow one and a short fast one in turn, each a little better than the last
 * of its kind. Against each other they are trades (farther but slower), and every run sets a
 * record of its own kind. Whole metres, seconds and kcal, as the factory wants.
 */
function run(index: number): { distance: number; durationSeconds: number; calories: number } {
    const round = Math.floor(index / 2);
    const distance = index % 2 === 0 ? 6000 + 250 * round : 4000;
    const secondsPerKm = index % 2 === 0 ? 360 : 330 - 3 * round;
    return {
        distance,
        durationSeconds: Math.round((distance / 1000) * secondsPerKm),
        calories: Math.round(distance * 0.07),
    };
}

/** The n-th ride: always 50 minutes, a little farther each time. */
function ride(index: number): { distance: number; durationSeconds: number; calories: number } {
    const distance = 18000 + 500 * index;
    return { distance, durationSeconds: 50 * 60, calories: Math.round(distance * 0.03) };
}

/** A workout every second day. */
const DAYS_BETWEEN_WORKOUTS = 2;
const WEEKS = 9;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const PARTIAL = 'long-length-partial' as TechniqueId;

/** A tiny seeded random number generator (mulberry32), so the demo is the same every time. */
function seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function generateDemoEvents(catalog: Catalog, now: Date): readonly DomainEvent[] {
    const random = seededRandom(20261111);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayKey = today.toISOString().slice(0, 10);
    const events: DomainEvent[] = [];
    let counter = 0;
    const contextAt = (time: number): EventContext => ({
        deviceId: 'demo-device' as DeviceId,
        now: new Date(time),
        newId: () => `demo-${dayKey}-${String(++counter).padStart(5, '0')}`,
    });

    // Per exercise: the current load and the reps aimed for in the first set.
    const progress = new Map<string, { load: number; target: number }>();

    const firstDaysAgo = WEEKS * 7 - 1; // 62: an even number, see the schedule below.

    // The exercises of the rotation and the cardio finishers are the user's favorites, starred
    // before the first workout.
    const starredAt = today.getTime() - (firstDaysAgo + 1) * DAY_MS;
    const used = new Set([...ROTATION.flat().map((entry) => entry.exercise), ...FINISHERS]);
    for (const exercise of used) {
        const result = favoriteExercise(exercise as ExerciseId, catalog, contextAt(starredAt));
        if (result.ok) {
            events.push(result.value);
        }
    }

    const schedule = workoutSchedule(firstDaysAgo, random);

    // The rotation as a program, defined before the first workout: every second day, counted
    // from the first one.
    const program = demoProgram(toLocalDate(new Date(today.getTime() - firstDaysAgo * DAY_MS)));
    const programDefined = defineProgram(program, [], catalog, contextAt(starredAt));
    if (programDefined.ok) {
        events.push(programDefined.value);
    }

    // A plateau covers the last sessions of a lift, so each lift's number of sessions must be
    // known before its first set is written.
    const sessionsOf = new Map<string, number>();
    for (const { lifts } of schedule) {
        for (const entry of lifts) {
            sessionsOf.set(entry.exercise, (sessionsOf.get(entry.exercise) ?? 0) + 1);
        }
    }
    const done = new Map<string, number>();
    // Per exercise, the sets of its latest session, which a plateau repeats.
    const lastSession = new Map<string, readonly Pick<SetPerformed, 'repGroups' | 'effort'>[]>();

    const cardioDone = new Map<ExerciseId, number>();
    const cardioTotal = new Map<ExerciseId, number>();
    for (const { finisher } of schedule) {
        if (finisher !== undefined) {
            cardioTotal.set(finisher, (cardioTotal.get(finisher) ?? 0) + 1);
        }
    }

    for (const { daysAgo, turn, lifts, finisher } of schedule) {
        const isToday = daysAgo === 0;
        // Past workouts start at 18:00. Today's is laid out to end a few minutes ago.
        const dayStart = today.getTime() - daysAgo * DAY_MS + 18 * 60 * MINUTE_MS;
        const totalSets = lifts.reduce((sum, entry) => sum + entry.sets, 0);
        let time = isToday ? now.getTime() - (totalSets * 3 + 2) * MINUTE_MS : dayStart;
        const badDay = random() < 0.12;

        // Each workout is the program day it was done as, chosen as its first set is logged.
        const programDay = program.days[turn];
        if (programDefined.ok && programDay !== undefined) {
            const chosen = chooseProgramDay(program, programDay.id, contextAt(time));
            if (chosen.ok) {
                events.push(chosen.value);
            }
        }

        for (const entry of lifts) {
            const session = done.get(entry.exercise) ?? 0;
            done.set(entry.exercise, session + 1);
            const onPlateau =
                session >= (sessionsOf.get(entry.exercise) ?? 0) - (entry.plateau ?? 0);
            const repeated = onPlateau ? lastSession.get(entry.exercise) : undefined;

            const state = progress.get(entry.exercise) ?? {
                load: entry.startLoad,
                target: entry.reps[0],
            };
            const [low, high] = entry.reps;
            let firstSetAtTop = false;
            const written: Pick<SetPerformed, 'repGroups' | 'effort'>[] = [];

            for (let setIndex = 0; setIndex < entry.sets; setIndex++) {
                const draft =
                    repeated?.[setIndex] ?? newSet(entry, state, setIndex, badDay, random);
                firstSetAtTop ||= setIndex === 0 && (draft.repGroups[0]?.reps ?? 0) >= high;
                written.push(draft);

                time += (2.5 + random()) * MINUTE_MS;
                const result = performSet(
                    {
                        kind: 'working',
                        repGroups: draft.repGroups,
                        ...(draft.effort === undefined ? {} : { effort: draft.effort }),
                    },
                    catalog,
                    contextAt(time),
                );
                if (result.ok) {
                    events.push(result.value);
                }
            }
            lastSession.set(entry.exercise, written);

            if (repeated !== undefined) {
                // A plateau neither progresses nor regresses: the next session repeats it again.
                continue;
            }
            // Double progression: reaching the top of the range on the first set earns more
            // load (or, for exercises without load steps, simply more reps next time).
            if (firstSetAtTop && entry.step > 0) {
                progress.set(entry.exercise, { load: state.load + entry.step, target: low });
            } else {
                progress.set(entry.exercise, {
                    load: state.load,
                    target: Math.min(high + (entry.step > 0 ? 0 : 5), state.target + 1),
                });
            }
        }

        if (finisher !== undefined) {
            const index = cardioDone.get(finisher) ?? 0;
            cardioDone.set(finisher, index + 1);
            // The last rides repeat the one before them: matched, the aim of cardio.
            const lastNew = (cardioTotal.get(finisher) ?? 0) - CYCLING_PLATEAU - 1;
            const measures = finisher === 'cycling' ? ride(Math.min(index, lastNew)) : run(index);
            const result = performCardio(
                {
                    exerciseId: finisher,
                    distance: { value: measures.distance, unit: 'm' },
                    durationSeconds: measures.durationSeconds,
                    calories: measures.calories,
                },
                catalog,
                // A few minutes after the last set: the same workout, so part of the plan.
                contextAt(time + 5 * MINUTE_MS),
            );
            if (result.ok) {
                events.push(result.value);
            }
        }
    }
    return events;
}

/**
 * The rotation as the program a user would have built for it: one day per workout, its lifts in
 * order and the cardio bout last. The ids are fixed, so loading the demo twice defines the same
 * program.
 */
function demoProgram(startDate: string): Program {
    return {
        id: 'demo-split' as ProgramId,
        name: 'Full body',
        solo: false,
        schedule: { kind: 'interval', everyDays: DAYS_BETWEEN_WORKOUTS, startDate },
        reminder: { kind: 'default' },
        days: ROTATION.map((lifts, index) => {
            const finisher = FINISHERS[index];
            return {
                id: `demo-day-${index + 1}` as ProgramDayId,
                exercises: [
                    ...lifts.map((entry) => entry.exercise as ExerciseId),
                    ...(finisher === undefined ? [] : [finisher]),
                ],
            };
        }),
    };
}

/** One workout of the demo: when, which lifts, and the cardio bout after them. */
interface ScheduledWorkout {
    readonly daysAgo: number;
    /** Which workout of the rotation it is, from 0: also the index of its program day. */
    readonly turn: number;
    readonly lifts: readonly Lift[];
    /** Absent today: the workout in progress has not got that far. */
    readonly finisher?: ExerciseId;
}

/**
 * The workouts, oldest first: every second day, now and then one missed, as in real life (never
 * today's, so the demo opens with a workout in progress). Counting down in steps of two from an
 * even number ends on 0: the last workout is today's, of which only the first half is done.
 *
 * Which workout of the rotation is next advances only when a workout is actually done: a missed
 * gym day delays the rotation, exactly as the program rule has it.
 */
function workoutSchedule(firstDaysAgo: number, random: () => number): readonly ScheduledWorkout[] {
    const schedule: ScheduledWorkout[] = [];
    let turn = 0;
    for (let daysAgo = firstDaysAgo; daysAgo >= 0; daysAgo -= DAYS_BETWEEN_WORKOUTS) {
        const isToday = daysAgo === 0;
        if (!isToday && random() < 0.07) {
            continue;
        }
        const day = turn % ROTATION.length;
        const lifts = ROTATION[day] ?? [];
        const finisher = FINISHERS[day];
        turn++;
        schedule.push(
            isToday
                ? { daysAgo, turn: day, lifts: lifts.slice(0, 3) }
                : { daysAgo, turn: day, lifts, ...(finisher === undefined ? {} : { finisher }) },
        );
    }
    return schedule;
}

/**
 * A new set of a lift that is still progressing. Fatigue: later sets lose a rep or two, and a
 * bad day costs two more. The last set goes to failure about half the time, with partials after
 * it for lifts that use them.
 */
function newSet(
    entry: Lift,
    state: { readonly load: number; readonly target: number },
    setIndex: number,
    badDay: boolean,
    random: () => number,
): Pick<SetPerformed, 'repGroups' | 'effort'> {
    const fatigue = setIndex === 0 ? 0 : Math.round(random() * (setIndex + 0.4));
    const reps = Math.max(1, state.target - fatigue - (badDay ? 2 : 0));
    const toFailure = setIndex === entry.sets - 1 && random() < 0.45;
    const exerciseId = entry.exercise as ExerciseId;
    const load = { value: state.load, unit: 'kg' as const };
    const repGroups: RepGroup[] = [{ exerciseId, technique: DEFAULT_TECHNIQUE_ID, load, reps }];
    if (entry.partials === true && toFailure) {
        repGroups.push({ exerciseId, technique: PARTIAL, load, reps: 2 + (reps % 3) });
    }
    return toFailure ? { repGroups, effort: { kind: 'failure' } } : { repGroups };
}
