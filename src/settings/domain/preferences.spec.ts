import { DomainEvent } from '@shared/domain/event';
import { contextAt } from '../../testing/fixtures';
import {
    PreferenceChanged,
    changeCardioGoal,
    changeColorScheme,
    changeGamification,
    changeLanguage,
    changeLightSetPercent,
    changeStallInvolvementPercent,
    changeReminderTime,
    changeRestAlert,
    changeSwitchRestAlert,
    changeTargetWindow,
    changeStallThreshold,
    changeTrainingFocus,
    changeVolumeTarget,
    currentPreferences,
} from './preferences';

function valueOf(result: { ok: boolean; value?: PreferenceChanged }): PreferenceChanged {
    if (!result.ok || result.value === undefined) {
        throw new Error('Test fixture is invalid');
    }
    return result.value;
}

const timeAt = (time: string, reminderTime: string): PreferenceChanged =>
    valueOf(changeReminderTime(reminderTime, contextAt(time)));

describe('preferences', () => {
    it('start with a 15:00 reminder, a rest alert after a minute, a stall warning after three sessions, lifting and cardio, 10 sets and 150 cardio minutes a week, light sets at half, stalls marking muscles involved by more than half, the dark colour scheme, gamification off', () => {
        expect(currentPreferences([])).toEqual({
            reminderTime: '15:00',
            restAlertSeconds: 60,
            switchRestAlertSeconds: 180,
            stallThreshold: 3,
            trainingFocus: 'both',
            volumeTargetSets: 10,
            cardioGoalMinutes: 150,
            lightSetPercent: 50,
            stallInvolvementPercent: 50,
            targetWindowDays: 7,
            colorScheme: 'dark',
            gamification: false,
        });
    });

    it('training-focus accepts the three values and rejects anything else; the default is both', () => {
        const context = contextAt('2026-11-11T10:00:00Z');

        expect(currentPreferences([]).trainingFocus).toBe('both');
        for (const focus of ['both', 'lifting', 'cardio'] as const) {
            expect(
                currentPreferences([valueOf(changeTrainingFocus(focus, context))]).trainingFocus,
            ).toBe(focus);
        }
        for (const invalid of ['swimming', '', 'Both']) {
            expect(
                changeTrainingFocus(invalid as 'both', context).ok,
                JSON.stringify(invalid),
            ).toBe(false);
        }
    });

    it('color-scheme accepts dark and light and rejects anything else; the default is dark', () => {
        const context = contextAt('2026-11-13T10:00:00Z');

        expect(currentPreferences([]).colorScheme).toBe('dark');
        for (const scheme of ['dark', 'light'] as const) {
            expect(
                currentPreferences([valueOf(changeColorScheme(scheme, context))]).colorScheme,
            ).toBe(scheme);
        }
        for (const invalid of ['sepia', '', 'Light']) {
            expect(changeColorScheme(invalid as 'dark', context).ok, JSON.stringify(invalid)).toBe(
                false,
            );
        }
    });

    it('gamification is off by default and switches on and off again; the latest change wins', () => {
        const on = valueOf(changeGamification(true, contextAt('2026-11-14T10:00:00Z')));
        const off = valueOf(changeGamification(false, contextAt('2026-11-14T11:00:00Z')));

        expect(currentPreferences([]).gamification).toBe(false);
        expect(currentPreferences([on]).gamification).toBe(true);
        expect(currentPreferences([off, on]).gamification).toBe(false);
        expect(
            changeGamification('yes' as unknown as boolean, contextAt('2026-11-14T10:00:00Z')).ok,
        ).toBe(false);
    });

    it('volume-target accepts whole numbers 4 to 20; the default is 10', () => {
        const context = contextAt('2026-11-11T10:00:00Z');

        expect(currentPreferences([]).volumeTargetSets).toBe(10);
        expect(currentPreferences([valueOf(changeVolumeTarget(8, context))]).volumeTargetSets).toBe(
            8,
        );
        expect(changeVolumeTarget(4, context).ok).toBe(true);
        expect(changeVolumeTarget(20, context).ok).toBe(true);
        for (const invalid of [0, 3, 21, 8.5, -10]) {
            expect(changeVolumeTarget(invalid, context).ok, String(invalid)).toBe(false);
        }
    });

    it('cardio-goal accepts 30 to 600 in multiples of 15; the default is 150', () => {
        const context = contextAt('2026-11-11T10:00:00Z');

        expect(currentPreferences([]).cardioGoalMinutes).toBe(150);
        expect(currentPreferences([valueOf(changeCardioGoal(45, context))]).cardioGoalMinutes).toBe(
            45,
        );
        expect(changeCardioGoal(30, context).ok).toBe(true);
        expect(changeCardioGoal(600, context).ok).toBe(true);
        for (const invalid of [0, 15, 40, 615, 150.5]) {
            expect(changeCardioGoal(invalid, context).ok, String(invalid)).toBe(false);
        }
    });

    it('stall-involvement accepts 0 to 90 percent in steps of 10; the default is 50', () => {
        const context = contextAt('2026-11-11T10:00:00Z');

        expect(currentPreferences([]).stallInvolvementPercent).toBe(50);
        expect(
            currentPreferences([valueOf(changeStallInvolvementPercent(70, context))])
                .stallInvolvementPercent,
        ).toBe(70);
        expect(changeStallInvolvementPercent(0, context).ok).toBe(true);
        expect(changeStallInvolvementPercent(90, context).ok).toBe(true);
        for (const invalid of [-10, 5, 100, 50.5]) {
            expect(changeStallInvolvementPercent(invalid, context).ok, String(invalid)).toBe(false);
        }
    });

    it('target-window accepts 3 to 28 whole days; the default is 7', () => {
        const context = contextAt('2026-11-11T10:00:00Z');

        expect(currentPreferences([]).targetWindowDays).toBe(7);
        expect(
            currentPreferences([valueOf(changeTargetWindow(14, context))]).targetWindowDays,
        ).toBe(14);
        expect(changeTargetWindow(3, context).ok).toBe(true);
        expect(changeTargetWindow(28, context).ok).toBe(true);
        for (const invalid of [0, 2, 29, 7.5]) {
            expect(changeTargetWindow(invalid, context).ok, String(invalid)).toBe(false);
        }
    });

    it('light-set-weight accepts 0 to 100 percent in steps of 10; the default is 50', () => {
        const context = contextAt('2026-11-11T10:00:00Z');

        expect(currentPreferences([]).lightSetPercent).toBe(50);
        expect(
            currentPreferences([valueOf(changeLightSetPercent(30, context))]).lightSetPercent,
        ).toBe(30);
        expect(changeLightSetPercent(0, context).ok).toBe(true);
        expect(changeLightSetPercent(100, context).ok).toBe(true);
        for (const invalid of [-10, 5, 110, 50.5]) {
            expect(changeLightSetPercent(invalid, context).ok, String(invalid)).toBe(false);
        }
    });

    it('keep the stall threshold, off (0) or 2 to 10 sessions', () => {
        const context = contextAt('2026-11-11T10:00:00Z');

        expect(currentPreferences([valueOf(changeStallThreshold(5, context))]).stallThreshold).toBe(
            5,
        );
        expect(currentPreferences([valueOf(changeStallThreshold(0, context))]).stallThreshold).toBe(
            0,
        );
        expect(changeStallThreshold(2, context).ok).toBe(true);
        expect(changeStallThreshold(10, context).ok).toBe(true);
        for (const invalid of [1, -1, -3, 11, 2.5]) {
            expect(changeStallThreshold(invalid, context).ok, String(invalid)).toBe(false);
        }
    });

    it('keep the rest alert, off or 15 to 300 seconds in steps of 15', () => {
        const context = contextAt('2026-11-11T10:00:00Z');

        expect(currentPreferences([valueOf(changeRestAlert(90, context))]).restAlertSeconds).toBe(
            90,
        );
        expect(currentPreferences([valueOf(changeRestAlert(0, context))]).restAlertSeconds).toBe(0);
        expect(changeRestAlert(15, context).ok).toBe(true);
        expect(changeRestAlert(300, context).ok).toBe(true);
        for (const invalid of [-15, 1, 14, 20, 301, 315, 22.5]) {
            expect(changeRestAlert(invalid, context).ok, String(invalid)).toBe(false);
        }
    });

    it('keep the rest alert between exercises, 3:00 by default, off or 15 to 600 seconds', () => {
        const context = contextAt('2026-11-11T10:00:00Z');

        expect(currentPreferences([]).switchRestAlertSeconds).toBe(180);
        expect(
            currentPreferences([valueOf(changeSwitchRestAlert(240, context))])
                .switchRestAlertSeconds,
        ).toBe(240);
        // Its own preference: changing it leaves the alert between sets alone.
        expect(
            currentPreferences([valueOf(changeSwitchRestAlert(240, context))]).restAlertSeconds,
        ).toBe(60);
        expect(changeSwitchRestAlert(0, context).ok).toBe(true);
        expect(changeSwitchRestAlert(600, context).ok).toBe(true);
        for (const invalid of [-15, 1, 14, 601, 615]) {
            expect(changeSwitchRestAlert(invalid, context).ok, String(invalid)).toBe(false);
        }
    });

    it('have no language until one is chosen, then keep the most recent choice', () => {
        const english = valueOf(changeLanguage('en', contextAt('2026-11-10T10:00:00Z')));
        const russian = valueOf(changeLanguage('ru', contextAt('2026-11-11T10:00:00Z')));

        expect(currentPreferences([]).language).toBeUndefined();
        expect(currentPreferences([russian, english]).language).toBe('ru');
    });

    it('skip a language this version does not speak', () => {
        const russian = valueOf(changeLanguage('ru', contextAt('2026-11-10T10:00:00Z')));
        const klingon = {
            ...russian,
            id: 'x3',
            occurredAt: '2026-11-12T10:00:00.000Z',
            value: 'tlh',
        };

        expect(currentPreferences([russian, klingon as unknown as DomainEvent]).language).toBe(
            'ru',
        );
    });

    it('take the most recent change of each preference, whatever the stored order', () => {
        const older = timeAt('2026-11-10T10:00:00Z', '17:00');
        const newer = timeAt('2026-11-11T10:00:00Z', '18:30');

        const preferences = currentPreferences([newer, older]);

        expect(preferences).toEqual({
            reminderTime: '18:30',
            restAlertSeconds: 60,
            switchRestAlertSeconds: 180,
            stallThreshold: 3,
            trainingFocus: 'both',
            volumeTargetSets: 10,
            cardioGoalMinutes: 150,
            lightSetPercent: 50,
            stallInvolvementPercent: 50,
            targetWindowDays: 7,
            colorScheme: 'dark',
            gamification: false,
        });
    });

    it('reject an invalid reminder time, so it never reaches the log', () => {
        const context = contextAt('2026-11-11T10:00:00Z');

        expect(changeReminderTime('25:00', context).ok).toBe(false);
        expect(changeReminderTime('3pm', context).ok).toBe(false);
    });

    it('skip unknown preferences and values that do not validate', () => {
        const valid = timeAt('2026-11-10T10:00:00Z', '18:30');
        const fromTheFuture = { ...valid, id: 'x1', preference: 'theme', value: 'light' };
        const broken = {
            ...valid,
            id: 'x2',
            occurredAt: '2026-11-12T10:00:00.000Z',
            value: '25:00',
        };

        const preferences = currentPreferences([
            valid,
            fromTheFuture as unknown as DomainEvent,
            broken as unknown as DomainEvent,
        ]);

        expect(preferences.reminderTime).toBe('18:30');
    });

    it('skip the gym schedule and the rotation of the time before programs', () => {
        const valid = timeAt('2026-11-10T10:00:00Z', '18:30');
        const schedule = {
            ...valid,
            id: 'x1',
            preference: 'gym-schedule',
            value: { kind: 'weekdays', weekdays: [1, 3, 5] },
        };
        const rotation = { ...valid, id: 'x2', preference: 'workout-rotation', value: 3 };

        const preferences = currentPreferences([
            valid,
            schedule as unknown as DomainEvent,
            rotation as unknown as DomainEvent,
        ]);

        expect(preferences).toEqual({ ...currentPreferences([]), reminderTime: '18:30' });
    });
});
