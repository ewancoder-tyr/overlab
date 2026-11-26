import { Component, computed, inject, input, signal } from '@angular/core';
import { Exercise } from '@catalog/domain/exercise';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';

const POSITIONS: Localized<readonly [string, string]> = {
    en: ['first position', 'second position'],
    ru: ['первое положение', 'второе положение'],
};

/**
 * Line drawings of an exercise: its two end positions side by side, or only the second one as a
 * small thumbnail for lists.
 *
 * The drawings are static files, `public/exercise-drawings/<exercise id>-1.svg` and `-2.svg`, found by
 * naming convention rather than listed in the catalog. An exercise without drawings (a future
 * user-defined one) simply renders nothing: see `missing` below.
 */
@Component({
    selector: 'olab-exercise-figure',
    templateUrl: './exercise-figure.component.html',
    styleUrl: './exercise-figure.component.scss',
    // Lets the stylesheet size the two variants differently with `:host(.thumbnail)`.
    host: { '[class.thumbnail]': 'thumbnail()', '[class.done]': 'done()' },
})
export class ExerciseFigureComponent {
    readonly exercise = input.required<Exercise>();
    /** Show one small drawing instead of both positions. */
    readonly thumbnail = input(false);
    /** Draw the thumbnail in green: the exercise has been done today. */
    readonly done = input(false);

    /**
     * Set when the browser fails to load a drawing. There is no list of illustrated exercises to
     * consult, so a failed load is how the component learns that there is nothing to show.
     */
    protected readonly missing = signal(false);

    private readonly language = inject(Locale).language;

    protected readonly frames = computed(() => {
        const { id } = this.exercise();
        const language = this.language();
        const name = this.exercise().name[language];
        const [first, second] = POSITIONS[language];
        const both = [
            { src: `exercise-drawings/${id}-1.svg`, alt: `${name}, ${first}` },
            { src: `exercise-drawings/${id}-2.svg`, alt: `${name}, ${second}` },
        ];
        // In a list the exercise name is right next to the drawing, so the thumbnail is
        // decorative: an empty alt keeps screen readers from announcing the name twice.
        return this.thumbnail() ? [{ src: `exercise-drawings/${id}-2.svg`, alt: '' }] : both;
    });
}
