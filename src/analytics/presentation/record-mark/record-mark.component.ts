import { RecordKind } from '@analytics/domain/records';
import { Component, input } from '@angular/core';

/**
 * The personal record mark: a flexed arm on a coloured disc. A star already means a favorite,
 * so a record gets its own symbol, the same for lifting and cardio.
 *
 * The colour says which record: purple for the weight record (the first set at the heaviest
 * load), as a fastest lap is purple in motor racing, the top achievement; green for the rep
 * record (the most reps at that load), green being "better". A set holding both is purple: the
 * weight comes first.
 *
 * A filled silhouette rather than line art, so it still reads at 24 px: a round biceps, a fist
 * with knuckles, and two cuts in the disc's colour for the underside of the biceps and the
 * fingers. Drawn here rather than the 💪 emoji, which looks different on every phone and cannot
 * be coloured. Decorative: whoever places it says "record" in words (an aria-label or a visible
 * label). The parent positions and sizes it.
 */
@Component({
    selector: 'olab-record-mark',
    template: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                class="arm"
                d="M3 15C4.1 14.8 4.2 12.4 5.6 10.9 7.4 8.9 10.5 9.2 11.7 11.1 12.2 11.8 12.3 12.5 12.5 13.1 13.7 12.6 14.4 10.7 14.5 8.1 14.5 7.4 13.2 7.1 13.1 6.1 12.9 5.4 13.4 4.9 13.9 4.8 13.8 3.9 14.5 3.3 15.3 3.4 15.9 2.9 16.8 3.1 17.2 3.6 18.2 3.4 19 4.2 18.9 5.2 19.1 6.3 18.4 7.1 18.2 8 18.1 10.3 20.1 13.9 20.3 16.1 20.7 18.8 18.8 20.4 16.1 20.5 12.2 20.8 7.3 19.9 3 18 2.7 17.2 2.7 15.8 3 15Z"
            />
            <path
                class="cut"
                d="M7 16.2C9.2 16.8 12 15.5 13.3 13.8M14.4 6.2C15.2 6.8 16.1 6.8 16.9 6.5"
            />
        </svg>
    `,
    styleUrl: './record-mark.component.scss',
    host: {
        '[class.record-mark--reps]': 'kind() === "reps"',
    },
})
export class RecordMarkComponent {
    readonly kind = input.required<RecordKind>();
}
