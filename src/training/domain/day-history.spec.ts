import { CURL, HAMMER_CURL, cardioAt, reps, setAt } from '../../testing/fixtures';
import {
    DayKey,
    addDays,
    addMonths,
    dayKeyOf,
    historyDays,
    monthOf,
    neighbourDay,
    weekOf,
} from './day-history';
import { workoutSets } from './set';
import { groupIntoWorkouts } from './workout';

/*
 * Times here have no `Z`: they are local, like the days of the History page, so the tests give
 * the same answer in every time zone.
 */
const day = (key: string): DayKey => key as DayKey;

describe('calendar days', () => {
    it('names a day in local time, zero-padded so that keys sort by date', () => {
        expect(dayKeyOf(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    });

    it('steps over month and year ends', () => {
        expect(addDays(day('2026-12-31'), 1)).toBe('2027-01-01');
        expect(addDays(day('2026-03-01'), -1)).toBe('2026-02-28');
    });

    it('gives the week Monday first', () => {
        // 15 November 2026 is a Sunday.
        expect(weekOf(day('2026-11-15'))).toEqual([
            '2026-11-09',
            '2026-11-10',
            '2026-11-11',
            '2026-11-12',
            '2026-11-13',
            '2026-11-14',
            '2026-11-15',
        ]);
    });

    it('lays a month out in weeks, blank where other months would be', () => {
        const weeks = monthOf(day('2026-11-15'));

        // November 2026 starts on a Sunday and ends on a Monday: six rows.
        expect(weeks).toHaveLength(6);
        expect(weeks[0]).toEqual([...Array.from({ length: 6 }, () => undefined), '2026-11-01']);
        expect(weeks[5]?.[0]).toBe('2026-11-30');
        expect(weeks[5]?.[1]).toBe(undefined);
    });

    it('moves by months, to the last day when the month is shorter', () => {
        expect(addMonths(day('2026-01-31'), 1)).toBe('2026-02-28');
        expect(addMonths(day('2026-11-15'), -12)).toBe('2025-11-15');
    });
});

describe('historyDays', () => {
    const pushUps = [
        setAt('2026-11-15T07:10:00', [reps(10, 0)], { standalone: true }),
        setAt('2026-11-15T07:30:00', [reps(8, 0)], { standalone: true }),
    ];
    const evening = [
        setAt('2026-11-15T18:30:00', [reps(8, 20, { exerciseId: HAMMER_CURL })]),
        setAt('2026-11-15T18:35:00', [reps(8, 20)]),
        setAt('2026-11-15T18:40:00', [reps(7, 20, { exerciseId: HAMMER_CURL })]),
    ];
    const run = cardioAt('2026-11-15T19:00:00', { meters: 5000, seconds: 1800 });

    const daysOf = (
        sets: Parameters<typeof workoutSets>[0],
        cardio: Parameters<typeof groupIntoWorkouts>[1] = [],
    ): ReturnType<typeof historyDays> =>
        historyDays(groupIntoWorkouts(workoutSets(sets), cardio), sets);

    it('shows a standalone session and a workout of one day as two blocks, in time order', () => {
        const [only, ...others] = daysOf([...evening, ...pushUps], [run]);

        expect(others).toEqual([]);
        expect(only?.day).toBe('2026-11-15');
        expect(only?.blocks.map((block) => block.kind)).toEqual(['standalone', 'workout']);
        expect(only?.blocks[0]?.exercises[0]?.sets).toEqual(pushUps);
    });

    it('lists the exercises of a workout in the order first performed, cardio included', () => {
        const workout = daysOf(evening, [run])[0]?.blocks[0];

        expect(workout?.exercises.map((exercise) => exercise.exerciseId)).toEqual([
            HAMMER_CURL,
            CURL,
            run.exerciseId,
        ]);
        expect(workout?.exercises[0]?.sets).toHaveLength(2);
        expect(workout?.exercises[2]?.bouts).toEqual([run]);
    });

    it('keeps a workout that runs past midnight whole, on the day it started', () => {
        const days = daysOf([
            setAt('2026-11-14T23:50:00', [reps(8, 20)]),
            setAt('2026-11-15T00:10:00', [reps(8, 20)]),
        ]);

        expect(days.map((each) => each.day)).toEqual(['2026-11-14']);
        expect(days[0]?.blocks[0]?.exercises[0]?.sets).toHaveLength(2);
    });

    it('lists only days with something logged, oldest first', () => {
        const days = daysOf([
            setAt('2026-11-15T10:00:00', [reps(8, 20)]),
            setAt('2026-11-11T10:00:00', [reps(8, 20)]),
        ]);

        expect(days.map((each) => each.day)).toEqual(['2026-11-11', '2026-11-15']);
    });
});

describe('neighbourDay', () => {
    const days = [day('2026-11-11'), day('2026-11-15')];

    it('skips rest days in both directions', () => {
        expect(neighbourDay(days, day('2026-11-15'), -1)).toBe('2026-11-11');
        expect(neighbourDay(days, day('2026-11-11'), 1)).toBe('2026-11-15');
    });

    it('works from a rest day, and stops at the ends', () => {
        expect(neighbourDay(days, day('2026-11-13'), -1)).toBe('2026-11-11');
        expect(neighbourDay(days, day('2026-11-13'), 1)).toBe('2026-11-15');
        expect(neighbourDay(days, day('2026-11-11'), -1)).toBe(undefined);
    });
});
