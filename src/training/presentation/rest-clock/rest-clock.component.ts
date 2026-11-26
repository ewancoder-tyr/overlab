import { Component, computed, inject, input } from '@angular/core';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';
import { RestAlert } from '@training/application/rest-alert.service';
import { TrainingService } from '@training/application/training.service';
import { formatElapsed } from '@training/domain/session-clock';
import { StopwatchComponent } from '../stopwatch/stopwatch.component';

const TEXT = {
    en: { rest: 'Rest' },
    ru: { rest: 'Отдых' },
} satisfies Localized<unknown>;

/**
 * Rest as a stopwatch. `big` (the default) gives it large digits and the kettlebell, for the logging
 * screen, where rest is the number glanced at from the bench between sets; otherwise it is the
 * same small pill as the workout time.
 * Nothing to start or stop: it counts from the latest set (`restStart`) and is simply absent
 * outside the idle limit. Past the rest alert it turns yellow, "you can go now".
 *
 * The host is a flexible box that centres the clock in whatever room the page gives it, so the
 * page decides where it sits and how much space it may take.
 */
@Component({
    selector: 'olab-rest-clock',
    imports: [StopwatchComponent],
    templateUrl: './rest-clock.component.html',
    styleUrl: './rest-clock.component.scss',
})
export class RestClockComponent {
    private readonly training = inject(TrainingService);
    private readonly restAlert = inject(RestAlert);
    protected readonly t = translations(TEXT);

    readonly big = input(true);

    protected readonly rest = this.training.restStart;
    protected readonly alertSeconds = this.restAlert.alertSeconds;

    /**
     * One polite announcement when the rest alert goes off ("Rest 1:00"), so the alert is not
     * colour alone. The text appears once and stays until the next set, so it is read once.
     */
    protected readonly announcement = computed(() =>
        this.restAlert.rang()
            ? `${this.t().rest} ${formatElapsed(this.alertSeconds() * 1000)}`
            : '',
    );
}
