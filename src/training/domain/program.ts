import { Catalog } from '@catalog/domain/catalog';
import { ExerciseId, isCardio } from '@catalog/domain/exercise';
import { Branded } from '@shared/domain/brand';
import {
    DomainEvent,
    EventContext,
    IsoDateTime,
    byOccurrence,
    envelope,
} from '@shared/domain/event';
import { Result, fail, ok } from '@shared/domain/result';
import {
    LocalDate,
    Schedule,
    TimeOfDay,
    addDays,
    isScheduledDay,
    isTimeOfDay,
    toLocalDate,
    validateSchedule,
} from '@shared/domain/schedule';
import { SetPerformed, isStandalone, primaryExerciseId } from './set';
import { WORKOUT_GAP_MS, Workout, currentWorkout, standaloneHabits } from './workout';

/*
 * Programs: the lists of exercises the user prepared, with the days to do them on. See "Program
 * rule" in docs/rules/training.md.
 *
 * A program is a template and a calendar rule, nothing more. Sets never refer to one: whatever
 * is logged lands in the workout derived from the 3-hour gap and in its exercise's own history,
 * planned or not. The one thing the log records about programs while training is which program
 * day a workout was (`ProgramDayChosen`), because "which day comes next" depends on it.
 */

export type ProgramId = Branded<string, 'ProgramId'>;
export type ProgramDayId = Branded<string, 'ProgramDayId'>;

/** One day of a program (A, B, C): the exercises to do, in order. Days are named by position. */
export interface ProgramDay {
    readonly id: ProgramDayId;
    readonly exercises: readonly ExerciseId[];
}

/**
 * When a program's reminder rings: at the time set in Settings for all programs (`default`), at
 * a time of its own, or never.
 */
export type ProgramReminder =
    | { readonly kind: 'default' }
    | { readonly kind: 'off' }
    | { readonly kind: 'at'; readonly time: TimeOfDay };

export interface Program {
    readonly id: ProgramId;
    /** May be empty: the screens then show the name of its first exercise. */
    readonly name: string;
    /**
     * A solo program is done outside workouts (push-ups every morning): its sets are logged as
     * standalone sets, so it has a single day and nothing to rotate through.
     */
    readonly solo: boolean;
    /** The days it is done on, as the user set them. See `anchoredSchedule` for skipped days. */
    readonly schedule: Schedule;
    readonly reminder: ProgramReminder;
    /** At least one. A regular program rotates through them in order. */
    readonly days: readonly ProgramDay[];
}

/**
 * The user created or changed a program. It carries the whole program, not a difference: the
 * most recent event of a program is the program, so two devices editing it cannot leave a mix
 * that neither of them saw.
 */
export interface ProgramDefined extends DomainEvent<'ProgramDefined'> {
    readonly programId: ProgramId;
    readonly name: string;
    readonly solo: boolean;
    readonly schedule: Schedule;
    readonly reminder: ProgramReminder;
    readonly days: readonly ProgramDay[];
}

export interface ProgramRemoved extends DomainEvent<'ProgramRemoved'> {
    readonly programId: ProgramId;
}

/**
 * The user decided which day of a program a workout is: by opening one of its exercises on the
 * Train page, by switching the day there, or by saving a finished workout as that day.
 * `occurredAt` places it: see `workoutDays` for which workout it marks.
 */
export interface ProgramDayChosen extends DomainEvent<'ProgramDayChosen'> {
    readonly programId: ProgramId;
    readonly dayId: ProgramDayId;
}

export const MAX_PROGRAMS = 20;
export const MAX_PROGRAM_DAYS = 14;
export const MAX_DAY_EXERCISES = 40;
export const MAX_PROGRAM_NAME_LENGTH = 40;

/**
 * Ids end up in addresses and are sent to the reminder server, which accepts only this shape
 * (`programIDPattern` in `reminder-server/programs.go`). Every catalog id fits too.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * The id of the solo program that stands for one exercise done outside workouts, when the user
 * never defined one: see `currentPrograms`. Derived from the exercise, so every device arrives
 * at the same program without anything being written.
 */
