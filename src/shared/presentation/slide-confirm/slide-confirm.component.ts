import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

/** How far along the track the thumb must be let go (0 to 1) for the slide to count. */
const CONFIRM_AT = 0.92;
/** One arrow-key press moves the thumb this far: four presses to confirm. */
const KEY_STEP = 0.25;

/**
 * "Slide to confirm": a red track whose thumb has to be dragged from one end to the other.
 * For actions that cannot be taken back by accident-prone means (deleting from history): a tap
 * can land anywhere by mistake, a full slide cannot.
 *
 *     [ >>>  Slide to delete ............ ]
 *
 * Letting go before the end puts the thumb back and does nothing. With a keyboard the thumb is a
 * slider: the right arrow moves it a quarter at a time and the fourth press confirms.
 */
@Component({
    selector: 'olab-slide-confirm',
    templateUrl: './slide-confirm.component.html',
    styleUrl: './slide-confirm.component.scss',
    // The History page turns its day on a sideways swipe; one that starts here is a slide.
    host: { '(touchstart)': '$event.stopPropagation()' },
})
export class SlideConfirmComponent {
    /** What sliding does, shown on the track and read out: "Slide to delete". */
    readonly label = input.required<string>();
    readonly confirmed = output();

    /** `viewChild` finds the element marked `#track` in the template, once it is rendered. */
    private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

    /** Where the thumb is, from 0 (start) to 1 (end). */
    protected readonly progress = signal(0);
    /** True under the finger: the thumb then follows at once, without easing. */
    protected readonly dragging = signal(false);

    /** Where the drag began, and how many pixels the thumb can travel. */
    private from: { readonly x: number; readonly travel: number } | undefined;

    protected down(event: PointerEvent, thumb: HTMLElement): void {
        // Capturing sends every later move to the thumb, even when the finger leaves it.
        thumb.setPointerCapture(event.pointerId);
        this.from = {
            x: event.clientX,
            travel: Math.max(1, this.track().nativeElement.clientWidth - thumb.offsetWidth),
        };
        this.dragging.set(true);
    }

    protected move(event: PointerEvent): void {
        if (this.from !== undefined) {
            const along = (event.clientX - this.from.x) / this.from.travel;
            this.progress.set(Math.min(1, Math.max(0, along)));
        }
    }

    protected up(): void {
        if (this.from === undefined) {
            return;
        }
        this.from = undefined;
        this.dragging.set(false);
        this.finish();
    }

    protected key(event: KeyboardEvent): void {
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.progress.update((progress) => Math.min(1, progress + KEY_STEP));
            if (this.progress() >= 1) {
                this.finish();
            }
        } else if (event.key === 'ArrowLeft' || event.key === 'Escape') {
            this.progress.set(0);
        }
    }

    /** Confirms when the thumb reached the end; either way it goes back to the start. */
    private finish(): void {
        const done = this.progress() >= CONFIRM_AT;
        this.progress.set(0);
        if (done) {
            this.confirmed.emit();
        }
    }
}
