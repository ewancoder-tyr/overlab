import { Service, computed, effect, inject, signal } from '@angular/core';
import { Locale } from '@shared/application/locale.service';
import { Result, fail } from '@shared/domain/result';
import { MAX_SOLO_REMINDERS } from '@settings/domain/solo-reminder';
import { HypeFact, ReminderChannel, ReminderPlan, SoloReminderPlan } from './reminder-channel';
import { SettingsService } from './settings.service';

/**
 * What the app knows about an exercise that has a solo reminder: its name in the user's
 * language and, once it has been done outside a workout, the line to roast with. Like the hype,
 * this context cannot work it out itself; the app shell hands it in (see `app.config.ts`).
 */
export interface SoloReminderFact {
    readonly exerciseId: string;
    readonly exercise: string;
    readonly hype?: HypeFact;
}

/**
 * Reminders for this device: the gym day reminder and the solo reminders.
 *
 * The plan (which days, what time) comes from the log, which is the same on every device.
 * Whether reminders are ON is a fact about one device, held by the browser as a push
 * subscription, so it is not an event and not stored by us at all. One switch covers both kinds.
 */
@Service()
export class RemindersService {
    private readonly settings = inject(SettingsService);
    private readonly channel = inject(ReminderChannel);
    private readonly language = inject(Locale).language;

    readonly state = this.channel.state;

    /** The lines a reminder may tease the user with. Empty until a workout has been logged. */
    private readonly hype = signal<readonly HypeFact[]>([]);

    /**
     * `undefined` until the shell has handed the facts in for the first time. The custom
     * `equal` compares by content: the shell rebuilds the list after every logged set, and the
     * plan (and with it a request to the server) should change only when a fact really did.
     */
    private readonly soloFacts = signal<readonly SoloReminderFact[] | undefined>(undefined, {
        equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    });

    /**
     * The solo reminders as the server gets them. One whose exercise the catalog does not know
     * (no fact for it) is left out: there would be no name to put on the notification.
     */
    private readonly solo = computed<readonly SoloReminderPlan[]>(() => {
        const facts = this.soloFacts() ?? [];
        return (
            this.settings
                .soloReminders()
                .flatMap((reminder): SoloReminderPlan[] => {
                    const fact = facts.find((other) => other.exerciseId === reminder.exerciseId);
                    return fact === undefined
                        ? []
                        : [
                              {
                                  id: reminder.exerciseId,
                                  exercise: fact.exercise,
                                  schedule: reminder.schedule,
                                  time: reminder.time,
                                  ...(fact.hype === undefined ? {} : { hype: fact.hype }),
                              },
                          ];
                })
                // The server takes no more; a merge of two devices can leave more in the log.
                .slice(0, MAX_SOLO_REMINDERS)
        );
    });

    /** Everything the server is told. Without gym days and solo reminders it is an empty plan. */
    readonly plan = computed<ReminderPlan>(() => {
        const { gymSchedule, reminderTime } = this.settings.preferences();
        return {
            ...(gymSchedule === undefined ? {} : { schedule: gymSchedule }),
            time: reminderTime,
            hype: this.hype(),
            solo: this.solo(),
            language: this.language(),
        };
    });

    /** Whether there is anything to remind about: gym days, or at least one solo reminder. */
    readonly hasPlan = computed(() => {
        const plan = this.plan();
        return plan.schedule !== undefined || plan.solo.length > 0;
    });

    constructor() {
        // An effect re-runs whenever a signal it read changes. This one keeps the server in
        // step with the app: it fires at start-up (repairing a server that lost its data) and
        // again every time the schedule, the time, the hype, a solo reminder or the language
        // changes while reminders are on. An empty plan is sent too: that is how the server
        // learns that the last solo reminder was removed.
        effect(() => {
            const plan = this.plan();
            // Until the solo facts have arrived the plan lacks every solo reminder; sending it
            // would make the server forget them for a moment.
            if (this.soloFacts() !== undefined && this.state() === 'on') {
                void this.channel.update(plan);
            }
        });
    }

    /** Replaces the lines the reminder may tease the user with. */
    setHype(facts: readonly HypeFact[]): void {
        this.hype.set(facts);
    }

    /** Replaces what is known about the exercises that have a solo reminder. */
    setSoloFacts(facts: readonly SoloReminderFact[]): void {
        this.soloFacts.set(facts);
    }

    enable(): Promise<Result<void>> {
        return this.hasPlan()
            ? this.channel.enable(this.plan())
            : Promise.resolve(
                  fail({
                      en: 'Choose your gym days or add a solo reminder first.',
                      ru: 'Сначала выберите дни тренировок или добавьте соло-напоминание.',
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
