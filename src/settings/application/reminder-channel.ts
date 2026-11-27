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
 * One solo reminder as the server needs it: the exercise's id (it names the alarm, and is the
 * page a tap opens) and name (the notification's title), its days and time, and the line to
 * roast with, absent until there is a solo set to quote.
 */
export interface SoloReminderPlan {
    readonly id: string;
    readonly exercise: string;
    readonly schedule: Schedule;
    readonly time: TimeOfDay;
    readonly hype?: HypeFact;
}

/**
 * What the reminders need to know: the gym days, the time of day, what to tease about, the
 * solo reminders, and the language to tease in.
 */
export interface ReminderPlan {
    /** Absent until the user has chosen their gym days: then only solo reminders are sent. */
    readonly schedule?: Schedule;
    readonly time: TimeOfDay;
    readonly hype: readonly HypeFact[];
    readonly solo: readonly SoloReminderPlan[];
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
