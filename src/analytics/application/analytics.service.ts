import { Service, computed, inject, signal } from '@angular/core';
import {
    CardioHistoryEntry,
    CardioPace,
    cardioHistory,
    cardioPace,
} from '@analytics/domain/cardio-progression';
import {
    CardioRecordEntry,
    CardioRecordRow,
    cardioRecordTable,
    cardioRecords,
} from '@analytics/domain/cardio-records';
import { exerciseProgress } from '@analytics/domain/exercise-progress';
import { DEFAULT_STALL_INVOLVEMENT, couldAdd, muscleStalls } from '@analytics/domain/muscle-stall';
import { OverloadHype, overloadHype, soloHype } from '@analytics/domain/overload-hype';
import { Progression, sessionProgression } from '@analytics/domain/progression';
import { RecordKind, RecordRow, recordTable, recordsOf } from '@analytics/domain/records';
import { SessionPace, sessionPace } from '@analytics/domain/session-pace';
import { DEFAULT_STALL_THRESHOLD, isStalled, stalledForNow } from '@analytics/domain/stall';
import { DEFAULT_CARDIO_GOAL_MINUTES, weeklyCardio } from '@analytics/domain/weekly-cardio';
import {
    DEFAULT_LIGHT_SET_WEIGHT,
    DEFAULT_WINDOW_DAYS,
    DEFAULT_VOLUME_TARGET,
    VolumeTarget,
    weeklyVolume,
} from '@analytics/domain/weekly-volume';
import { CatalogService } from '@catalog/application/catalog.service';
import { ExerciseId, isCardio } from '@catalog/domain/exercise';
import { MuscleGroupId } from '@catalog/domain/muscle-group';
import { Clock } from '@shared/application/clock.service';
import { IsoDateTime } from '@shared/domain/event';
import { Locale } from '@shared/application/locale.service';
import { TrainingService } from '@training/application/training.service';
import { SetId, primaryExerciseId } from '@training/domain/set';
import { CardioSession, ExerciseSession } from '@training/domain/workout';

/**
 * Analytics owns no events. It only derives insight from what training recorded, which is why
 * its rules can keep evolving without ever migrating stored data.
 */
@Service()
export class AnalyticsService {
    private readonly training = inject(TrainingService);
    private readonly clock = inject(Clock);
    private readonly catalogService = inject(CatalogService);
    private readonly catalog = this.catalogService.catalog;
    private readonly language = inject(Locale).language;

    /**
     * After how many sessions in a row without progress an exercise is stalled (0: never). A
     * preference, so it lives in settings, which analytics must not know: the shell passes it in
     * (see `app.config.ts`), as it does the rotation for training.
     */
    private readonly stallThreshold = signal(DEFAULT_STALL_THRESHOLD);

    setStallThreshold(sessions: number): void {
        this.stallThreshold.set(sessions);
    }

    /** The weekly range of sets per muscle group. A preference, passed in like the threshold. */
    private readonly volumeTarget = signal<VolumeTarget>(DEFAULT_VOLUME_TARGET);

    setVolumeTarget(target: VolumeTarget): void {
        this.volumeTarget.set(target);
    }

    /** What a light set is worth in weekly volume (0 to 1). A preference, passed in likewise. */
    private readonly lightSetWeight = signal(DEFAULT_LIGHT_SET_WEIGHT);

    setLightSetWeight(weight: number): void {
        this.lightSetWeight.set(weight);
    }

    /** The weekly minutes of cardio to reach. A preference, passed in like the threshold. */
    private readonly cardioGoalMinutes = signal(DEFAULT_CARDIO_GOAL_MINUTES);

    setCardioGoal(minutes: number): void {
        this.cardioGoalMinutes.set(minutes);
    }

    /**
     * How much an exercise must involve a muscle group (0 to 1) for its stall to mark that
     * muscle group. A preference, passed in like the threshold.
     */
    private readonly stallInvolvement = signal(DEFAULT_STALL_INVOLVEMENT);

    setStallInvolvement(involvement: number): void {
        this.stallInvolvement.set(involvement);
    }

    /**
     * Over how many days weekly volume and weekly cardio are counted (the target window). A
     * preference, passed in like the threshold. Public, read-only: the Week page says it.
     */
    private readonly window = signal(DEFAULT_WINDOW_DAYS);
    readonly windowDays = this.window.asReadonly();

    setWindowDays(days: number): void {
        this.window.set(days);
    }

    /** Start of the workout in progress, if any: its session is not finished yet. */
    private readonly inProgressSince = computed(() => this.training.currentWorkout()?.startedAt);

    /**
     * Every lifting exercise that is stalled right now, for the tag on the Train page.
     *
     * Cardio never stalls (see "Cardio match rule" in docs/rules/cardio.md): a runner cannot go
     * farther or faster every time, so the aim there is to match last time, and records mark the
     * rest. Skipping cardio here also skips the sets logged for cardio on the 0.3.0 day.
     */
    readonly stalledExercises = computed<ReadonlySet<ExerciseId>>(() => {
        const catalog = this.catalog();
        const ids = new Set(this.training.sets().map(primaryExerciseId));
        const stalled = new Set<ExerciseId>();
        for (const id of ids) {
            const exercise = id === undefined ? undefined : catalog.findExercise(id);
            if (exercise === undefined || isCardio(exercise)) {
                continue;
            }
            // Either history can stall, each on its own: the workout sessions, or the
            // standalone ones, whose session in progress is its own (not the workout's).
            const standalone = this.training.standaloneSessionsOf(exercise.id);
            if (
                this.stallOf(this.training.sessionsOf(exercise.id)) !== undefined ||
                this.stallOf(standalone, this.training.standaloneInProgressSince(standalone)) !==
                    undefined
            ) {
                stalled.add(exercise.id);
            }
        }
        return stalled;
    });

