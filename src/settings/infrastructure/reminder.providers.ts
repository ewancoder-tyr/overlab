import {
    EnvironmentProviders,
    inject,
    makeEnvironmentProviders,
    provideAppInitializer,
} from '@angular/core';
import { ReminderChannel } from '@settings/application/reminder-channel';
import { RemindersService } from '@settings/application/reminders.service';
import { PushReminderChannel } from './push-reminder-channel';

/** Wires reminders to Web Push. Called from `app.config.ts`. */
export function provideReminders(): EnvironmentProviders {
    return makeEnvironmentProviders([
        { provide: ReminderChannel, useClass: PushReminderChannel },
        // Services are created lazily, on first injection. This one has work to do at start-up
        // (re-sending the plan to the server), so it is created up front.
        provideAppInitializer(() => {
            inject(RemindersService);
        }),
    ]);
}