export function soloProgramId(exerciseId: ExerciseId): ProgramId {
    return `solo-${exerciseId}` as ProgramId;
}

/** What the program editor hands in. The same shape as a program. */
export type ProgramDraft = Program;

/**
 * Factory: defines a program, replacing the one with the same id.
 *
 * `current` is the programs as they are now: a program that is new is refused once the list is
 * full.
 */
export function defineProgram(
    draft: ProgramDraft,
    current: readonly Program[],
    catalog: Catalog,
    context: EventContext,
): Result<ProgramDefined> {
    const name = draft.name.trim();
    if (!ID_PATTERN.test(draft.id)) {
        return fail({ en: 'The program has no valid id.', ru: 'У программы нет корректного id.' });
    }
    if (name.length > MAX_PROGRAM_NAME_LENGTH) {
        return fail({
            en: `A program name has at most ${MAX_PROGRAM_NAME_LENGTH} characters.`,
            ru: `В названии программы не больше ${MAX_PROGRAM_NAME_LENGTH} символов.`,
        });
    }
    const schedule = validateSchedule(draft.schedule);
    if (!schedule.ok) {
        return schedule;
    }
    if (!isProgramReminder(draft.reminder)) {
        return fail({
            en: 'The reminder time must look like 15:00.',
            ru: 'Время напоминания должно выглядеть как 15:00.',
        });
    }
    if (draft.days.length === 0 || draft.days.length > MAX_PROGRAM_DAYS) {
        return fail({
            en: `A program has from 1 to ${MAX_PROGRAM_DAYS} days.`,
            ru: `В программе от 1 до ${MAX_PROGRAM_DAYS} дней.`,
        });
    }
    if (draft.solo && draft.days.length !== 1) {
        return fail({
            en: 'A solo program has a single day.',
            ru: 'В соло-программе один день.',
        });
    }
    if (new Set(draft.days.map((day) => day.id)).size !== draft.days.length) {
        return fail({ en: 'Two days share an id.', ru: 'У двух дней один id.' });
    }
    for (const day of draft.days) {
        const problem = dayProblem(day, draft.solo, catalog);
        if (problem !== undefined) {
            return problem;
        }
    }
    // A solo program is its exercises: without one there is nothing to show or to remind about.
    // A regular day may be empty: it is filled by training (see "Program rule").
    if (draft.solo && draft.days.every((day) => day.exercises.length === 0)) {
        return fail({
            en: 'A solo program needs at least one exercise.',
            ru: 'Соло-программе нужно хотя бы одно упражнение.',
        });
    }
    const isNew = current.every((other) => other.id !== draft.id);
    if (isNew && current.length >= MAX_PROGRAMS) {
        return fail({
            en: `At most ${MAX_PROGRAMS} programs. Remove one first.`,
            ru: `Не больше ${MAX_PROGRAMS} программ. Сначала удалите одну.`,
        });
    }
    return ok({
        ...envelope('ProgramDefined', 1, context),
        programId: draft.id,
        name,
        solo: draft.solo,
        schedule: schedule.value,
        reminder: draft.reminder,
        days: draft.days.map((day) => ({ id: day.id, exercises: [...day.exercises] })),
    });
}

/** Why a day cannot be saved, if anything. */
function dayProblem(day: ProgramDay, solo: boolean, catalog: Catalog): Result<never> | undefined {
    if (!ID_PATTERN.test(day.id)) {
        return fail({ en: 'A day has no valid id.', ru: 'У дня нет корректного id.' });
    }
    if (day.exercises.length > MAX_DAY_EXERCISES) {
        return fail({
            en: `A day holds at most ${MAX_DAY_EXERCISES} exercises.`,
            ru: `В одном дне не больше ${MAX_DAY_EXERCISES} упражнений.`,
        });
    }
    if (new Set(day.exercises).size !== day.exercises.length) {
        return fail({
            en: 'An exercise is listed twice in one day.',
            ru: 'Упражнение указано дважды в одном дне.',
        });
    }
    for (const exerciseId of day.exercises) {
        const exercise = catalog.findExercise(exerciseId);
        if (exercise === undefined) {
            return fail({
                en: `Unknown exercise: ${exerciseId}.`,
                ru: `Неизвестное упражнение: ${exerciseId}.`,
            });
        }
        // Cardio is logged as bouts, never as standalone sets, so it has no solo history.
        if (solo && isCardio(exercise)) {
            return fail({
                en: 'Cardio cannot be part of a solo program.',
                ru: 'Кардио не может входить в соло-программу.',
            });
        }
    }
    return undefined;
}

