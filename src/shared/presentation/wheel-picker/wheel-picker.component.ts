import {
    Component,
    ElementRef,
    afterRenderEffect,
    computed,
    input,
    model,
    viewChild,
} from '@angular/core';

/**
 * A wheel of numbers, like the one alarm clocks use: flick it up or down and it settles on a
 * value, the one in the middle. For picking one of many evenly spaced values (an incline in
 * steps of 0.5) where a stepper would take dozens of taps.
 *
 *       5.5
 *     [ 6   ]    <- the value
 *       6.5
 *
 * There is no gesture code here. The wheel is an ordinary scrolling list with CSS scroll
 * snapping (see the styles), so the browser provides the momentum and the settling; this class
 * only reads where the list stopped. With a keyboard it is a slider: the arrow keys step.
 *
 * `value` is a `model()`: a two-way bindable signal, used by the parent as `[(value)]="incline"`.
 */
@Component({
    selector: 'olab-wheel-picker',
    templateUrl: './wheel-picker.component.html',
    styleUrl: './wheel-picker.component.scss',
})
export class WheelPickerComponent {
    /** Every value the wheel offers, in order. */
    readonly values = input.required<readonly number[]>();
    readonly value = model.required<number>();
    /** What is being picked, for screen readers: "Incline". */
    readonly label = input.required<string>();
    /** How a value is written on the wheel. */
    readonly format = input<(value: number) => string>(String);

    private readonly wheel = viewChild.required<ElementRef<HTMLElement>>('wheel');

    protected readonly items = computed(() => {
        const format = this.format();
        return this.values().map((value) => ({ value, text: format(value) }));
    });
    protected readonly index = computed(() => this.values().indexOf(this.value()));
    protected readonly valueText = computed(() => this.format()(this.value()));

    constructor() {
        /*
         * Keeps the list scrolled to the value whenever the value is set from outside (at the
         * start, or by the arrow keys). `afterRenderEffect` runs after Angular has drawn the
         * list, which is the earliest the scroll position can be set, and again whenever a
         * signal it read changes.
         *
         * While the user scrolls, the value follows the list, so the list is already within
         * half a row of the right place and is left alone: moving it then would fight the
         * finger.
         */
        afterRenderEffect(() => {
            const index = this.index();
            const element = this.wheel().nativeElement;
            const row = this.rowHeight(element);
            if (index >= 0 && row > 0 && Math.abs(element.scrollTop - index * row) > row / 2) {
                element.scrollTop = index * row;
            }
        });
    }

    /** The list moved: the row now in the middle is the value. */
    protected scrolled(): void {
        const element = this.wheel().nativeElement;
        const row = this.rowHeight(element);
        const value = row > 0 ? this.values()[Math.round(element.scrollTop / row)] : undefined;
        if (value !== undefined && value !== this.value()) {
            this.value.set(value);
        }
    }

    protected key(event: KeyboardEvent): void {
        const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        const next = this.values()[this.index() + step];
        if (step !== 0 && next !== undefined) {
            event.preventDefault();
            this.value.set(next);
        }
    }

    /** Rows all have one height, set in the styles; measured here so the two cannot drift apart. */
    private rowHeight(element: HTMLElement): number {
        return element.querySelector<HTMLElement>('.wheel__row')?.offsetHeight ?? 0;
    }
}
