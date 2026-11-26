import { DomainEvent } from '@shared/domain/event';
import { contextAt } from '../../testing/fixtures';
import { GymSchedule, isGymDay } from './gym-schedule';
import {
    MAX_SOLO_REMINDERS,
    SoloReminder,
    SoloReminderSet,
    currentSoloReminders,
    defaultSoloReminder,
    removeSoloReminder,
    setSoloReminder,
} from './solo-reminder';

const EVERY_DAY: GymSchedule = { kind: 'interval', everyDays: 1, startDate: '2026-11-16' };

function setAt(
    time: string,
    reminder: SoloReminder,
    current: readonly SoloReminder[] = [],
): SoloReminderSet {
    const result = setSoloReminder(reminder, current, contextAt(time));
    if (!result.ok) {
        throw new Error(`Test fixture is invalid: ${result.error.en}`);
    }
    return result.value;
}

const pushUps = (time = '08:00', schedule: GymSchedule = EVERY_DAY): SoloReminder => ({
    exerciseId: 'push-up',
    schedule,
    time,
});

describe('solo reminders', () => {
    it('start empty', () => {
        expect(currentSoloReminders([])).toEqual([]);
    });

    it('a new one is every day from today, in the morning', () => {
        const reminder = defaultSoloReminder('push-up', '2026-11-16');

        expect(reminder.time).toBe('08:00');
        expect(isGymDay(reminder.schedule, '2026-11-16')).toBe(true);
        expect(isGymDay(reminder.schedule, '2026-11-17')).toBe(true);
    });

    it('one per exercise: setting it again replaces it', () => {
        const events = [
            setAt('2026-11-16T10:00:00Z', pushUps('08:00')),
            setAt('2026-11-16T11:00:00Z', pushUps('07:30')),
        ];

        expect(currentSoloReminders(events)).toEqual([pushUps('07:30')]);
    });

    it('every exercise has its own days and time, listed earliest in the day first', () => {
        const everySecondDay: GymSchedule = {
            kind: 'interval',
            everyDays: 2,
            startDate: '2026-11-17',
        };
        const pullUps: SoloReminder = {
            exerciseId: 'pull-up',
            schedule: everySecondDay,
            time: '07:00',
        };
        const events = [
            setAt('2026-11-16T10:00:00Z', pushUps()),
            setAt('2026-11-16T10:01:00Z', pullUps),
        ];

        expect(currentSoloReminders(events)).toEqual([pullUps, pushUps()]);
    });

    it('follow the most recent event of each exercise, whatever the stored order', () => {
        const set = setAt('2026-11-16T10:00:00Z', pushUps());
        const removed = removeSoloReminder('push-up', contextAt('2026-11-17T10:00:00Z'));
        const setAgain = setAt('2026-11-18T10:00:00Z', pushUps('09:00'));

        expect(currentSoloReminders([removed, set])).toEqual([]);
        expect(currentSoloReminders([setAgain, removed, set])).toEqual([pushUps('09:00')]);
    });

    it('two devices setting different exercises both keep theirs', () => {
        const onPhone = setAt('2026-11-16T10:00:00Z', pushUps());
        const onTablet = setAt('2026-11-16T10:00:30Z', { ...pushUps(), exerciseId: 'pull-up' });

        const merged = currentSoloReminders([onTablet, onPhone]);

        expect(merged.map((reminder) => reminder.exerciseId)).toEqual(['pull-up', 'push-up']);
    });

    it('refuse a schedule with no days, a time that is not a time and a missing exercise', () => {
        const context = contextAt('2026-11-16T10:00:00Z');
        const noDays: GymSchedule = { kind: 'weekdays', weekdays: [] };

        expect(setSoloReminder(pushUps('08:00', noDays), [], context).ok).toBe(false);
        expect(setSoloReminder(pushUps('8 am'), [], context).ok).toBe(false);
        expect(setSoloReminder({ ...pushUps(), exerciseId: '' }, [], context).ok).toBe(false);
        expect(setSoloReminder({ ...pushUps(), exerciseId: '../data' }, [], context).ok).toBe(
            false,
        );
    });

    it(`refuse an eleventh exercise, but still change one of the ${MAX_SOLO_REMINDERS}`, () => {
        const context = contextAt('2026-11-16T10:00:00Z');
        const full = Array.from({ length: MAX_SOLO_REMINDERS }, (_, index) => ({
            ...pushUps(),
            exerciseId: `exercise-${index}`,
        }));

        expect(setSoloReminder(pushUps(), full, context).ok).toBe(false);
        expect(
            setSoloReminder({ ...pushUps('06:00'), exerciseId: 'exercise-3' }, full, context).ok,
        ).toBe(true);
    });

    it('skip other events and reminders that do not validate', () => {
        const good = setAt('2026-11-16T10:00:00Z', pushUps());
        const noTime = { ...good, id: 'x1', exerciseId: 'pull-up', time: undefined };
        const badSchedule = { ...good, id: 'x2', exerciseId: 'dip', schedule: { kind: 'never' } };
        const other = { ...good, id: 'x3', type: 'SomethingElse', exerciseId: 'squat' };

        const reminders = currentSoloReminders([
            good,
            noTime as unknown as DomainEvent,
            badSchedule as unknown as DomainEvent,
            other as unknown as DomainEvent,
        ]);

        expect(reminders).toEqual([pushUps()]);
    });
});
