import { Schedule, isScheduledDay, upcomingDays, validateSchedule } from '@shared/domain/schedule';

// 9 November 2026 is a Monday.
const MONDAY = '2026-11-09';

describe('schedule', () => {
    it('on fixed weekdays, only the chosen days are on it', () => {
        const schedule: Schedule = { kind: 'weekdays', weekdays: [1, 3, 5] };

        expect(upcomingDays(schedule, MONDAY, 4)).toEqual([
            '2026-11-09',
            '2026-11-11',
            '2026-11-13',
            '2026-11-16',
        ]);
    });

    it('counts Sunday as weekday 7', () => {
        expect(isScheduledDay({ kind: 'weekdays', weekdays: [7] }, '2026-11-15')).toBe(true);
    });

    it('every second day alternates weekdays from week to week', () => {
        const schedule: Schedule = { kind: 'interval', everyDays: 2, startDate: MONDAY };

        // Mon, Wed, Fri, Sun, then Tue, Thu, Sat.
        expect(upcomingDays(schedule, MONDAY, 7)).toEqual([
            '2026-11-09',
            '2026-11-11',
            '2026-11-13',
            '2026-11-15',
            '2026-11-17',
            '2026-11-19',
            '2026-11-21',
        ]);
    });

    it('an interval has no days before its start date', () => {
        const schedule: Schedule = { kind: 'interval', everyDays: 2, startDate: MONDAY };

        expect(isScheduledDay(schedule, '2026-11-07')).toBe(false);
    });

    it('an interval counts calendar days across a daylight saving change', () => {
        // Clocks change in Europe on 28 March 2027.
        const schedule: Schedule = { kind: 'interval', everyDays: 3, startDate: '2027-03-26' };

        expect(isScheduledDay(schedule, '2027-03-29')).toBe(true);
    });

    it('rejects a weekday schedule with no days', () => {
        expect(validateSchedule({ kind: 'weekdays', weekdays: [] }).ok).toBe(false);
    });

    it('rejects an interval outside 1 to 14 days or with a bad start date', () => {
        expect(validateSchedule({ kind: 'interval', everyDays: 0, startDate: MONDAY }).ok).toBe(
            false,
        );
        expect(validateSchedule({ kind: 'interval', everyDays: 15, startDate: MONDAY }).ok).toBe(
            false,
        );
        expect(validateSchedule({ kind: 'interval', everyDays: 2, startDate: 'soon' }).ok).toBe(
            false,
        );
    });

    it('stores weekdays sorted and without duplicates', () => {
        const result = validateSchedule({ kind: 'weekdays', weekdays: [5, 1, 5] });

        expect(result).toEqual({ ok: true, value: { kind: 'weekdays', weekdays: [1, 5] } });
    });
});
