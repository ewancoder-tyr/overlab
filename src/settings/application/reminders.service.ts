import { Service, computed, effect, inject, signal } from '@angular/core';
import { Locale } from '@shared/application/locale.service';
import { Result, fail } from '@shared/domain/result';
import { Schedule, TimeOfDay } from '@shared/domain/schedule';
import { HypeFact, ProgramReminderPlan, ReminderChannel, ReminderPlan } from './reminder-channel';
import { SettingsService } from './settings.service';

/** The server takes no more reminders per device (`maxProgramReminders` in programs.go). */
const MAX_PROGRAM_REMINDERS = 20;

/**
 * What the app knows about a program that reminders need: its name, its days as they stand,
 * when it wants to ring and what to roast with. This context knows neither programs nor the
 * catalog; the app shell hands these in (see `feedProgramReminders` in `app.config.ts`).
 */
export interface ProgramReminderFact {
    readonly id: string;
    readonly title: string;
    readonly schedule: Schedule;
    /**
     * When it rings: at the time set in Settings (`default`), at its own time, or never. The
     * same shape as a program's own `reminder`.
     */
    readonly reminder:
        | { readonly kind: 'default' }
        | { readonly kind: 'off' }
        | { readonly kind: 'at'; readonly time: TimeOfDay };
    readonly hype: readonly HypeFact[];
    readonly open?: string;
}

/**
 * Reminders for this device: one per program, each on the program's days.
 *
 * The plan (which days, what time) comes from the log, which is the same on every device.
 * Whether reminders are ON is a fact about one device, held by the browser as a push
 * subscription, so it is not an event and not stored by us at all. One switch covers them all.
 */
@Service()
export class RemindersService {
    private readonly settings = inject(SettingsService);
    private readonly channel = inject(ReminderChannel);
    private readonly language = inject(Locale).language;

    readonly state = this.channel.state;

    /**
     * `undefined` until the shell has handed the facts in for the first time. The custom
     * `equal` compares by content: the shell rebuilds the list after every logged set, and the
     * plan (and with it a request to the server) should change only when a fact really did.
     */
    private readonly facts = signal<readonly ProgramReminderFact[] | undefined>(undefined, {
        equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    });

    /** The reminders as the server gets them: the programs that ring, each with its time. */
    private readonly programs = computed<readonly ProgramReminderPlan[]>(() => {
        const defaultTime = this.settings.preferences().reminderTime;
        return (this.facts() ?? [])
            .flatMap((fact): ProgramReminderPlan[] => {
                const { reminder, ...rest } = fact;
                if (reminder.kind === 'off') {
                    return [];
                }
                return [{ ...rest, time: reminder.kind === 'at' ? reminder.time : defaultTime }];
            })
            .slice(0, MAX_PROGRAM_REMINDERS);
    });

    /** Everything the server is told. Without a program that rings it is an empty plan. */
    readonly plan = computed<ReminderPlan>(() => ({
        time: this.settings.preferences().reminderTime,
        programs: this.programs(),
        language: this.language(),
    }));

    /** Whether there is anything to remind about: at least one program that rings. */
    readonly hasPlan = computed(() => this.plan().programs.length > 0);

    constructor() {
        // An effect re-runs whenever a signal it read changes. This one keeps the server in
        // step with the app: it fires at start-up (repairing a server that lost its data) and
        // again every time a program, the time, the hype or the language changes while
        // reminders are on. An empty plan is sent too: that is how the server learns that the
        // last program was removed.
        effect(() => {
            const plan = this.plan();
            // Until the facts have arrived the plan lacks every program; sending it would make
            // the server forget them for a moment.
            if (this.facts() !== undefined && this.state() === 'on') {
                void this.channel.update(plan);
            }
        });
    }

    /** Replaces what is known about the programs. */
    setPrograms(facts: readonly ProgramReminderFact[]): void {
        this.facts.set(facts);
    }

    enable(): Promise<Result<void>> {
        return this.hasPlan()
            ? this.channel.enable(this.plan())
            : Promise.resolve(
                  fail({
                      en: 'Create a program with a reminder first.',
                      ru: 'Сначала создайте программу с напоминанием.',
                  }),
              );
    }

    disable(): Promise<Result<void>> {
        return this.channel.disable();
    }

    /**
     * Sends one real reminder now. The plan is pushed first, so the test is composed from
     * exactly what the page shows, even if an earlier background update did not get through.
     */
    async sendTest(): Promise<Result<void>> {
        const updated = await this.channel.update(this.plan());
        if (!updated.ok) {
            return updated;
        }
        return this.channel.sendTest();
    }
}
