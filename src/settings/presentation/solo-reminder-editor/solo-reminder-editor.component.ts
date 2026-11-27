import { Component, computed, inject, input, signal } from '@angular/core';
import { SettingsService } from '@settings/application/settings.service';
import {
    Schedule,
    MAX_EVERY_DAYS,
    Weekday,
    addDays,
    toLocalDate,
    upcomingDays,
} from '@shared/domain/schedule';
import { SoloReminder, defaultSoloReminder } from '@settings/domain/solo-reminder';
import { Clock } from '@shared/application/clock.service';
import { LocalText, plural } from '@shared/domain/language';
import {
    LocalDatePipe,
    LocalizePipe,
    currentLanguage,
    translations,
} from '@shared/presentation/i18n';
import { StepperComponent } from '@shared/presentation/stepper/stepper.component';
import { WEEKDAYS } from '../schedule-wording';

const TEXT = {
    en: {
        add: 'Remind me',
        none: 'No reminder for this exercise yet. It starts as every day at 08:00; change it as you like.',
        remindAt: 'Remind me at',
        howPlanned: 'Which days',
        daysOfWeek: 'Days of the week',
        everyFewDays: 'Every few days',
        every: 'Every',
        days: (count: number) => plural('en', count, { one: 'day', other: 'days' }),
        countedFrom: 'Counted from',
        restart: '. Restart the count so that the next reminder is:',
        nextReminder: 'Next reminder',
        today: 'Today',
        tomorrow: 'Tomorrow',
        nextDays: 'Next reminders',
        remove: 'Remove reminder',
    },
    ru: {
        add: 'Напоминать',
        none: 'Для этого упражнения напоминания пока нет. Сначала оно на каждый день в 08:00; меняйте как удобно.',
        remindAt: 'Напоминать в',
        howPlanned: 'В какие дни',
        daysOfWeek: 'Дни недели',
        everyFewDays: 'Раз в несколько дней',
        every: 'Раз в',
        days: (count: number) =>
            plural('ru', count, { one: 'день', few: 'дня', many: 'дней', other: 'дня' }),
        countedFrom: 'Отсчёт с',
        restart: '. Начать отсчёт заново, чтобы следующее напоминание было:',
        nextReminder: 'Следующее напоминание',
        today: 'Сегодня',
        tomorrow: 'Завтра',
        nextDays: 'Ближайшие напоминания',
        remove: 'Убрать напоминание',
    },
};

/**
 * The solo reminder of one exercise: its days and its time (see "Solo reminder rule" in
 * docs/reminders.md). Used inside the Reminders card of Settings and behind the bell on the logging
 * screen, so the two always offer the same choices.
 *
 * Like the Settings page it has no "Save" button: every control records its change at once, as
 * a `SoloReminderSet` event, and the component re-renders from the log.
 */
@Component({
    selector: 'olab-solo-reminder-editor',
    imports: [LocalDatePipe, LocalizePipe, StepperComponent],
    templateUrl: './solo-reminder-editor.component.html',
    styleUrl: './solo-reminder-editor.component.scss',
})
export class SoloReminderEditorComponent {
    private readonly settings = inject(SettingsService);
    private readonly clock = inject(Clock);
    private readonly language = currentLanguage();

    /** The exercise the reminder is for, as its catalog id. */
    readonly exerciseId = input.required<string>();

    protected readonly t = translations(TEXT);

    /** The reminder as it is in the log; `undefined` while the exercise has none. */
    protected readonly reminder = computed(() =>
        this.settings.soloReminders().find((other) => other.exerciseId === this.exerciseId()),
    );

    private readonly today = computed(() => toLocalDate(this.clock.now()));

    /** The seven day chips, each knowing whether it is switched on. */
    protected readonly weekdays = computed(() => {
        const schedule = this.reminder()?.schedule;
        const chosen = schedule?.kind === 'weekdays' ? schedule.weekdays : [];
        return WEEKDAYS[this.language()].map((day) => ({ ...day, on: chosen.includes(day.id) }));
    });

    /** The next few days it rings on, as proof that "every 3 days" means what the user thinks. */
    protected readonly upcoming = computed(() => {
        const reminder = this.reminder();
        return reminder === undefined ? [] : upcomingDays(reminder.schedule, this.today(), 5);
    });

    /**
     * Which of Today / Tomorrow describes the schedule: 0 when it rings today, 1 when tomorrow
     * is the next day, undefined when the next one is later still (neither option is lit).
     */
    protected readonly nextOffset = computed(() => {
        const next = this.upcoming()[0];
        if (next === this.today()) {
            return 0;
        }
        return next === addDays(this.today(), 1) ? 1 : undefined;
    });

    protected readonly error = signal<LocalText | undefined>(undefined);

    protected add(): void {
        void this.save(defaultSoloReminder(this.exerciseId(), this.today()));
    }

    protected remove(): void {
        this.error.set(undefined);
        void this.settings.removeSoloReminder(this.exerciseId());
    }

    protected setTime(time: string): void {
        this.change({ time });
    }

    protected chooseWeekdays(): void {
        if (this.reminder()?.schedule.kind !== 'weekdays') {
            // Every day is the usual alarm; the chips take days away.
            this.setSchedule({ kind: 'weekdays', weekdays: [1, 2, 3, 4, 5, 6, 7] });
        }
    }

    protected chooseInterval(): void {
        if (this.reminder()?.schedule.kind !== 'interval') {
            this.setSchedule({ kind: 'interval', everyDays: 2, startDate: this.today() });
        }
    }

    protected toggleDay(day: Weekday): void {
        const schedule = this.reminder()?.schedule;
        if (schedule?.kind !== 'weekdays') {
            return;
        }
        const weekdays = schedule.weekdays.includes(day)
            ? schedule.weekdays.filter((other) => other !== day)
            : [...schedule.weekdays, day];
        // Removing the last day is refused by the factory; its message explains why.
        this.setSchedule({ kind: 'weekdays', weekdays });
    }

    protected setEveryDays(everyDays: number): void {
        const schedule = this.reminder()?.schedule;
        if (schedule?.kind === 'interval') {
            this.setSchedule({ ...schedule, everyDays: Math.min(everyDays, MAX_EVERY_DAYS) });
        }
    }

    /** Restarts the count so that it rings today (offset 0) or tomorrow (offset 1). */
    protected startCycle(offset: number): void {
        const schedule = this.reminder()?.schedule;
        if (schedule?.kind === 'interval') {
            this.setSchedule({ ...schedule, startDate: addDays(this.today(), offset) });
        }
    }

    private setSchedule(schedule: Schedule): void {
        this.change({ schedule });
    }

    /** Records the reminder with one thing changed. `Partial` makes every field optional. */
    private change(changes: Partial<SoloReminder>): void {
        const reminder = this.reminder();
        if (reminder !== undefined) {
            void this.save({ ...reminder, ...changes });
        }
    }

    private async save(reminder: SoloReminder): Promise<void> {
        const result = await this.settings.setSoloReminder(reminder);
        this.error.set(result.ok ? undefined : result.error);
    }
}
