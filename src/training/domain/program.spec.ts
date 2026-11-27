import { ExerciseId } from '@catalog/domain/exercise';
import { DomainEvent, EventId, DeviceId, IsoDateTime } from '@shared/domain/event';
import { Schedule } from '@shared/domain/schedule';
import {
    CURL,
    DEADLIFT,
    HAMMER_CURL,
    PULL_UP,
    RUNNING,
    catalog,
    contextAt,
    reps,
    setAt,
} from '../../testing/fixtures';
import {
    Program,
    ProgramDayId,
    ProgramId,
    anchoredSchedule,
    chooseProgramDay,
    currentPrograms,
    dayChosenNow,
    defineProgram,
    lastPerformed,
    nextDay,
    programStatuses,
    removeProgram,
    soloProgramId,
    workoutDays,
} from './program';
import { SetPerformed } from './set';
import { groupIntoWorkouts } from './workout';

const A = 'day-a' as ProgramDayId;
const B = 'day-b' as ProgramDayId;
const C = 'day-c' as ProgramDayId;
const MON_WED_FRI: Schedule = { kind: 'weekdays', weekdays: [1, 3, 5] };
const NOW = new Date('2026-11-20T12:00:00Z');

const split: Program = {
    id: 'split' as ProgramId,
    name: 'Split',
    solo: false,
    schedule: MON_WED_FRI,
    reminder: { kind: 'default' },
    days: [
        { id: A, exercises: [CURL, HAMMER_CURL] },
        { id: B, exercises: [PULL_UP] },
        { id: C, exercises: [DEADLIFT, RUNNING] },
    ],
};

const morning: Program = {
    id: 'morning' as ProgramId,
    name: 'Morning',
    solo: true,
    schedule: { kind: 'interval', everyDays: 1, startDate: '2026-11-01' },
    reminder: { kind: 'at', time: '08:00' },
    days: [{ id: A, exercises: [CURL, PULL_UP] }],
};

function defined(program: Program, time: string, current: readonly Program[] = []): DomainEvent {
    const result = defineProgram(program, current, catalog, contextAt(time));
    if (!result.ok) {
        throw new Error(result.error.en);
    }
    return result.value;
}

function chosen(dayId: ProgramDayId, time: string, program = split): DomainEvent {
    const result = chooseProgramDay(program, dayId, contextAt(time));
    if (!result.ok) {
        throw new Error(result.error.en);
    }
    return result.value;
}

/** An event of the time before programs, as it sits in old logs. */
function legacy(type: string, time: string, payload: object): DomainEvent {
    return {
        id: `legacy-${time}-${type}` as EventId,
        type,
        version: 1,
        deviceId: 'old' as DeviceId,
        occurredAt: new Date(time).toISOString() as IsoDateTime,
        recordedAt: new Date(time).toISOString() as IsoDateTime,
        ...payload,
    };
}

const workoutAt = (time: string, exerciseId: ExerciseId = CURL): SetPerformed =>
    setAt(time, [reps(8, 20, { exerciseId })]);
const soloAt = (time: string, exerciseId: ExerciseId = CURL): SetPerformed =>
    setAt(time, [reps(10, 0, { exerciseId })], { standalone: true });

describe('program rule: defining a program', () => {
    it('keeps the whole program, the latest definition deciding', () => {
        const renamed = { ...split, name: 'Three days' };
        const events = [
            defined(renamed, '2026-11-02T10:00:00Z'),
            defined(split, '2026-11-01T10:00:00Z'),
        ];

        expect(currentPrograms(events, [], NOW)).toEqual([renamed]);
    });

    it('is gone once removed, and back when defined again', () => {
        const removal = removeProgram(split.id, contextAt('2026-11-02T10:00:00Z'));
        const events = [defined(split, '2026-11-01T10:00:00Z'), removal];

        expect(currentPrograms(events, [], NOW)).toEqual([]);
        expect(
            currentPrograms([...events, defined(split, '2026-11-03T10:00:00Z')], [], NOW),
        ).toEqual([split]);
    });

    it('lists regular programs before solo ones', () => {
        const events = [
            defined(morning, '2026-11-01T10:00:00Z'),
            defined(split, '2026-11-02T10:00:00Z'),
        ];

        expect(currentPrograms(events, [], NOW).map((program) => program.id)).toEqual([
            split.id,
            morning.id,
        ]);
    });

    it('allows an empty day in a regular program, to be filled by training', () => {
        const empty = { ...split, days: [{ id: A, exercises: [] }] };

        expect(defineProgram(empty, [], catalog, contextAt(NOW)).ok).toBe(true);
    });

    it('refuses no days, a repeated exercise, an unknown exercise and a bad reminder time', () => {
        const context = contextAt(NOW);
        const withDay = (exercises: readonly ExerciseId[]): Program => ({
            ...split,
            days: [{ id: A, exercises }],
        });

        expect(defineProgram({ ...split, days: [] }, [], catalog, context).ok).toBe(false);
        expect(defineProgram(withDay([CURL, CURL]), [], catalog, context).ok).toBe(false);
        expect(defineProgram(withDay(['nope' as ExerciseId]), [], catalog, context).ok).toBe(false);
        expect(
            defineProgram(
                { ...split, reminder: { kind: 'at', time: '25:00' } },
                [],
                catalog,
                context,
            ).ok,
        ).toBe(false);
    });

    it('gives a solo program one day, at least one exercise and no cardio', () => {
        const context = contextAt(NOW);
        const solo = (days: Program['days']): Program => ({ ...morning, days });

        expect(defineProgram(morning, [], catalog, context).ok).toBe(true);
        expect(defineProgram(solo(split.days), [], catalog, context).ok).toBe(false);
        expect(defineProgram(solo([{ id: A, exercises: [] }]), [], catalog, context).ok).toBe(
            false,
        );
        expect(
            defineProgram(solo([{ id: A, exercises: [RUNNING] }]), [], catalog, context).ok,
        ).toBe(false);
    });

    it('skips a program that does not validate', () => {
        const broken = { ...defined(split, '2026-11-01T10:00:00Z'), days: 'none' };

        expect(currentPrograms([broken], [], NOW)).toEqual([]);
    });
});

