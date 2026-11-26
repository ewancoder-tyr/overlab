import { GymSchedule, isGymDay, upcomingGymDays, validateGymSchedule } from './gym-schedule';

// 9 November 2026 is a Monday.
const MONDAY = '2026-11-09';

describe('gym schedule', () => {
    it('on fixed weekdays, only the chosen days are gym days', () => {
        const schedule: GymSchedule = { kind: 'weekdays', weekdays: [1, 3, 5] };

        expect(upcomingGymDays(schedule, MONDAY, 4)).toEqual([
            '2026-11-09',
            '2026-11-11',
            '2026-11-13',
            '2026-11-16',
        ]);
    });

    it('counts Sunday as weekday 7', () => {
        expect(isGymDay({ kind: 'weekdays', weekdays: [7] }, '2026-11-15')).toBe(true);
    });

    it('every second day alternates weekdays from week to week', () => {
        const schedule: GymSchedule = { kind: 'interval', everyDays: 2, startDate: MONDAY };

        // Mon, Wed, Fri, Sun, then Tue, Thu, Sat.
        expect(upcomingGymDays(schedule, MONDAY, 7)).toEqual([
            '2026-11-09',
            '2026-11-11',
            '2026-11-13',
            '2026-11-15',
            '2026-11-17',
            '2026-11-19',
            '2026-11-21',
        ]);
    });

    it('an interval has no gym days before its start date', () => {
        const schedule: GymSchedule = { kind: 'interval', everyDays: 2, startDate: MONDAY };

        expect(isGymDay(schedule, '2026-11-07')).toBe(false);
    });

    it('an interval counts calendar days across a daylight saving change', () => {
        // Clocks change in Europe on 28 March 2027.
        const schedule: GymSchedule = { kind: 'interval', everyDays: 3, startDate: '2027-03-26' };

        expect(isGymDay(schedule, '2027-03-29')).toBe(true);
    });

    it('rejects a weekday schedule with no days', () => {
        expect(validateGymSchedule({ kind: 'weekdays', weekdays: [] }).ok).toBe(false);
    });

    it('rejects an interval outside 1 to 14 days or with a bad start date', () => {
        expect(validateGymSchedule({ kind: 'interval', everyDays: 0, startDate: MONDAY }).ok).toBe(
            false,
        );
        expect(validateGymSchedule({ kind: 'interval', everyDays: 15, startDate: MONDAY }).ok).toBe(
            false,
        );
        expect(validateGymSchedule({ kind: 'interval', everyDays: 2, startDate: 'soon' }).ok).toBe(
            false,
        );
    });

    it('stores weekdays sorted and without duplicates', () => {
        const result = validateGymSchedule({ kind: 'weekdays', weekdays: [5, 1, 5] });

        expect(result).toEqual({ ok: true, value: { kind: 'weekdays', weekdays: [1, 5] } });
    });
});
