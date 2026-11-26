import { Component, input, output, signal } from '@angular/core';

/**
 * The app's one big "log it" button, drawn as a dumbbell: three weight plates on each side of a
 * thick handle that carries the label. It is one ordinary <button>; the plates are decoration.
 *
 * Shared by the set form and the cardio form, so both screens end in the same place and shape.
 */
@Component({
    selector: 'olab-log-button',
    templateUrl: './log-button.component.html',
    styleUrl: './log-button.component.scss',
})
export class LogButtonComponent {
    readonly label = input.required<string>();
    /** Not named `click`: that would clash with the native event of the host element. */
    readonly pressed = output();

    /** Plays the "lift" animation once after each press. */
    protected readonly lifted = signal(false);

    protected press(): void {
        this.lifted.set(true);
        this.pressed.emit();
    }
}