describe('program rule: every exercise done outside workouts is a solo program', () => {
    it('reads a solo reminder of the time before programs as a solo program', () => {
        const schedule: Schedule = { kind: 'interval', everyDays: 2, startDate: '2026-11-01' };
        const events = [
            legacy('SoloReminderSet', '2026-11-01T10:00:00Z', {
                exerciseId: CURL,
                schedule,
                time: '08:00',
            }),
        ];

        const [program] = currentPrograms(events, [], NOW);

        expect(program).toMatchObject({
            id: soloProgramId(CURL),
            solo: true,
            schedule,
            reminder: { kind: 'at', time: '08:00' },
        });
        expect(program?.days[0]?.exercises).toEqual([CURL]);
    });

    it('drops it when the reminder was removed, or the program is', () => {
        const set = legacy('SoloReminderSet', '2026-11-01T10:00:00Z', {
            exerciseId: CURL,
            schedule: MON_WED_FRI,
            time: '08:00',
        });
        const removedBefore = legacy('SoloReminderRemoved', '2026-11-02T10:00:00Z', {
            exerciseId: CURL,
        });
        const removedNow = removeProgram(soloProgramId(CURL), contextAt('2026-11-02T10:00:00Z'));

        expect(currentPrograms([set, removedBefore], [], NOW)).toEqual([]);
        expect(currentPrograms([set, removedNow], [], NOW)).toEqual([]);
    });

    it('makes an every-day program, reminder off, of an exercise done standalone lately', () => {
        const sets = [soloAt('2026-11-19T07:00:00Z'), workoutAt('2026-11-19T18:00:00Z', DEADLIFT)];

        const programs = currentPrograms([], sets, NOW);

        expect(programs).toHaveLength(1);
        expect(programs[0]).toMatchObject({
            id: soloProgramId(CURL),
            solo: true,
            reminder: { kind: 'off' },
            schedule: { kind: 'interval', everyDays: 1 },
        });
    });

    it('lets the habit go after 30 days without it', () => {
        expect(currentPrograms([], [soloAt('2026-10-01T07:00:00Z')], NOW)).toEqual([]);
    });

    it('makes none for an exercise a solo program already holds, or whose program was removed', () => {
        const sets = [soloAt('2026-11-19T07:00:00Z')];
        const held = [defined(morning, '2026-11-01T10:00:00Z')];
        const removed = [removeProgram(soloProgramId(CURL), contextAt('2026-11-10T10:00:00Z'))];

        expect(currentPrograms(held, sets, NOW)).toEqual([morning]);
        expect(currentPrograms(removed, sets, NOW)).toEqual([]);
    });
});