/** Factory: removes a program. Removing one that does not exist is harmless. */
export function removeProgram(programId: ProgramId, context: EventContext): ProgramRemoved {
    return { ...envelope('ProgramRemoved', 1, context), programId };
}

/**
 * Factory: records which day of a program a workout is.
 *
 * `occurredAt` defaults to now, which marks the workout in progress or the one about to start.
 * Saving an older workout as a day passes a moment inside that workout instead.
 */
export function chooseProgramDay(
    program: Program,
    dayId: ProgramDayId,
    context: EventContext,
    occurredAt: Date = context.now,
): Result<ProgramDayChosen> {
    if (program.solo) {
        return fail({
            en: 'A solo program is not part of a workout.',
            ru: 'Соло-программа не входит в тренировку.',
        });
    }
    if (program.days.every((day) => day.id !== dayId)) {
        return fail({
            en: 'The program has no such day.',
            ru: 'В программе нет такого дня.',
        });
    }
    return ok({
        ...envelope('ProgramDayChosen', 1, context, occurredAt),
        programId: program.id,
        dayId,
    });
}

function isProgramReminder(value: unknown): value is ProgramReminder {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const { kind, time } = value as { kind?: unknown; time?: unknown };
    return kind === 'default' || kind === 'off' || (kind === 'at' && isTimeOfDay(time));
}

/** Reads a program out of an event payload of unknown shape; `undefined` when it is not one. */
function readProgram(event: DomainEvent): Program | undefined {
    const { programId, name, solo, schedule, reminder, days } = event as Partial<ProgramDefined>;
    if (
        typeof programId !== 'string' ||
        !ID_PATTERN.test(programId) ||
        typeof name !== 'string' ||
        typeof solo !== 'boolean' ||
        typeof schedule !== 'object' ||
        !isProgramReminder(reminder) ||
        !Array.isArray(days) ||
        days.length === 0
    ) {
        return undefined;
    }
    const validSchedule = validateSchedule(schedule);
    if (!validSchedule.ok) {
        return undefined;
    }
    const validDays: ProgramDay[] = [];
    for (const day of days as readonly (Partial<ProgramDay> | null)[]) {
        if (typeof day?.id !== 'string' || !Array.isArray(day.exercises)) {
            return undefined;
        }
        validDays.push({
            id: day.id,
            exercises: day.exercises.filter((id): id is ExerciseId => typeof id === 'string'),
        });
    }
    return { id: programId, name, solo, schedule: validSchedule.value, reminder, days: validDays };
}

/**
 * Before programs, an exercise done outside workouts could have a "solo reminder": the events
 * `SoloReminderSet` (`exerciseId`, `schedule`, `time`) and `SoloReminderRemoved` (`exerciseId`).
 * They are in old logs for good, and are read as what they have become: a solo program of that
 * one exercise, with the id `soloProgramId` gives, on the same days, ringing at the same time.
 */
function readSoloReminder(event: DomainEvent): Program | undefined {
    const { exerciseId, schedule, time } = event as {
        exerciseId?: unknown;
        schedule?: unknown;
        time?: unknown;
    };
    if (typeof exerciseId !== 'string' || typeof schedule !== 'object' || !isTimeOfDay(time)) {
        return undefined;
    }
    const validSchedule = validateSchedule(schedule as Schedule);
    if (!validSchedule.ok) {
        return undefined;
    }
    return soloProgramOf(exerciseId as ExerciseId, validSchedule.value, { kind: 'at', time });
}

