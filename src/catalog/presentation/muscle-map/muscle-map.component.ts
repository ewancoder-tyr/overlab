import { PercentPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { MUSCLE_GROUPS, MuscleInvolvement } from '@catalog/domain/muscle-group';
import { Locale } from '@shared/application/locale.service';
import { LocalText } from '@shared/domain/language';
import { BODY_SHAPES } from './body-shapes';

const MUSCLE_NAMES = new Map<string, LocalText>(
    MUSCLE_GROUPS.map((group) => [group.id, group.name]),
);

const INVOLVED: LocalText = { en: 'Muscles involved: ', ru: 'Задействованные мышцы: ' };

/** The faintest an involved muscle is drawn, so that even a 10% involvement stays visible. */
const MIN_OPACITY = 0.3;

/**
 * Infographic of which muscles an exercise trains: a front and back body map shaded by
 * involvement, next to a legend with the exact percentages.
 */
@Component({
    selector: 'olab-muscle-map',
    imports: [PercentPipe],
    templateUrl: './muscle-map.component.html',
    styleUrl: './muscle-map.component.scss',
})
export class MuscleMapComponent {
    readonly involvements = input.required<readonly MuscleInvolvement[]>();
    protected readonly language = inject(Locale).language;

    protected readonly legend = computed(() =>
        this.involvements().map((involvement) => ({
            name:
                MUSCLE_NAMES.get(involvement.muscleGroupId)?.[this.language()] ??
                involvement.muscleGroupId,
            ratio: involvement.ratio,
            opacity: opacityFor(involvement.ratio),
        })),
    );

    protected readonly shapes = computed(() => {
        const ratios = new Map(
            this.involvements().map((involvement) => [
                involvement.muscleGroupId,
                involvement.ratio,
            ]),
        );
        return BODY_SHAPES.map((shape) => {
            const ratio =
                shape.muscleGroupId === undefined ? undefined : ratios.get(shape.muscleGroupId);
            return {
                path: shape.path,
                active: ratio !== undefined,
                opacity: ratio === undefined ? 1 : opacityFor(ratio),
            };
        });
    });

    /** Text alternative for the drawing, e.g. "Muscles involved: Chest 100%, Triceps 50%". */
    protected readonly description = computed(
        () =>
            INVOLVED[this.language()] +
            this.legend()
                .map((entry) => `${entry.name} ${Math.round(entry.ratio * 100)}%`)
                .join(', '),
    );
}

function opacityFor(ratio: number): number {
    return MIN_OPACITY + (1 - MIN_OPACITY) * ratio;
}