describe('program rule: which day a workout is', () => {
    const sets = [
        workoutAt('2026-11-16T10:00:00Z'),
        workoutAt('2026-11-16T11:00:00Z'),
        workoutAt('2026-11-18T10:00:00Z'),
    ];
    const workouts = groupIntoWorkouts(sets);
    // The first workout is the two sets of the 16th, the second the set of the 18th.
    const first = '2026-11-16T10:00:00.000Z' as IsoDateTime;
    const second = '2026-11-18T10:00:00.000Z' as IsoDateTime;

    it('a choice marks the workout in progress at that moment', () => {
        const marks = workoutDays(workouts, [chosen(A, '2026-11-16T10:30:00Z')]);

        expect(marks.get(first)).toEqual({ programId: split.id, dayId: A });
        expect(marks.size).toBe(1);
    });

    it('made before the first set, it marks the workout that starts within 3 hours', () => {
        const marks = workoutDays(workouts, [chosen(B, '2026-11-18T08:00:00Z')]);

        expect(marks.get(second)?.dayId).toBe(B);
    });

    it('made right after the last set, it still marks that workout', () => {
        const marks = workoutDays(workouts, [chosen(A, '2026-11-16T12:30:00Z')]);

        expect(marks.get(first)?.dayId).toBe(A);
    });

    it('marks nothing when no workout follows in time', () => {
        expect(workoutDays(workouts, [chosen(A, '2026-11-17T10:00:00Z')]).size).toBe(0);
    });

    it('the latest choice of a workout decides', () => {
        const marks = workoutDays(workouts, [
            chosen(B, '2026-11-16T10:40:00Z'),
            chosen(A, '2026-11-16T09:50:00Z'),
        ]);

        expect(marks.get(first)?.dayId).toBe(B);
    });

    it('a workout nobody chose a day for belongs to no program', () => {
        expect(workoutDays(workouts, []).size).toBe(0);
    });

    it('between workouts, a fresh choice waits for the workout about to start', () => {
        const events = [chosen(C, '2026-11-20T11:00:00Z')];

        expect(dayChosenNow(workouts, events, NOW)?.dayId).toBe(C);
        expect(dayChosenNow(workouts, events, new Date('2026-11-20T15:00:00Z'))).toBeUndefined();
    });

    it('cannot be chosen for a solo program, or for a day the program does not have', () => {
        expect(chooseProgramDay(morning, A, contextAt(NOW)).ok).toBe(false);
        expect(chooseProgramDay(split, 'other' as ProgramDayId, contextAt(NOW)).ok).toBe(false);
    });
});

describe('program rule: the day that comes next', () => {
    it('is the first day until the program was done', () => {
        expect(nextDay(split, undefined)?.id).toBe(A);
    });

    it('is the day after the one done last, going round', () => {
        const at = '2026-11-16T10:00:00.000Z' as IsoDateTime;

        expect(nextDay(split, { at, dayId: A })?.id).toBe(B);
        expect(nextDay(split, { at, dayId: C })?.id).toBe(A);
    });

    it('follows what was done, not the calendar: a skipped day is still next', () => {
        // Monday was day A; Wednesday was skipped. On Friday the suggestion is still B.
        const sets = [workoutAt('2026-11-16T10:00:00Z')];
        const workouts = groupIntoWorkouts(sets);
        const events = [chosen(A, '2026-11-16T10:00:00Z')];

        const [status] = programStatuses([split], workouts, events, sets, NOW);

        expect(status?.next?.id).toBe(B);
        expect(status?.shown?.id).toBe(B);
        expect(status?.chosen).toBe(false);
    });

    it('shows the day chosen for the workout in progress, and looks past it for the reminder', () => {
        const sets = [workoutAt('2026-11-20T11:30:00Z')];
        const workouts = groupIntoWorkouts(sets);
        const events = [chosen(C, '2026-11-20T11:30:00Z')];

        const [status] = programStatuses([split], workouts, events, sets, NOW);

        expect(status?.shown?.id).toBe(C);
        expect(status?.chosen).toBe(true);
        expect(status?.next?.id).toBe(A);
    });

    it('a solo program was done at the latest standalone set of any of its exercises', () => {
        const sets = [
            soloAt('2026-11-18T07:00:00Z', CURL),
            soloAt('2026-11-19T07:00:00Z', PULL_UP),
            workoutAt('2026-11-20T07:00:00Z', CURL),
        ];

        expect(lastPerformed(morning, [], new Map(), sets)?.at).toBe('2026-11-19T07:00:00.000Z');
    });
});

describe('program rule: skipped days', () => {
    it('fixed weekdays never move', () => {
        expect(anchoredSchedule(MON_WED_FRI, '2026-11-21')).toEqual(MON_WED_FRI);
    });

    it('"every N days" counts from the day the program was really done', () => {
        // Mon 16, Wed 18, Fri 20 skipped, done on Sat 21: next are Mon 23 and Wed 25.
        const everySecond: Schedule = { kind: 'interval', everyDays: 2, startDate: '2026-11-16' };

        expect(anchoredSchedule(everySecond, '2026-11-21')).toEqual({
            ...everySecond,
            startDate: '2026-11-23',
        });
    });

    it('stays where it was until the program is done', () => {
        const everySecond: Schedule = { kind: 'interval', everyDays: 2, startDate: '2026-11-16' };

        expect(anchoredSchedule(everySecond, undefined)).toEqual(everySecond);
    });

    it('keeps a start date set after the last time the program was done', () => {
        const restarted: Schedule = { kind: 'interval', everyDays: 3, startDate: '2026-11-25' };

        expect(anchoredSchedule(restarted, '2026-11-21')).toEqual(restarted);
    });

    it('lists programs due today first, a program done today among them', () => {
        // 20 November 2026 is a Friday: the split is due, the Tuesday program is not.
        const tuesdays = {
            ...split,
            id: 'tuesdays' as ProgramId,
            schedule: { kind: 'weekdays', weekdays: [2] } as Schedule,
        };

        const statuses = programStatuses([tuesdays, split], [], [], [], NOW);

        expect(statuses.map((status) => status.program.id)).toEqual([split.id, tuesdays.id]);
        expect(statuses.map((status) => status.dueToday)).toEqual([true, false]);
    });
});
