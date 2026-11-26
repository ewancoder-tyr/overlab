import {
    Component,
    computed,
    inject,
    input,
    linkedSignal,
    model,
    output,
    signal,
} from '@angular/core';
import { Exercise } from '@catalog/domain/exercise';
import { DEFAULT_TECHNIQUE_ID, TechniqueId } from '@catalog/domain/technique';
import { Locale } from '@shared/application/locale.service';
import { LocalText, Localized } from '@shared/domain/language';
import { LocalizePipe, translations } from '@shared/presentation/i18n';
import { LogButtonComponent } from '@shared/presentation/log-button/log-button.component';
import { StepperComponent } from '@shared/presentation/stepper/stepper.component';
import { unitLabel } from '@training/domain/load-wording';
import { LoadUnit, RepGroup, SetDraft, SetPerformed } from '@training/domain/set';

const PARTIAL = 'long-length-partial' as TechniqueId;

/** Load step per tap, by unit: the smallest common plate or dumbbell increment. */
const LOAD_STEP: Record<LoadUnit, number> = { kg: 2.5, lb: 5 };

/** The efforts the chips offer. Reps in reserve has no chip: it is too rare for the quick path. */
type EffortChoice = 'failure' | 'light' | 'easy';

const TEXT = {
    en: {
        addedWeight: 'Added weight',
        weightPerSide: 'Weight per side',
        weight: 'Weight',
        reps: 'Reps',
        partialsAfter: 'Partials after',
        // The chip labels are kept to one short word: five chips share one row of a phone.
        addPartials: '+ Partials',
        addPartialsLabel: 'Add partial reps after the full ones',
        toFailure: 'Failure',
        toFailureLabel: 'Taken to failure',
        light: 'Light',
        easy: 'Easy',
        easyLabel: 'Easy: far from failure, counts for no muscle group',
        standalone: 'Solo',
        standaloneLabel: 'Standalone set: not part of a workout',
        bodyweightHint: '0 is body weight alone. Below 0 means assisted.',
        log: 'Log set',
    },
    ru: {
        addedWeight: 'Доп. вес',
        weightPerSide: 'Вес на руку',
        weight: 'Вес',
        reps: 'Повторы',
        partialsAfter: 'Частичные после',
        addPartials: '+ Част.',
        addPartialsLabel: 'Добавить частичные повторы после полных',
        toFailure: 'Отказ',
        toFailureLabel: 'До отказа',
        light: 'Легко',
        easy: 'Слегка',
        easyLabel: 'Без усилия: далеко от отказа, не идёт в объём мышц',
        standalone: 'Соло',
        standaloneLabel: 'Отдельный подход: не часть тренировки',
        bodyweightHint: '0 — только свой вес. Меньше 0 — с помощью.',
        log: 'Записать',
    },
} satisfies Localized<unknown>;

/**
 * The fast path for logging a set, designed for one tired thumb.
 *
 * It asks for two numbers, weight and reps, plus (behind a chip) partial reps done after the
 * full ones. Everything starts at what you did last, so repeating a set is a single tap on "Log set"
 * and beating it is two.
 *
 * The domain still stores an ordered list of rep groups; this form simply builds the common
 * shapes of that list (full reps, optionally followed by long-length partials at the same load).
 * Only these chips (partials, failure, light, easy, solo) are offered: anything more
 * would cost the quick path more screen height for sets that are rare.
 */
@Component({
    selector: 'olab-quick-set-form',
    imports: [LocalizePipe, LogButtonComponent, StepperComponent],
    templateUrl: './quick-set-form.component.html',
    styleUrl: './quick-set-form.component.scss',
})
export class QuickSetFormComponent {
    readonly exercise = input.required<Exercise>();
    /** The set whose values the form starts from. */
    readonly prefill = input<SetPerformed>();
    readonly error = input<LocalText>();
    readonly logged = output<SetDraft>();
    /**
     * Whether the next set is a standalone one (outside any workout). A `model`: two-way bound,
     * because the page owns it. It decides which history the whole screen compares against, not
     * only how this one set is stored.
     */
    readonly standalone = model(false);

    protected readonly t = translations(TEXT);
    private readonly language = inject(Locale).language;

    /** Reps of the prefill set done with `technique`, across all its rep groups. */
    private prefillReps(technique: TechniqueId): number {
        return (this.prefill()?.repGroups ?? [])
            .filter((group) => group.technique === technique)
            .reduce((sum, group) => sum + group.reps, 0);
    }

    // `linkedSignal`: editable, but reset from `prefill` whenever a new set is logged.
    protected readonly load = linkedSignal(() => this.prefill()?.repGroups[0]?.load.value ?? 0);
    protected readonly reps = linkedSignal(() => this.prefillReps(DEFAULT_TECHNIQUE_ID));
    protected readonly partials = linkedSignal(() => this.prefillReps(PARTIAL));
    protected readonly unit = computed<LoadUnit>(
        () => this.prefill()?.repGroups[0]?.load.unit ?? 'kg',
    );
    /**
     * Effort describes one specific set, so it is not carried over to the next, with one
     * exception: easy. Easy sets come in runs (every morning, a ramp-up over weeks), so when the
     * set to match was easy the chip starts on, and repeating it stays a single tap.
     */
    private readonly usualEffort = computed<EffortChoice | undefined>(() =>
        this.prefill()?.effort?.kind === 'easy' ? 'easy' : undefined,
    );
    /**
     * The effort chips. "To failure", "Light" and "Easy" are answers to one question (how hard
     * was it?), so turning one on turns the others off. `undefined` is the usual, close to
     * failure.
     */
    protected readonly effort = linkedSignal(() => this.usualEffort());
    /**
     * Partials are the exception, so their stepper is hidden behind a chip until asked for,
     * or until the set the form starts from already has some.
     */
    protected readonly partialsOpened = signal(false);
    protected readonly showPartials = computed(() => this.partialsOpened() || this.partials() > 0);

    protected readonly isBodyweight = computed(() => this.exercise().loadType === 'bodyweight');
    protected readonly loadStep = computed(() => LOAD_STEP[this.unit()]);
    protected readonly loadLabel = computed(() => {
        const t = this.t();
        if (this.isBodyweight()) {
            return t.addedWeight;
        }
        return this.exercise().perSide ? t.weightPerSide : t.weight;
    });
    /** The stored unit is `kg` or `lb`; the stepper shows it as the language writes it. */
    protected readonly unitText = computed(() => unitLabel(this.language(), this.unit()));

    /** Tapping the chip that is on turns it off; tapping the other one switches. */
    protected toggleEffort(choice: EffortChoice): void {
        this.effort.update((current) => (current === choice ? undefined : choice));
    }

    protected submit(): void {
        const exerciseId = this.exercise().id;
        const effort = this.effort();
        const load = { value: this.load(), unit: this.unit() };
        const group = (technique: TechniqueId, reps: number): RepGroup[] =>
            reps > 0 ? [{ exerciseId, technique, load, reps }] : [];

        this.logged.emit({
            kind: 'working',
            repGroups: [
                ...group(DEFAULT_TECHNIQUE_ID, this.reps()),
                ...group(PARTIAL, this.partials()),
            ],
            ...(effort === undefined ? {} : { effort: { kind: effort } }),
            ...(this.standalone() ? { standalone: true } : {}),
        });

        // Back to the usual, in case the prefill stays the same set and so resets nothing.
        this.effort.set(this.usualEffort());
        this.partialsOpened.set(false);
    }
}
