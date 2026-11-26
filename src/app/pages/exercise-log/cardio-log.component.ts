import { Component, computed, inject, input, signal } from '@angular/core';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { CardioRecordKind } from '@analytics/domain/cardio-records';
import { describeCardio, describeCardioRecord } from '@analytics/domain/cardio-wording';
import { CardioCompareComponent } from '@analytics/presentation/cardio-compare/cardio-compare.component';
import { Exercise, cardioKindOf } from '@catalog/domain/exercise';
import { Locale } from '@shared/application/locale.service';
import { LocalText, Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';
import { TrainingService } from '@training/application/training.service';
import { CardioDraft, CardioId, cardioTotals } from '@training/domain/cardio';
import { CardioFormComponent } from '@training/presentation/cardio-form/cardio-form.component';

const TEXT = {
    en: {
        lastAndToday: 'Last session and today',
        mistake: 'Logged by mistake? Void the selected entry.',
        confirm: 'Confirm',
        void: 'Void',
        logCardio: 'Log cardio',
    },
    ru: {
        lastAndToday: 'Прошлый раз и сегодня',
        mistake: 'Записали по ошибке? Отмените выбранную запись.',
        confirm: 'Точно?',
        void: 'Отменить',
        logCardio: 'Записать кардио',
    },
} satisfies Localized<unknown>;

/**
 * The two lower zones of the logging screen for a cardio exercise: the comparison of last
 * session with today's, and the entry panel. `ExerciseLogComponent` provides the screen itself
 * (title bar, backdrop) and shows this instead of the set zones when the exercise is cardio.
 *
 * It mirrors what that component does for sets, with cardio bouts in place of sets.
 */
@Component({
    selector: 'olab-cardio-log',
    imports: [CardioCompareComponent, CardioFormComponent],
    templateUrl: './cardio-log.component.html',
    styleUrl: './cardio-log.component.scss',
})
export class CardioLogComponent {
    private readonly training = inject(TrainingService);
    private readonly analytics = inject(AnalyticsService);
    private readonly language = inject(Locale).language;

    readonly exercise = input.required<Exercise>();

    protected readonly t = translations(TEXT);
    protected readonly error = signal<LocalText | undefined>(undefined);
    /** The bout tapped in the comparison, whose "Void" button is shown. */
    protected readonly selectedId = signal<CardioId | undefined>(undefined);
    /** True after the first tap on "Void"; the second tap confirms. */
    protected readonly voidArmed = signal(false);
    /** Said once by screen readers when a logged bout makes today's session a record. */
    protected readonly announcement = signal('');

    private readonly sessions = computed(() => this.training.cardioSessionsOf(this.exercise().id));

    /** This exercise's session inside the workout in progress, if any. */
    private readonly currentSession = computed(() => {
        const latest = this.sessions().at(-1);
        const workout = this.training.currentWorkout();
        return latest !== undefined && latest.workoutStartedAt === workout?.startedAt
            ? latest
            : undefined;
    });

    /** Today against last time: both sessions added up, and the verdict. */
    protected readonly pace = computed(() => {
        const sessions = this.sessions();
        const current = this.currentSession();
        return this.analytics.cardioPaceOf(
            current,
            current === undefined ? sessions : sessions.slice(0, -1),
        );
    });

    /** Today's session with the record it has set so far, if it is under way. */
    private readonly today = computed(() =>
        this.currentSession() === undefined
            ? undefined
            : this.analytics.cardioRecordsOf(this.sessions()).at(-1),
    );

    /** The record today's session has set so far, for the biceps. */
    protected readonly record = computed(() => this.today()?.record);

    protected readonly bouts = computed(() => this.currentSession()?.bouts ?? []);

    protected readonly kind = computed(() => cardioKindOf(this.exercise()));

    /** The bouts of the session today is compared with: a treadmill draws them as a profile. */
    protected readonly lastBouts = computed(() => {
        const sessions = this.sessions();
        const earlier = this.currentSession() === undefined ? sessions : sessions.slice(0, -1);
        return earlier.at(-1)?.bouts ?? [];
    });

    /*
     * What a treadmill's form needs to know (see "Treadmill rule" in docs/rules/cardio.md). All of
     * it is read back from the log, so nothing about the incline is stored anywhere else.
     */

    /** Today's segments added up: the form takes them off what the display shows. */
    protected readonly soFar = computed(() =>
        this.kind() === 'treadmill' && this.bouts().length > 0
            ? cardioTotals(this.bouts())
            : undefined,
    );
    protected readonly soFarText = computed(() => {
        const soFar = this.soFar();
        return soFar === undefined ? undefined : describeCardio(this.language(), soFar);
    });

    /** The incline last used on this exercise, in any session: where the wheel starts. */
    protected readonly lastIncline = computed(
        () =>
            this.sessions()
                .flatMap((session) => session.bouts)
                .findLast((bout) => (bout.incline ?? 0) > 0)?.incline,
    );

    /** Whether today's latest segment was inclined: the next one starts the same way. */
    protected readonly inclined = computed(() => (this.bouts().at(-1)?.incline ?? 0) > 0);

    /** Whether the selected bout is (still) one of today's: then its "Void" button is shown. */
    protected readonly hasSelection = computed(() =>
        this.bouts().some((bout) => bout.id === this.selectedId()),
    );

    protected async log(draft: CardioDraft): Promise<void> {
        const before = this.record();
        const result = await this.training.performCardio(draft);
        this.error.set(result.ok ? undefined : result.error);
        if (result.ok) {
            // The log is appended by now. Announce a record when this bout made it (or changed
            // its kind), not again for every bout of a session that already was one.
            this.announceRecord(before);
            this.select(undefined);
        }
    }

    private announceRecord(before: CardioRecordKind | undefined): void {
        const today = this.today();
        const kind = today?.record;
        this.announcement.set(
            today === undefined || kind === undefined || kind === before
                ? ''
                : describeCardioRecord(this.language(), kind, today.totals),
        );
    }

    /** Tapping a bout selects it; tapping it again deselects. */
    protected select(cardioId: CardioId | undefined): void {
        this.selectedId.update((current) => (current === cardioId ? undefined : cardioId));
        this.voidArmed.set(false);
    }

    /** First tap arms the button, second tap voids. */
    protected async voidSelected(): Promise<void> {
        const cardioId = this.selectedId();
        if (cardioId === undefined) {
            return;
        }
        if (!this.voidArmed()) {
            this.voidArmed.set(true);
            return;
        }
        this.select(undefined);
        await this.training.voidCardio(cardioId);
    }
}
