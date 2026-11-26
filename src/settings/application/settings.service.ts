import { Service, computed, inject } from '@angular/core';
import { EventLog } from '@shared/application/event-log.service';
import { ColorSchemeId } from '@shared/domain/color-scheme';
import { Language } from '@shared/domain/language';
import { Result } from '@shared/domain/result';
import { TrainingFocus } from '@shared/domain/training-focus';
import { GymSchedule } from '@settings/domain/gym-schedule';
import {
    PreferenceChanged,
    TimeOfDay,
    changeColorScheme,
    changeGamification,
    changeGymSchedule,
    changeCardioGoal,
    changeLightSetPercent,
    changeStallInvolvementPercent,
    changeLanguage,
    changeReminderTime,
    changeRestAlert,
    changeSwitchRestAlert,
    changeTargetWindow,
    changeStallThreshold,
    changeTrainingFocus,
    changeVolumeTarget,
    changeWorkoutRotation,
    currentPreferences,
} from '@settings/domain/preferences';
import {
    SoloReminder,
    SoloReminderSet,
    currentSoloReminders,
    removeSoloReminder,
    setSoloReminder,
} from '@settings/domain/solo-reminder';

/**
 * Application service of the settings context. Like its training counterpart it only connects
 * the pure domain functions to the event log: a factory validates, the log stores, and the
 * `preferences` signal re-derives itself.
 */
@Service()
export class SettingsService {
    private readonly log = inject(EventLog);

    readonly preferences = computed(() => currentPreferences(this.log.events()));

    /**
     * The alarms for single exercises done outside workouts. See "Solo Reminder" in
     * docs/glossary.md.
     */
    readonly soloReminders = computed(() => currentSoloReminders(this.log.events()));

    setGymSchedule(schedule: GymSchedule): Promise<Result<PreferenceChanged>> {
        return this.record(changeGymSchedule(schedule, this.log.context()));
    }

    setReminderTime(time: TimeOfDay): Promise<Result<PreferenceChanged>> {
        return this.record(changeReminderTime(time, this.log.context()));
    }

    setWorkoutRotation(rotation: number): Promise<Result<PreferenceChanged>> {
        return this.record(changeWorkoutRotation(rotation, this.log.context()));
    }

    setRestAlert(seconds: number): Promise<Result<PreferenceChanged>> {
        return this.record(changeRestAlert(seconds, this.log.context()));
    }

    setSwitchRestAlert(seconds: number): Promise<Result<PreferenceChanged>> {
        return this.record(changeSwitchRestAlert(seconds, this.log.context()));
    }

    setStallThreshold(sessions: number): Promise<Result<PreferenceChanged>> {
        return this.record(changeStallThreshold(sessions, this.log.context()));
    }

    setTrainingFocus(focus: TrainingFocus): Promise<Result<PreferenceChanged>> {
        return this.record(changeTrainingFocus(focus, this.log.context()));
    }

    setVolumeTarget(sets: number): Promise<Result<PreferenceChanged>> {
        return this.record(changeVolumeTarget(sets, this.log.context()));
    }

    setCardioGoal(minutes: number): Promise<Result<PreferenceChanged>> {
        return this.record(changeCardioGoal(minutes, this.log.context()));
    }

    setLightSetPercent(percent: number): Promise<Result<PreferenceChanged>> {
        return this.record(changeLightSetPercent(percent, this.log.context()));
    }

    setStallInvolvementPercent(percent: number): Promise<Result<PreferenceChanged>> {
        return this.record(changeStallInvolvementPercent(percent, this.log.context()));
    }

    setTargetWindow(days: number): Promise<Result<PreferenceChanged>> {
        return this.record(changeTargetWindow(days, this.log.context()));
    }

    setColorScheme(scheme: ColorSchemeId): Promise<Result<PreferenceChanged>> {
        return this.record(changeColorScheme(scheme, this.log.context()));
    }

    setGamification(on: boolean): Promise<Result<PreferenceChanged>> {
        return this.record(changeGamification(on, this.log.context()));
    }

    setLanguage(language: Language): Promise<Result<PreferenceChanged>> {
        return this.record(changeLanguage(language, this.log.context()));
    }

    /** Sets the solo reminder of an exercise, replacing the one it had. */
    async setSoloReminder(reminder: SoloReminder): Promise<Result<SoloReminderSet>> {
        const result = setSoloReminder(reminder, this.soloReminders(), this.log.context());
        if (result.ok) {
            await this.log.append(result.value);
        }
        return result;
    }

    async removeSoloReminder(exerciseId: string): Promise<void> {
        await this.log.append(removeSoloReminder(exerciseId, this.log.context()));
    }

    private async record(result: Result<PreferenceChanged>): Promise<Result<PreferenceChanged>> {
        if (result.ok) {
            await this.log.append(result.value);
        }
        return result;
    }
}