    /** Every muscle group's work over the target window against its target. */
    readonly weeklyVolume = computed(() =>
        weeklyVolume(
            this.training.sets(),
            this.catalog(),
            this.clock.now(),
            this.volumeTarget(),
            this.lightSetWeight(),
            this.window(),
        ),
    );

    /**
     * The muscle groups with a stalled exercise that trains them directly and was done this
     * week, each with its volume advice. See "Stalled muscle group rule" in
     * docs/rules/progression.md.
     */
    readonly muscleStalls = computed(() =>
        muscleStalls(
            this.weeklyVolume(),
            this.stalledExercises(),
            this.catalog(),
            this.stallInvolvement(),
        ),
    );

    /**
     * Up to three favorites that would add direct work to a muscle group and were not done on it
     * this week, for a muscle group whose advice is to add sets.
     */
    couldAddTo(muscleGroupId: MuscleGroupId): readonly ExerciseId[] {
        const volume = this.weeklyVolume().find((each) => each.muscleGroup.id === muscleGroupId);
        return couldAdd(
            muscleGroupId,
            volume?.byExercise ?? [],
            this.catalogService.favorites(),
            this.catalog(),
            this.stallInvolvement(),
        );
    }

    /** The minutes of all cardio over the target window against the goal. */
    readonly weeklyCardio = computed(() =>
        weeklyCardio(
            this.training.cardio(),
            this.catalog(),
            this.clock.now(),
            this.cardioGoalMinutes(),
            this.window(),
        ),
    );

    /**
     * Hype lines for the exercises of a program day: what was done on each the last time and
     * what to go for, worded in the app's language (the reminder is sent in it too). Reads
     * signals, so a caller inside an effect or a `computed` follows the log.
     */
    overloadHypeFor(exerciseIds: readonly ExerciseId[]): readonly OverloadHype[] {
        return overloadHype(exerciseIds, this.training.workouts(), this.catalog(), this.language());
    }

    /**
     * The hype line for one exercise of a solo program, from its standalone history; absent
     * until it has been done outside a workout. Reads signals, so a caller inside an effect or
     * a `computed` follows the log.
     */
    soloHypeOf(exerciseId: ExerciseId): OverloadHype | undefined {
        const exercise = this.catalog().findExercise(exerciseId);
        return exercise === undefined
            ? undefined
            : soloHype(exercise, this.training.standaloneSessionsOf(exerciseId), this.language());
    }

    /**
     * Progression of every working set in `sessions`, each session compared with the ones before
     * it. `sessions` is one exercise's history, oldest first.
     */
    progressionOf(sessions: readonly ExerciseSession[]): ReadonlyMap<SetId, Progression> {
        const catalog = this.catalog();
        const result = new Map<SetId, Progression>();
        sessions.forEach((session, index) => {
            for (const [id, progression] of sessionProgression(
                session,
                sessions.slice(0, index),
                catalog,
            )) {
                result.set(id, progression);
            }
        });
        return result;
    }

    /**
     * The personal records in one exercise's history, by set id: which sets beat everything
     * before them, and how. `sessions` is one exercise's history, oldest first.
     */
    recordsOf(sessions: readonly ExerciseSession[]): ReadonlyMap<SetId, RecordKind> {
        return recordsOf(sessions, this.catalog());
    }

    /**
     * The records to beat for the setup of the latest session, heaviest first. Empty until that
     * setup has a second session.
     */
    recordTableOf(sessions: readonly ExerciseSession[]): readonly RecordRow[] {
        const catalog = this.catalog();
        // The session's setup as progression sees it (that of its first working set).
        const setupId = exerciseProgress(sessions, catalog).at(-1)?.setupId;
        return recordTable(sessions, setupId, catalog);
    }

    /**
     * How many sessions in a row the exercise has gone without progress, when that makes it
     * stalled under the user's threshold; `undefined` when it is not stalled.
     *
     * @param inProgressSince - start of the session still going on, if any. The workout in
     *   progress unless told otherwise; standalone sessions pass their own.
     */
    stallOf(
        sessions: readonly ExerciseSession[],
        inProgressSince: IsoDateTime | undefined = this.inProgressSince(),
    ): number | undefined {
        const count = stalledForNow(exerciseProgress(sessions, this.catalog()), inProgressSince);
        return isStalled(count, this.stallThreshold()) ? count : undefined;
    }

    /** A cardio exercise's sessions, oldest first, each with the record it set, if any. */
    cardioRecordsOf(sessions: readonly CardioSession[]): readonly CardioRecordEntry[] {
        return cardioRecords(sessions);
    }

    /** The cardio records to beat, for the measures of the latest session. */
    cardioRecordTableOf(sessions: readonly CardioSession[]): readonly CardioRecordRow[] {
        return cardioRecordTable(sessions);
    }

    /**
     * Where the session in progress stands against the previous one. `current` is `undefined`
     * before the first set; `earlier` is the exercise's sessions before it, oldest first.
     */
    paceOf(current: ExerciseSession | undefined, earlier: readonly ExerciseSession[]): SessionPace {
        return sessionPace(current, earlier, this.catalog());
    }

    /** Today's cardio against last time's. Same parameters as `paceOf`, for cardio sessions. */
    cardioPaceOf(
        current: CardioSession | undefined,
        earlier: readonly CardioSession[],
    ): CardioPace {
        return cardioPace(current, earlier);
    }

    /** A cardio exercise's sessions, oldest first, each judged against the one before. */
    cardioHistoryOf(sessions: readonly CardioSession[]): readonly CardioHistoryEntry[] {
        return cardioHistory(sessions);
    }
}