function soloProgramOf(
    exerciseId: ExerciseId,
    schedule: Schedule,
    reminder: ProgramReminder,
): Program {
    const id = soloProgramId(exerciseId);
    return {
        id,
        name: '',
        solo: true,
        schedule,
        reminder,
        // A solo program has one day; reusing the program's id for it keeps it derivable.
        days: [{ id: id as string as ProgramDayId, exercises: [exerciseId] }],
    };
}

/** "Every day", for a habit whose days were never set. Any past date anchors it equally well. */
const EVERY_DAY: Schedule = { kind: 'interval', everyDays: 1, startDate: '2000-01-01' };

/**
 * Projection: the programs as they are now, regular ones in the order they were first created,
 * then the solo ones.
 *
 * For each program the most recent of its events decides. A tolerant reader: other events and
 * programs that do not validate (from an import, or a newer app version) are skipped.
 *
 * **Every exercise done outside workouts is a solo program**, whether or not the user made one:
 * - a solo reminder of the time before programs is its program (`readSoloReminder`);
 * - an exercise done standalone lately (`standaloneHabits`) that no solo program holds, and
 *   whose own program was never defined or removed, gets one for every day with the reminder
 *   off. It leaves by itself when the habit is dropped, and editing or removing it writes a
 *   real event under the same id, which then decides.
 *
 * @param sets - the active sets, standalone or not, in any order.
 */
export function currentPrograms(
    events: readonly DomainEvent[],
    sets: readonly SetPerformed[],
    now: Date,
): readonly Program[] {
    // `undefined` marks a program that was removed: it is remembered so that the habit rule
    // above does not bring it back.
    const byId = new Map<ProgramId, Program | undefined>();
    const mine = events.filter(
        (event) =>
            event.type === 'ProgramDefined' ||
            event.type === 'ProgramRemoved' ||
            event.type === 'SoloReminderSet' ||
            event.type === 'SoloReminderRemoved',
    );
    // Sorted, because the log has no guaranteed order and "most recent" must mean the same on
    // every device.
    for (const event of mine.toSorted(byOccurrence)) {
        if (event.type === 'ProgramDefined') {
            const program = readProgram(event);
            if (program !== undefined) {
                byId.set(program.id, program);
            }
        } else if (event.type === 'ProgramRemoved') {
            const { programId } = event as Partial<ProgramRemoved>;
            if (typeof programId === 'string') {
                byId.set(programId, undefined);
            }
        } else if (event.type === 'SoloReminderSet') {
            const program = readSoloReminder(event);
            if (program !== undefined) {
                byId.set(program.id, program);
            }
        } else {
            const { exerciseId } = event as { exerciseId?: unknown };
            if (typeof exerciseId === 'string') {
                byId.set(soloProgramId(exerciseId as ExerciseId), undefined);
            }
        }
    }

    const defined = [...byId.values()].filter((program) => program !== undefined);
    const heldSolo = new Set(
        defined.filter((program) => program.solo).flatMap((program) => exercisesOfProgram(program)),
    );
    const habits = [...standaloneHabits(sets, now).keys()]
        .filter((exerciseId) => !heldSolo.has(exerciseId) && !byId.has(soloProgramId(exerciseId)))
        .toSorted()
        .map((exerciseId) => soloProgramOf(exerciseId, EVERY_DAY, { kind: 'off' }));

    return [
        ...defined.filter((program) => !program.solo),
        ...defined.filter((program) => program.solo),
        ...habits,
    ];
}

/** Every exercise of a program, across its days, each once. */
export function exercisesOfProgram(program: Program): readonly ExerciseId[] {
    return [...new Set(program.days.flatMap((day) => day.exercises))];
}

/** Which day of which program a workout is. */
export interface ChosenDay {
    readonly programId: ProgramId;
    readonly dayId: ProgramDayId;
}

/**
 * Projection: which program day each workout is, keyed by the workout's `startedAt`. A workout
 * that is not in the map was done on a whim and belongs to no program.
 *
 * **A choice marks the workout in progress at that moment, or else the one that starts within
 * 3 hours of it.** "In progress" is what it always means: the latest activity before the choice
 * was less than `WORKOUT_GAP_MS` earlier. So a day can be chosen before the first set, switched
 * in the middle, or given to a workout right after its last set. A choice that no workout
 * follows in time marks nothing. The latest choice of a workout decides.
 *
 * @param workouts - oldest first, as `groupIntoWorkouts` returns them.
 */
