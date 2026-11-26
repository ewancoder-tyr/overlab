import {
    Component,
    DestroyRef,
    computed,
    effect,
    inject,
    input,
    linkedSignal,
    signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { RecordKind, topSet } from '@analytics/domain/records';
import { SessionCompareComponent } from '@analytics/presentation/session-compare/session-compare.component';
import { CatalogService } from '@catalog/application/catalog.service';
import { includesLifting } from '@shared/domain/training-focus';
import { ExerciseId, isCardio } from '@catalog/domain/exercise';
import { RemindersService } from '@settings/application/reminders.service';
import { SettingsService } from '@settings/application/settings.service';
import { SoloReminderEditorComponent } from '@settings/presentation/solo-reminder-editor/solo-reminder-editor.component';
import { Locale } from '@shared/application/locale.service';
import { LocalText, Localized } from '@shared/domain/language';
import { Clock } from '@shared/application/clock.service';
import { LocalDatePipe, LocalizePipe, translations } from '@shared/presentation/i18n';
import { RestAlert } from '@training/application/rest-alert.service';
import { TrainingService } from '@training/application/training.service';
import {
    Load,
    SetDraft,
    SetId,
    SetPerformed,
    isStandalone,
    primaryExerciseId,
} from '@training/domain/set';
import { QuickSetFormComponent } from '@training/presentation/quick-set-form/quick-set-form.component';
import { RestClockComponent } from '@training/presentation/rest-clock/rest-clock.component';
import { WorkoutTimeComponent } from '@training/presentation/workout-time/workout-time.component';
import { formatLoad } from '@training/presentation/set-format';
import { SetSummaryComponent } from '@training/presentation/set-summary/set-summary.component';
import { CardioLogComponent } from './cardio-log.component';

const TEXT = {
    en: {
        back: 'Back to exercises',
        inThePast: 'Logging in the past:',
        stats: 'Statistics, muscles and form',
        lastAndToday: 'Last session and today',
        techniqueColours: 'Technique colours',
        confirm: 'Confirm',
        void: 'Void',
        logSet: 'Log a set',
        unknown: 'Unknown exercise',
        choose: 'Choose an exercise',
        soloReminder: 'Solo reminder',
        remindersOff: 'Notifications are off on this device, so nothing will ring here yet.',
        openSettings: 'Turn them on in Settings',
        done: 'Done',
        records: {
            weight: 'Weight record',
            reps: 'Rep record',
            both: 'Weight and rep record',
        } satisfies Record<RecordKind, string>,
        announce: (kind: string, load: string, reps: number) => `${kind}: ${reps} × ${load}`,
    },
    ru: {
        inThePast: 'Запись в прошлом:',
        back: 'Назад к упражнениям',
        stats: 'Статистика, мышцы и техника',
        lastAndToday: 'Прошлый раз и сегодня',
        techniqueColours: 'Цвета техник',
        confirm: 'Точно?',
        void: 'Отменить',
        logSet: 'Записать подход',
        unknown: 'Неизвестное упражнение',
        choose: 'Выбрать упражнение',
        soloReminder: 'Соло-напоминание',
        remindersOff:
            'Уведомления на этом устройстве выключены, так что здесь пока ничего не прозвонит.',
        openSettings: 'Включить в Настройках',
        done: 'Готово',
        records: {
            weight: 'Рекорд веса',
            reps: 'Рекорд повторов',
            both: 'Рекорд веса и повторов',
        },
        announce: (kind: string, load: string, reps: number) => `${kind}: ${load} × ${reps}`,
    },
} satisfies Localized<unknown>;

/**
 * The logging screen for one exercise. It fills the whole screen and has three fixed zones:
 * a slim title bar, the comparison of last session with today's, and the entry panel.
 *
 * Nothing scrolls vertically and nothing moves when a set is logged: the new set takes the place
 * of the dashed "set to match" outline, right under the set it is compared with.
 */
@Component({
    selector: 'olab-exercise-log',
    imports: [
        CardioLogComponent,
        LocalDatePipe,
        LocalizePipe,
        QuickSetFormComponent,
        RouterLink,
        SessionCompareComponent,
        SoloReminderEditorComponent,
        RestClockComponent,
        WorkoutTimeComponent,
        SetSummaryComponent,
    ],
    templateUrl: './exercise-log.component.html',
    styleUrl: './exercise-log.component.scss',
})
export class ExerciseLogComponent {
    private readonly training = inject(TrainingService);
    private readonly analytics = inject(AnalyticsService);
    private readonly catalogService = inject(CatalogService);
    private readonly catalog = this.catalogService.catalog;
    private readonly language = inject(Locale).language;
    private readonly settings = inject(SettingsService);
    private readonly reminders = inject(RemindersService);
    private readonly clock = inject(Clock);

    /**
     * True while the user logs something done earlier (History, "Log on this day"). This screen
     * covers the shell's notice, and it is the very place where the date matters, so it says so
     * itself under the title bar.
     */
    protected readonly inThePast = this.clock.inThePast;
    protected readonly now = this.clock.now;

    /** Bound from the `:exerciseId` route parameter (see `withComponentInputBinding`). */
    readonly exerciseId = input.required<ExerciseId>();
    /**
     * Bound from the `?solo=1` query parameter, which the standalone list on the Train page
     * adds to its links: open on standalone sets, whatever the latest set of the exercise was.
     */
    readonly solo = input<string>();

    protected readonly t = translations(TEXT);

    constructor() {
        // Tells the rest alert which exercise is open: on the current exercise's own screen the
        // shorter alert between sets applies, anywhere else the one between exercises. An effect,
        // because the router reuses this component when going from one exercise to another.
        const restAlert = inject(RestAlert);
        effect(() => {
            restAlert.setViewing(this.exerciseId());
        });
        inject(DestroyRef).onDestroy(() => {
            restAlert.setViewing(undefined);
        });
    }

    protected readonly error = signal<LocalText | undefined>(undefined);
    /** The set tapped in the grid, whose details and "Void" button are shown. */
    protected readonly selectedId = signal<SetId | undefined>(undefined);
    /** True after the first tap on "Void"; the second tap confirms. */
    protected readonly voidArmed = signal(false);
    /**
     * Said once by screen readers when a logged set is a record (a polite live region). The
     * screen itself shows the biceps; there is no pop-up, confetti or sound.
     */
    protected readonly announcement = signal('');

    /** Rest is a lifting matter: a cardio-only focus hides it (see "Training Focus"). */
    protected readonly showsRest = computed(() => includesLifting(this.catalogService.focus()));
    /**
     * Whether this exercise has a solo reminder (see "Solo Reminder" in docs/glossary.md): the bell
     * in the title bar is then lit. The bell shows only while solo sets are being logged.
     */
    protected readonly hasSoloReminder = computed(() =>
        this.settings.soloReminders().some((other) => other.exerciseId === this.exerciseId()),
    );
    /** Reminders are switched on per device; a reminder set here rings only where they are on. */
    protected readonly remindersOn = computed(() => this.reminders.state() === 'on');

    protected readonly exercise = computed(() => this.catalog().findExercise(this.exerciseId()));
    /** A cardio exercise gets the cardio zones (`CardioLogComponent`) instead of the set ones. */
    protected readonly cardio = computed(() => {
        const exercise = this.exercise();
        return exercise !== undefined && isCardio(exercise);
    });

    /**
     * The exercise whose backdrop drawing failed to load. Drawings are found by file name, not
     * listed in the catalog, so a failed load is how we learn there is none. Remembering the id
     * (rather than a plain flag) means the answer cannot leak to another exercise if the router
     * reuses this component.
     */
    private readonly backdropFailedFor = signal<ExerciseId | undefined>(undefined);
    protected readonly backdropMissing = computed(
        () => this.backdropFailedFor() === this.exerciseId(),
    );

    protected backdropFailed(): void {
        this.backdropFailedFor.set(this.exerciseId());
    }

    /**
     * What the "Solo" chip starts as: on when the latest set of this exercise was a
     * standalone one. Derived from the log, so morning push-ups stay one tap without anything
     * to store. A string rather than a boolean, so that going to another exercise (the router
     * reuses this component) counts as a change even when the answer is the same.
     */
    private readonly usualLane = computed(() => {
        const latest = this.latestSet();
        const asked = this.solo() !== undefined;
        const lane =
            asked || (latest !== undefined && isStandalone(latest)) ? 'standalone' : 'workout';
        return `${this.exerciseId()}|${lane}`;
    });

    /** The latest set of this exercise, in a workout or standalone. */
    private readonly latestSet = computed(() => {
        const id = this.exerciseId();
        return this.training.sets().findLast((set) => primaryExerciseId(set) === id);
    });

    /**
     * Whether standalone sets are being logged: sets outside any workout (see "Standalone Set"
     * in docs/glossary.md). The whole screen follows it, because standalone sessions are a history
     * of their own: last time and today are then the standalone ones.
     *
     * `linkedSignal`: the chip sets it, and it goes back to the usual whenever that changes.
     */
    protected readonly standalone = linkedSignal(() => this.usualLane().endsWith('|standalone'));

    private readonly sessions = computed(() =>
        this.standalone()
            ? this.training.standaloneSessionsOf(this.exerciseId())
            : this.training.sessionsOf(this.exerciseId()),
    );

    /** Progression of every set in this exercise's history, for colouring the grids. */
    protected readonly tones = computed(() => this.analytics.progressionOf(this.sessions()));

    /** Every personal record in this exercise's history; today's get a biceps. */
    protected readonly records = computed(() => this.analytics.recordsOf(this.sessions()));

    /**
     * This exercise's session in progress, if any: the one inside the workout in progress, or
     * for standalone sets the latest standalone session while another set would still join it.
     */
    protected readonly currentSession = computed(() => {
        const sessions = this.sessions();
        const latest = sessions.at(-1);
        const since = this.standalone()
            ? this.training.standaloneInProgressSince(sessions)
            : this.training.currentWorkout()?.startedAt;
        return latest !== undefined && latest.workoutStartedAt === since ? latest : undefined;
    });

    /** The sessions before the current one, oldest first. */
    private readonly earlier = computed(() => {
        const sessions = this.sessions();
        return this.currentSession() === undefined ? sessions : sessions.slice(0, -1);
    });

    /** Today against last time: the sets on both sides, who is ahead, and the set to match. */
    protected readonly pace = computed(() =>
        this.analytics.paceOf(this.currentSession(), this.earlier()),
    );

    protected readonly warmUps = computed(() =>
        (this.currentSession()?.sets ?? []).filter((set) => set.kind === 'warmup'),
    );

    /**
     * The techniques that appear in the sets on screen, in catalog order, for the colour legend.
     * Empty when only full-range reps are shown: a single colour needs no explanation.
     */
    protected readonly legend = computed(() => {
        const { previous, current } = this.pace();
        const used = new Set(
            [...previous, ...current, ...this.warmUps()].flatMap((set) =>
                set.repGroups.map((group) => group.technique),
            ),
        );
        return used.size <= 1
            ? []
            : this.catalog().techniques.filter((technique) => used.has(technique.id));
    });

    protected readonly selectedSet = computed(() => {
        const id = this.selectedId();
        return id === undefined
            ? undefined
            : this.currentSession()?.sets.find((set) => set.id === id);
    });

    /** "Weight record" or "Rep record" for the selected set, when it is one. */
    protected readonly selectedRecord = computed(() => {
        const set = this.selectedSet();
        const kind = set === undefined ? undefined : this.records().get(set.id);
        return kind === undefined ? undefined : this.t().records[kind];
    });

    /**
     * What the entry panel starts from. Normally that is the set of last time that the next set
     * lines up with (the dashed outline), so matching it is one tap on "Log set" and beating it
     * is two. But once today's load differs from that set's (you went heavier, say), repeating
     * the set just logged is the better guess.
     */
    protected readonly prefill = computed(() => {
        const justLogged = this.currentSession()?.sets.at(-1);
        const toMatch = this.pace().next;
        if (justLogged === undefined || toMatch === undefined) {
            // Nothing in this history yet (the first standalone set of an exercise only done in
            // workouts, or the other way round): start from the latest set of the exercise in
            // the other one, which beats stepping up from zero.
            return toMatch ?? justLogged ?? this.latestSet();
        }
        const loadOf = (set: SetPerformed): Load | undefined => set.repGroups[0]?.load;
        const sameLoad =
            loadOf(justLogged)?.value === loadOf(toMatch)?.value &&
            loadOf(justLogged)?.unit === loadOf(toMatch)?.unit;
        return justLogged.kind === 'working' && sameLoad ? toMatch : justLogged;
    });

    protected async log(draft: SetDraft): Promise<void> {
        const result = await this.training.performSet(draft);
        this.error.set(result.ok ? undefined : result.error);
        if (result.ok) {
            // The log is appended by now, so the records already include the new set.
            this.announceRecord(result.value);
            this.select(undefined);
        }
    }

    private announceRecord(set: SetPerformed): void {
        const kind = this.records().get(set.id);
        const top = topSet(set, this.exerciseId(), this.catalog());
        if (kind === undefined || top === undefined) {
            this.announcement.set('');
            return;
        }
        const t = this.t();
        const load = formatLoad(this.language(), top.load, this.exercise());
        this.announcement.set(t.announce(t.records[kind], load, top.reps));
    }

    /** Tapping a set selects it; tapping it again deselects. */
    protected select(setId: SetId | undefined): void {
        this.selectedId.update((current) => (current === setId ? undefined : setId));
        this.voidArmed.set(false);
    }

    /**
     * First tap arms the button, second tap voids. Cheaper and safer than a modal dialog.
     * (Not named `void`: in a template that would be parsed as JavaScript's `void` operator.)
     */
    protected async voidSelected(): Promise<void> {
        const setId = this.selectedId();
        if (setId === undefined) {
            return;
        }
        if (!this.voidArmed()) {
            this.voidArmed.set(true);
            return;
        }
        this.select(undefined);
        await this.training.voidSet(setId);
    }
}
