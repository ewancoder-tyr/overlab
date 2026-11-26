import { AnimationCallbackEvent, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { MuscleStall, VolumeAdvice, topStall } from '@analytics/domain/muscle-stall';
import { VolumeStatus } from '@analytics/domain/weekly-volume';
import { CatalogService } from '@catalog/application/catalog.service';
import { ExerciseId } from '@catalog/domain/exercise';
import { MuscleGroupId } from '@catalog/domain/muscle-group';
import { Locale } from '@shared/application/locale.service';
import { Language, Localized, formatNumber, lastDays, plural } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';

interface Text {
    readonly status: Readonly<Record<VolumeStatus, string>>;
    /** The sentence a screen reader reads for one gauge. */
    readonly label: (
        name: string,
        sets: number,
        status: string,
        min: number,
        max: number,
    ) => string;
    /** Appended to that sentence for a stalled muscle group. */
    readonly stalledCount: (count: number) => string;
    readonly onTarget: (total: number) => string;
    readonly explanation: (min: number, max: number, days: number) => string;
    /** The advice line: `exercise` is a name, or a name and how many more are stalled. */
    readonly advice: Readonly<
        Record<VolumeAdvice, (muscle: string, sets: number, exercise: string) => string>
    >;
    readonly andMore: (name: string, more: number) => string;
    readonly stalled: string;
    readonly nothing: (days: number) => string;
    readonly couldAdd: string;
    readonly statisticsFor: (name: string) => string;
}

const TEXT: Localized<Text> = {
    en: {
        status: { under: 'under target', within: 'on target', over: 'over target' },
        label: (name, sets, status, min, max) =>
            `${name}: ${formatNumber('en', sets)} sets, ${status} (${min} to ${max})`,
        stalledCount: (count) => `, ${count} ${count === 1 ? 'exercise' : 'exercises'} stalled`,
        onTarget: (total) => `of ${total} muscle groups on target`,
        explanation: (min, max, days) =>
            `Working sets in the last ${days} ${plural('en', days, { one: 'day', other: 'days' })}, weighted by how much each exercise involves the muscle. The lighter band is the ${min} to ${max} set target. An orange dot means an exercise that trains it is stalled; tap a muscle group to see what it got.`,
        advice: {
            'add-sets': (muscle, sets, exercise) =>
                `${muscle}: ${formatNumber('en', sets)} sets, ${exercise} stalled. Add sets.`,
            'room-to-add': (muscle, sets, exercise) =>
                `${muscle}: ${formatNumber('en', sets)} sets, ${exercise} stalled. Room to add sets.`,
            'back-off': (muscle, sets, exercise) =>
                `${muscle}: ${formatNumber('en', sets)} sets, ${exercise} stalled. Back off.`,
            exercise: (muscle, _sets, exercise) => `${muscle}: ${exercise} stalled.`,
        },
        andMore: (name, more) => `${name} and ${more} more`,
        stalled: 'Stalled',
        nothing: (days) =>
            `Nothing in the last ${days} ${plural('en', days, { one: 'day', other: 'days' })}.`,
        couldAdd: 'Could add:',
        statisticsFor: (name) => `Statistics for ${name}`,
    },
    ru: {
        status: { under: 'ниже цели', within: 'в цели', over: 'выше цели' },
        label: (name, sets, status, min, max) =>
            `${name}: ${formatNumber('ru', sets)} ${russianSets(sets)}, ${status} (от ${min} до ${max})`,
        stalledCount: (count) =>
            `, в застое ${count} ${plural('ru', count, {
                one: 'упражнение',
                few: 'упражнения',
                many: 'упражнений',
                other: 'упражнения',
            })}`,
        onTarget: (total) => `из ${total} групп мышц в цели`,
        explanation: (min, max, days) =>
            `Рабочие подходы ${lastDays('ru', days).toLowerCase()}, взвешенные по тому, насколько упражнение нагружает мышцу. Светлая полоса — цель от ${min} до ${max} подходов. Оранжевая точка — застой в упражнении, которое её нагружает; нажмите на группу мышц, чтобы увидеть, что она получила.`,
        // The exercise stays in the nominative after a colon, so no name needs declining.
        advice: {
            'add-sets': (muscle, sets, exercise) =>
                `${muscle}: ${formatNumber('ru', sets)} ${russianSets(sets)}, застой: ${exercise}. Добавьте подходов.`,
            'room-to-add': (muscle, sets, exercise) =>
                `${muscle}: ${formatNumber('ru', sets)} ${russianSets(sets)}, застой: ${exercise}. Есть куда добавить подходов.`,
            'back-off': (muscle, sets, exercise) =>
                `${muscle}: ${formatNumber('ru', sets)} ${russianSets(sets)}, застой: ${exercise}. Сбавьте объём.`,
            exercise: (muscle, _sets, exercise) => `${muscle}: застой: ${exercise}.`,
        },
        andMore: (name, more) => `${name} и ещё ${more}`,
        stalled: 'Застой',
        nothing: (days) => `${lastDays('ru', days)} ничего.`,
        couldAdd: 'Можно добавить:',
        statisticsFor: (name) => `Статистика: ${name}`,
    },
};

function russianSets(count: number): string {
    return plural('ru', count, {
        one: 'подход',
        few: 'подхода',
        many: 'подходов',
        other: 'подхода',
    });
}

/** One decimal is plenty for a weekly total. */
function oneDecimal(sets: number): number {
    return Math.round(sets * 10) / 10;
}

/**
 * The app's core view: how much work each muscle group received in the last 7 days.
 *
 * Each muscle group is one line with a gauge shaped like a test tube: the fill is the work done,
 * the lighter band marks the target range. The gauge turns green once the target is reached.
 *
 * A muscle group with a stalled exercise that trains it directly gets an orange dot, and the most
 * pressing of them a line of advice under the summary. Each line opens (one at a time) to show
 * which exercises fed the muscle group this week.
 */
@Component({
    selector: 'olab-weekly-volume',
    imports: [RouterLink],
    templateUrl: './weekly-volume.component.html',
    styleUrl: './weekly-volume.component.scss',
})
export class WeeklyVolumeComponent {
    private readonly analytics = inject(AnalyticsService);
    private readonly catalog = inject(CatalogService).catalog;
    protected readonly t = translations(TEXT);
    private readonly language = inject(Locale).language;
    /** The target window, which the texts name ("in the last 14 days"). */
    protected readonly windowDays = this.analytics.windowDays;

    /** The muscle group whose breakdown is open. In memory only: a view state, not data. */
    protected readonly open = signal<MuscleGroupId | undefined>(undefined);

    protected toggle(id: MuscleGroupId): void {
        this.open.update((current) => (current === id ? undefined : id));
    }

    /** A breakdown appears: it grows from nothing to its own height. */
    protected slideOpen(event: AnimationCallbackEvent): void {
        slide(event, 'open');
    }

    /**
     * A breakdown goes. When that is because another muscle group was opened, it goes at once:
     * one list closing while another opens moves the whole page twice, and the row just tapped
     * would slide away under the finger.
     */
    protected slideShut(event: AnimationCallbackEvent): void {
        if (this.open() === undefined) {
            slide(event, 'shut');
        } else {
            event.animationComplete();
        }
    }

    private readonly stalls = computed(
        () => new Map(this.analytics.muscleStalls().map((s) => [s.volume.muscleGroup.id, s])),
    );

    protected readonly rows = computed(() => {
        const volumes = this.analytics.weeklyVolume();
        const stalls = this.stalls();
        const language = this.language();
        const t = this.t();
        // One scale for all gauges so they can be compared with each other. It leaves room
        // beyond the highest target and grows if a muscle group goes past it.
        const scale = Math.max(
            ...volumes.map((volume) => Math.max(volume.sets, volume.target.maxSets * 1.15)),
        );

        return volumes.map((volume) => {
            const id = volume.muscleGroup.id;
            const sets = oneDecimal(volume.sets);
            const stall = stalls.get(id);
            const stalledIds = new Set(stall?.stalled.map((entry) => entry.exerciseId));
            return {
                id,
                name: volume.muscleGroup.name[language],
                sets: formatNumber(language, sets),
                status: volume.status,
                stalled: stall !== undefined,
                fillPercent: (volume.sets / scale) * 100,
                targetStartPercent: (volume.target.minSets / scale) * 100,
                targetWidthPercent: ((volume.target.maxSets - volume.target.minSets) / scale) * 100,
                label:
                    t.label(
                        volume.muscleGroup.name[language],
                        sets,
                        t.status[volume.status],
                        volume.target.minSets,
                        volume.target.maxSets,
                    ) + (stall === undefined ? '' : t.stalledCount(stall.stalled.length)),
                advice: stall === undefined ? undefined : this.adviceLine(stall, language),
                breakdown: volume.byExercise.map((entry) => ({
                    id: entry.exerciseId,
                    name: this.nameOf(entry.exerciseId, language),
                    sets: formatNumber(language, oneDecimal(entry.sets)),
                    stalled: stalledIds.has(entry.exerciseId),
                })),
                // Only where the advice is to add work: elsewhere more exercises are not the fix.
                couldAdd:
                    stall?.advice === 'add-sets' || stall?.advice === 'room-to-add'
                        ? this.analytics.couldAddTo(id).map((exerciseId) => ({
                              id: exerciseId,
                              name: this.nameOf(exerciseId, language),
                          }))
                        : [],
            };
        });
    });

    /** The one line under the summary, for the most pressing stalled muscle group. */
    protected readonly advice = computed(() => {
        const stall = topStall(this.analytics.muscleStalls());
        return stall === undefined ? undefined : this.adviceLine(stall, this.language());
    });

    /** One target for every muscle group, so the first one's is everyone's. */
    protected readonly explanation = computed(() => {
        const target = this.analytics.weeklyVolume()[0]?.target;
        return target === undefined
            ? ''
            : this.t().explanation(target.minSets, target.maxSets, this.windowDays());
    });

    protected readonly onTarget = computed(
        () => this.rows().filter((row) => row.status === 'within').length,
    );

    /**
     * The advice in words. It names the stalled exercise with the most sets this week (they are
     * sorted that way), and says how many more there are.
     */
    private adviceLine(stall: MuscleStall, language: Language): string {
        const t = this.t();
        const [first] = stall.stalled;
        const name = first === undefined ? '' : this.nameOf(first.exerciseId, language);
        const more = stall.stalled.length - 1;
        return t.advice[stall.advice](
            stall.volume.muscleGroup.name[language],
            oneDecimal(stall.volume.sets),
            more > 0 ? t.andMore(name, more) : name,
        );
    }

    private nameOf(id: ExerciseId, language: Language): string {
        return this.catalog().findExercise(id)?.name[language] ?? id;
    }
}

/**
 * Slides a breakdown open or shut with the Web Animations API (`element.animate`) rather than a
 * CSS animation, because the height to slide to is only known once the element is in the page:
 * CSS cannot animate to `height: auto`, and the earlier grid-row trick stuttered on a phone. The
 * contents fade only in the first part of opening and the last part of shutting, so they never
 * hang half-transparent. `animationComplete` tells Angular it may now remove a leaving element.
 */
function slide(event: AnimationCallbackEvent, direction: 'open' | 'shut'): void {
    const element = event.target as HTMLElement;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        event.animationComplete();
        return;
    }
    // The padding slides too: `height: 0` cannot squeeze padding, so the box would otherwise
    // stop a few pixels short and then jump to nothing when it is removed.
    const height = `${String(element.scrollHeight)}px`;
    const { paddingBottom } = getComputedStyle(element);
    const closed = { height: '0px', paddingBottom: '0px', opacity: 0 };
    const opened = { height, paddingBottom, opacity: 1 };
    const keyframes =
        direction === 'open'
            ? [closed, { opacity: 1, offset: 0.6 }, opened]
            : [opened, { opacity: 0, offset: 0.5 }, closed];
    element.style.overflow = 'hidden';
    const animation = element.animate(keyframes, {
        duration: direction === 'open' ? 200 : 150,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
    const done = (): void => {
        element.style.overflow = '';
        event.animationComplete();
    };
    animation.finished.then(done, done);
}