export function workoutDays(
    workouts: readonly Workout[],
    events: readonly DomainEvent[],
): ReadonlyMap<IsoDateTime, ChosenDay> {
    const marks = new Map<IsoDateTime, ChosenDay>();
    for (const choice of dayChoices(events)) {
        const workout = workoutMarkedAt(workouts, Date.parse(choice.occurredAt));
        if (workout !== undefined) {
            marks.set(workout.startedAt, { programId: choice.programId, dayId: choice.dayId });
        }
    }
    return marks;
}

/** The valid `ProgramDayChosen` events, oldest first. */
function dayChoices(events: readonly DomainEvent[]): readonly ProgramDayChosen[] {
    return events
        .filter((event): event is ProgramDayChosen => {
            const { programId, dayId } = event as Partial<ProgramDayChosen>;
            return (
                event.type === 'ProgramDayChosen' &&
                typeof programId === 'string' &&
                typeof dayId === 'string'
            );
        })
        .toSorted(byOccurrence);
}

/** The workout a choice made at `time` marks, if any. See `workoutDays`. */
function workoutMarkedAt(workouts: readonly Workout[], time: number): Workout | undefined {
    const before = workouts.findLast((workout) => Date.parse(workout.startedAt) <= time);
    if (before !== undefined && time - Date.parse(before.endedAt) < WORKOUT_GAP_MS) {
        return before;
    }
    const after = workouts.find((workout) => Date.parse(workout.startedAt) > time);
    return after !== undefined && Date.parse(after.startedAt) - time < WORKOUT_GAP_MS
        ? after
        : undefined;
}

/**
 * The day chosen for the workout that is in progress or about to start, if any: the mark of
 * the workout in progress, or, between workouts, a choice made less than 3 hours ago that no
 * workout has taken yet.
 */
export function dayChosenNow(
    workouts: readonly Workout[],
    events: readonly DomainEvent[],
    now: Date,
): ChosenDay | undefined {
    const inProgress = currentWorkout(workouts, now);
    if (inProgress !== undefined) {
        return workoutDays(workouts, events).get(inProgress.startedAt);
    }
    const latest = dayChoices(events).findLast(
        (choice) => Date.parse(choice.occurredAt) <= now.getTime(),
    );
    if (latest === undefined) {
        return undefined;
    }
    const time = Date.parse(latest.occurredAt);
    const waiting =
        now.getTime() - time < WORKOUT_GAP_MS && workoutMarkedAt(workouts, time) === undefined;
    return waiting ? { programId: latest.programId, dayId: latest.dayId } : undefined;
}

/** When a program was last done, and which day of it that was. */
export interface LastPerformed {
    readonly at: IsoDateTime;
    /** Absent for a solo program, which has one day. */
    readonly dayId?: ProgramDayId;
}

/**
 * Projection: the last time a program was done.
 *
 * A regular program was done whenever a workout was marked as one of its days (`workoutDays`).
 * A solo program is its exercises done standalone, so it was done at the latest standalone set
 * of any of them: nothing has to be chosen for push-ups.
 *
 * @param sets - the active sets, standalone or not, in any order.
 */
export function lastPerformed(
    program: Program,
    workouts: readonly Workout[],
    marks: ReadonlyMap<IsoDateTime, ChosenDay>,
    sets: readonly SetPerformed[],
): LastPerformed | undefined {
    if (program.solo) {
        const mine = new Set(exercisesOfProgram(program));
        let latest: IsoDateTime | undefined;
        for (const set of sets) {
            const exerciseId = primaryExerciseId(set);
            const counts = isStandalone(set) && exerciseId !== undefined && mine.has(exerciseId);
            if (counts && (latest === undefined || set.occurredAt > latest)) {
                latest = set.occurredAt;
            }
        }
        return latest === undefined ? undefined : { at: latest };
    }
    const workout = workouts.findLast(
        (other) => marks.get(other.startedAt)?.programId === program.id,
    );
    const dayId = workout === undefined ? undefined : marks.get(workout.startedAt)?.dayId;
    return workout === undefined || dayId === undefined
        ? undefined
        : { at: workout.startedAt, dayId };
}

