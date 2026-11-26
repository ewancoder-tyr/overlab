import { Component, inject, input } from '@angular/core';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';
import { TrainingService } from '@training/application/training.service';
import { StopwatchComponent } from '../stopwatch/stopwatch.component';

const TEXT = {
    en: { workout: 'Workout' },
    ru: { workout: 'Тренировка' },
} satisfies Localized<unknown>;

/**
 * Workout time as a small stopwatch. Nothing to start or stop: it is derived from the log (see
 * `workoutTime`) and simply absent when there is no workout to show. Rest has its own, larger
 * clock (`RestClockComponent`), because rest is the number glanced at between sets.
 *
 * `inline` puts the label beside the digits, for the logging screen's title bar, where height is
 * short. The host keeps its size whether the stopwatch is there or not (the page sets it), so
 * nothing moves when the first set is logged.
 */
@Component({
    selector: 'olab-workout-time',
    imports: [StopwatchComponent],
    templateUrl: './workout-time.component.html',
    styleUrl: './workout-time.component.scss',
})
export class WorkoutTimeComponent {
    private readonly training = inject(TrainingService);
    protected readonly t = translations(TEXT);

    readonly inline = input(false);

    protected readonly workout = this.training.workoutTime;
}
