import { Signal } from '@angular/core';
import { Language } from '@shared/domain/language';
import { Result } from '@shared/domain/result';
import { Schedule, TimeOfDay } from '@shared/domain/schedule';

/**
 * Whether this device can and does receive reminders.
 * - `unsupported`: no push here (not installed as an app, an old browser, the single-file build).
 * - `blocked`: the user refused notifications for this site in the browser.
 * - `off` / `on`: available, and switched off or on.
 */
export type ReminderChannelState = 'unsupported' | 'blocked' | 'off' | 'on';

/**
 * A line the reminder can tease the user with: what they did last time on an exercise and what
 * to go for today, already worded ("Bench press", "25 kg", "30 kg"). This context does not know
 * about training; the app shell hands these in (see `app.config.ts`).
 */
export interface HypeFact {
    readonly exercise: string;
    readonly last: string;
    readonly target: string;
    /** Whether the exercise is cardio, so the server roasts it in cardio words. */
    readonly cardio: boolean;
}

/**
 * The reminder of one program as the server needs it: an id (it names the alarm on the device),
 * the notification's title, its days and time, and the lines to roast with (the server picks
 * one; none until there is a set to quote).
 */
export interface ProgramReminderPlan {
    readonly id: string;
    readonly title: string;
    readonly schedule: Schedule;
    readonly time: TimeOfDay;
    readonly hype: readonly HypeFact[];
    /**
     * For a solo program of a single exercise: that exercise's id, so a tap opens its logging
     * screen on solo sets. Otherwise a tap opens the Train page.
     */
    readonly open?: string;
}

/** What the reminders need to know: one reminder per program, and the language to tease in. */
export interface ReminderPlan {
    /**
     * The time programs ring at unless they have their own. The server needs a time for the
     * device itself too (reminder-server/schedule.go), so it travels with the plan.
     */
    readonly time: TimeOfDay;
    readonly programs: readonly ProgramReminderPlan[];
    /** Reminders and "new version" notices are written by the server, so it needs to know. */
    readonly language: Language;
}

/**
 * Port: the way reminders reach this device. The application layer decides WHEN the plan must
 * be sent; the infrastructure layer knows HOW (browser push plus the reminder server).
 *
 * An abstract class, not an interface, so that Angular can use it as an injection key.
 */
export abstract class ReminderChannel {
    abstract readonly state: Signal<ReminderChannelState>;

    /** Asks for permission if needed, subscribes this device and registers the plan. */
    abstract enable(plan: ReminderPlan): Promise<Result<void>>;

    /** Sends a changed plan. Does nothing when reminders are not on. */
    abstract update(plan: ReminderPlan): Promise<Result<void>>;

    abstract disable(): Promise<Result<void>>;

    /** Triggers one notification right now, to check that they arrive. */
    abstract sendTest(): Promise<Result<void>>;
}
