import { Component, computed, inject, input } from '@angular/core';
import { CatalogService } from '@catalog/application/catalog.service';
import { DEFAULT_TECHNIQUE_ID } from '@catalog/domain/technique';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';
import { SetPerformed, primaryExerciseId } from '@training/domain/set';
import { formatLoad } from '../set-format';

interface RepGroupView {
    readonly text: string;
    /** Technique abbreviation, absent for plain full-range reps to keep the common case quiet. */
    readonly technique: string | undefined;
    /** Set only when the group belongs to a different exercise than the set's primary one. */
    readonly otherExercise: string | undefined;
}

const TEXT = {
    en: {
        warmUp: 'Warm-up',
        failureShort: 'F',
        failure: 'Taken to failure',
        lightShort: 'L',
        light: 'Light on purpose',
        easyShort: 'E',
        easy: 'Easy: far from failure',
        rirShort: (reps: number) => `RIR ${reps}`,
        rir: (reps: number) => `${reps} reps in reserve`,
    },
    ru: {
        warmUp: 'Разминка',
        failureShort: 'О',
        failure: 'До отказа',
        lightShort: 'Л',
        light: 'Легко, намеренно',
        easyShort: 'Б',
        easy: 'Без усилия: далеко от отказа',
        rirShort: (reps: number) => `ПвЗ ${reps}`,
        rir: (reps: number) => `Повторов в запасе: ${reps}`,
    },
} satisfies Localized<unknown>;

/** Shows one set on a single line: its rep groups as chips plus effort and warm-up badges. */
@Component({
    selector: 'olab-set-summary',
    templateUrl: './set-summary.component.html',
    styleUrl: './set-summary.component.scss',
})
export class SetSummaryComponent {
    private readonly catalog = inject(CatalogService).catalog;
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    // `input.required` declares a mandatory component input as a signal.
    readonly set = input.required<SetPerformed>();

    protected readonly groups = computed<readonly RepGroupView[]>(() => {
        const set = this.set();
        const catalog = this.catalog();
        const primary = primaryExerciseId(set);
        const language = this.language();

        return set.repGroups.map((group) => {
            const exercise = catalog.findExercise(group.exerciseId);
            return {
                text: `${formatLoad(language, group.load, exercise)} × ${group.reps}`,
                technique:
                    group.technique === DEFAULT_TECHNIQUE_ID
                        ? undefined
                        : (catalog.findTechnique(group.technique)?.abbreviation[language] ??
                          group.technique),
                otherExercise:
                    group.exerciseId === primary
                        ? undefined
                        : (exercise?.name[language] ?? group.exerciseId),
            };
        });
    });

    protected readonly effort = computed(() => {
        const effort = this.set().effort;
        const t = this.t();
        if (effort === undefined) {
            return undefined;
        }
        switch (effort.kind) {
            case 'failure':
                return { short: t.failureShort, label: t.failure };
            case 'light':
                return { short: t.lightShort, label: t.light };
            case 'easy':
                return { short: t.easyShort, label: t.easy };
            case 'reps-in-reserve':
                return {
                    short: t.rirShort(effort.repsInReserve),
                    label: t.rir(effort.repsInReserve),
                };
        }
    });
}