/**
 * The day of a program that comes next: the one after the day done last, in the program's
 * order, going round. The first day when nothing was done yet, or when the day done last has
 * since been removed from the program.
 *
 * It follows what was done, not the calendar: after a skipped Wednesday, Friday's suggestion is
 * still Wednesday's day, and the user switches if they would rather move on.
 */
export function nextDay(program: Program, last: LastPerformed | undefined): ProgramDay | undefined {
    const index = program.days.findIndex((day) => day.id === last?.dayId);
    // `index` is -1 when nothing matches, and -1 + 1 is the first day: exactly the fallback.
    return program.days[(index + 1) % program.days.length];
}

/**
 * The days a program falls on, given when it was last done.
 *
 * **Fixed weekdays never move.** A skipped Wednesday is skipped; the next day is Friday.
 *
 * **"Every N days" counts from the day the program was really done.** Skip Friday, train on
 * Saturday, and the next days are Monday and Wednesday: the cycle moved by the one day. The
 * schedule only moves when the program is done; until then its days stay where they were, so a
 * skipped day is not chased with another reminder. The count restarts N days AFTER the day it
 * was done, so that day itself is not a day to be reminded of again.
 *
 * A start date the user set later than the last time the program was done stands as it is.
 */
export function anchoredSchedule(schedule: Schedule, lastDone: LocalDate | undefined): Schedule {
    if (schedule.kind !== 'interval' || lastDone === undefined || lastDone < schedule.startDate) {
        return schedule;
    }
    return { ...schedule, startDate: addDays(lastDone, schedule.everyDays) };
}

/** A program with everything the screens and the reminders derive for it. */
export interface ProgramStatus {
    readonly program: Program;
    /** The schedule as it stands after the last time the program was done. */
    readonly schedule: Schedule;
    /** The day after the one done last: what a reminder is about. */
    readonly next: ProgramDay | undefined;
    /**
     * The day the Train page lists: the one chosen for the workout in progress or about to
     * start when it is of this program, otherwise `next`.
     */
    readonly shown: ProgramDay | undefined;
    /** Whether the workout in progress (or about to start) is a day of this program. */
    readonly chosen: boolean;
    /** Whether today is one of its days, or it was done today. */
    readonly dueToday: boolean;
}

/**
 * Projection: every program with its status, the ones due today first (the order is otherwise
 * that of `currentPrograms`).
 *
 * @param sets - the active sets, standalone or not, in any order.
 */
export function programStatuses(
    programs: readonly Program[],
    workouts: readonly Workout[],
    events: readonly DomainEvent[],
    sets: readonly SetPerformed[],
    now: Date,
): readonly ProgramStatus[] {
    const marks = workoutDays(workouts, events);
    const chosenNow = dayChosenNow(workouts, events, now);
    const today = toLocalDate(now);

    const statuses = programs.map((program): ProgramStatus => {
        const last = lastPerformed(program, workouts, marks, sets);
        const lastDone = last === undefined ? undefined : toLocalDate(new Date(last.at));
        const schedule = anchoredSchedule(program.schedule, lastDone);
        const chosenDay =
            chosenNow?.programId === program.id
                ? program.days.find((day) => day.id === chosenNow.dayId)
                : undefined;
        // While a marked workout is in progress it already is the day done last, so `next`
        // looks past it: that is what the reminder for the NEXT visit should be about.
        const next = nextDay(program, last);
        return {
            program,
            schedule,
            next,
            shown: chosenDay ?? next,
            chosen: chosenDay !== undefined,
            dueToday: lastDone === today || isScheduledDay(schedule, today),
        };
    });
    // `toSorted` is stable, so programs keep their order within each group.
    return statuses.toSorted((a, b) => Number(b.dueToday) - Number(a.dueToday));
}
