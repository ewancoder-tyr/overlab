import { Component, booleanAttribute, computed, input, model } from '@angular/core';
import { Localized } from '@shared/domain/language';
import { translations } from '../i18n';

const TEXT: Localized<{ decrease: string; increase: string }> = {
    en: { decrease: 'Decrease', increase: 'Increase' },
    ru: { decrease: 'Уменьшить', increase: 'Увеличить' },
};

/**
 * A number with large minus and plus buttons on either side.
 *
 * Built for logging in the gym: the buttons are big enough to hit with a thumb, and the common
 * adjustment (one step up or down from last time) is a single tap. The number itself is a text
 * field, so an unusual value can still be typed.
 *
 * `value` is a `model()`: a two-way bindable signal, used by the parent as `[(value)]="reps"`.
 *
 * `compact` is the small version for lists of settings, where the row's own text names the
 * value: the label is then only for screen readers, and the buttons keep a 44 px touch target.
 */
@Component({
    selector: 'olab-stepper',
    templateUrl: './stepper.component.html',
    styleUrl: './stepper.component.scss',
    // `host` binds on the component's own element: a class the stylesheet can target as `:host(.compact)`.
    host: { '[class.compact]': 'compact()' },
})
export class StepperComponent {
    readonly label = input.required<string>();
    readonly value = model.required<number>();
    readonly step = input(1);
    /** Lowest allowed value; leave unset for no limit (assisted loads are negative). */
    readonly min = input<number>();
    /** Highest allowed value; leave unset for no limit. */
    readonly max = input<number>();
    /**
     * Shows the value through this function (e.g. 75 as `1:15`) instead of as an editable
     * number. The value is then changed with the buttons only, since `1:15` cannot be typed
     * back reliably.
     */
    readonly format = input<(value: number) => string>();
    /** Shown after the number, e.g. "kg". */
    readonly unit = input<string>();
    /** Lets fractional values be typed (loads); whole numbers only otherwise (reps). */
    readonly decimal = input(false);
    /**
     * The small version, for a row in a list of settings. `booleanAttribute` lets a template
     * write the bare attribute `compact` (whose value is the empty string) to mean true.
     */
    readonly compact = input(false, { transform: booleanAttribute });

    protected readonly t = translations(TEXT);

    protected readonly atMinimum = computed(() => {
        const min = this.min();
        return min !== undefined && this.value() <= min;
    });

    protected readonly atMaximum = computed(() => {
        const max = this.max();
        return max !== undefined && this.value() >= max;
    });

    /** Number of characters in the displayed value, used to size the text field to fit. */
    protected readonly digits = computed(() => String(this.value()).length);

    protected change(direction: 1 | -1): void {
        this.set(this.value() + direction * this.step());
    }

    /** Typed input. Unparseable text is ignored, leaving the previous value in place. */
    protected type(text: string): void {
        const parsed = Number(text.trim().replace(',', '.'));
        if (text.trim() !== '' && Number.isFinite(parsed)) {
            this.set(parsed);
        }
    }

    private set(next: number): void {
        const min = this.min() ?? Number.NEGATIVE_INFINITY;
        const max = this.max() ?? Number.POSITIVE_INFINITY;
        const limited = Math.min(max, Math.max(min, next));
        // Round away float noise from repeated stepping (e.g. 22.5 + 2.5 + 2.5).
        this.value.set(Math.round(limited * 100) / 100);
    }
}
