import { Service, computed, effect, inject } from '@angular/core';
import { CatalogService } from '@catalog/application/catalog.service';
import { ExerciseId } from '@catalog/domain/exercise';
import { Clock } from '@shared/application/clock.service';
import { EventLog } from '@shared/application/event-log.service';
import { IsoDateTime } from '@shared/domain/event';
import { Result } from '@shared/domain/result';
import {
    CardioDraft,
    CardioId,
    CardioPerformed,
    activeCardio,
    performCardio,
    voidCardio,
} from '@training/domain/cardio';
import {
    SetDraft,
    SetId,
    SetPerformed,
    activeSets,
    performSet,
    voidSet,
    workoutSets,
} from '@training/domain/set';
import {
    CardioSession,
    ExerciseSession,
    cardioSessions,
    currentWorkout,
    exerciseSessions,
    groupIntoWorkouts,
    standaloneHabits,
    standaloneInProgressSince,
    standaloneSessions,
} from '@training/domain/workout';
import {
    IDLE_LIMIT_MS,
    currentExercise,
    restStart,
    workoutTime,
} from '@training/domain/session-clock';
import { Buzzer } from './buzzer';

/**
 * `computed` compares its new value with the old one using `===` to decide whether anything
 * changed. Two `Date` objects for the same instant are never `===`, so without this every clock
 * tick would look like a change to whoever reads the signal.
 */
function sameInstant(a: Date | undefined, b: Date | undefined): boolean {
    return a?.getTime() === b?.getTime();
}

/**
 * Application service of the training context: turns user intent into events and exposes the
 * projections as signals.
 *
 * Note how little it does. All rules live in the pure functions of `training/domain`; this class
 * only connects them to the event log and to Angular's reactivity.
 */
@Service()
export class TrainingService {
    private readonly log = inject(EventLog);
    private readonly clock = inject(Clock);
    private readonly catalog = inject(CatalogService).catalog;
    private readonly buzzer = inject(Buzzer);

    // Each `computed` re-runs only when a signal it read has changed, and caches its result.
    // The chain is: events -> sets and cardio bouts -> workouts -> current workout.
    readonly sets = computed(() => this.asOfNow(activeSets(this.log.events())));
    readonly cardio = computed(() => this.asOfNow(activeCardio(this.log.events())));
    /**
     * The sets that belong to workouts: all but the standalone ones. Workouts, rest and the
     * current exercise are derived from these, so a standalone set touches none of them.
     */
    private readonly workoutSets = computed(() => workoutSets(this.sets()));
    readonly workouts = computed(() => groupIntoWorkouts(this.workoutSets(), this.cardio()));
    readonly currentWorkout = computed(() => currentWorkout(this.workouts(), this.clock.now()));

    /**
     * The exercises done standalone lately (the user's habits outside workouts), each with the
     * sets of its standalone session in progress: what a solo program's row shows as done.
     */
    readonly standaloneHabits = computed(() => standaloneHabits(this.sets(), this.clock.now()));

    /** When the current rest began: the latest workout set, if it is within the idle limit. */
    readonly restStart = computed(() => restStart(this.workoutSets(), this.clock.now()), {
        equal: sameInstant,
    });

    /** The exercise of the latest set, while its rest is shown. See "Current Exercise". */
    readonly currentExercise = computed(() =>
        currentExercise(this.workoutSets(), this.clock.now()),
    );

    /** How long the workout in progress has lasted, running or stopped. */
    readonly workoutTime = computed(() => workoutTime(this.workouts(), this.clock.now()), {
        equal: (a, b) =>
            a?.running === b?.running &&
            sameInstant(a?.startedAt, b?.startedAt) &&
            sameInstant(a?.endsAt, b?.endsAt),
    });

    constructor() {
        this.refreshAtIdleLimit();
    }

    /**
     * While the user logs in the past (`Clock.logInThePast`), everything done after that moment
     * is left out, so the app shows that day as it was: its workout is the one in progress,
     * "last time" is the session before it, and rest counts from its latest set. Without this
     * the latest real workout would pass for the one in progress. Normally nothing is dropped.
     */
    private asOfNow<T extends { readonly occurredAt: IsoDateTime }>(
        activities: readonly T[],
    ): readonly T[] {
        if (!this.clock.inThePast()) {
            return activities;
        }
        const now = this.clock.now().getTime();
        return activities.filter((activity) => Date.parse(activity.occurredAt) <= now);
    }

    /**
     * The idle limit has to cut in on time: rest disappears and workout time stops 10 minutes
     * after the last set, even though no event arrives then. `Clock.now` ticks only every 30 s,
     * which would leave the rest showing 10:29 for a while.
     *
     * Rather than ticking faster everywhere, this schedules one timer for the next moment the
     * idle limit passes (for the latest set, then for the latest activity) and refreshes the
     * clock then. The effect re-runs on every clock tick and every new event, so the timer is
     * always aimed at the right moment, and `onCleanup` cancels the one it replaces.
     */
    private refreshAtIdleLimit(): void {
        effect((onCleanup) => {
            const now = this.clock.now().getTime();
            // Both lists are sorted by `occurredAt`, so `at(-1)` is the latest.
            const lastSet = this.workoutSets().at(-1)?.occurredAt;
            const lastActivity = this.workouts().at(-1)?.endedAt;
            const deadlines = [lastSet, lastActivity]
                .flatMap((last) => (last === undefined ? [] : [Date.parse(last) + IDLE_LIMIT_MS]))
                .filter((deadline) => deadline >= now);
            if (deadlines.length === 0) {
                return;
            }
            // `now` may be up to 30 s old, so measure the delay against the precise time. The
            // extra second makes sure the limit has really passed when the clock is read.
            const delay = Math.min(...deadlines) - this.clock.currentTime().getTime() + 1000;
            const timer = setTimeout(
                () => {
                    this.clock.refresh();
                },
                Math.max(0, delay),
            );
            onCleanup(() => {
                clearTimeout(timer);
            });
        });
    }

    /** History of one exercise, oldest session first. Reactive when called inside a `computed`. */
    sessionsOf(exerciseId: ExerciseId): readonly ExerciseSession[] {
        return exerciseSessions(this.workouts(), exerciseId);
    }

    /**
     * The standalone history of one exercise, oldest session first: its sets done outside any
     * workout, as sessions of their own. Never mixed with `sessionsOf`.
     */
    standaloneSessionsOf(exerciseId: ExerciseId): readonly ExerciseSession[] {
        return standaloneSessions(this.sets(), exerciseId);
    }

    /** Start of the standalone session in progress among `sessions`, if there is one. */
    standaloneInProgressSince(sessions: readonly ExerciseSession[]): IsoDateTime | undefined {
        return standaloneInProgressSince(sessions, this.clock.now());
    }

    /** History of one cardio exercise, oldest session first. */
    cardioSessionsOf(exerciseId: ExerciseId): readonly CardioSession[] {
        return cardioSessions(this.workouts(), exerciseId);
    }

    async performSet(draft: SetDraft): Promise<Result<SetPerformed>> {
        const result = performSet(draft, this.catalog(), this.log.context());
        if (result.ok) {
            await this.log.append(result.value);
            this.clock.refresh();
            // Only once it is saved: the tick says "logged", so a refused draft stays silent.
            this.buzzer.tap();
        }
        return result;
    }

    async voidSet(setId: SetId): Promise<void> {
        await this.log.append(voidSet(setId, this.log.context()));
    }

    async performCardio(draft: CardioDraft): Promise<Result<CardioPerformed>> {
        const result = performCardio(draft, this.catalog(), this.log.context());
        if (result.ok) {
            await this.log.append(result.value);
            this.clock.refresh();
            // Only once it is saved: the tick says "logged", so a refused draft stays silent.
            this.buzzer.tap();
        }
        return result;
    }

    async voidCardio(cardioId: CardioId): Promise<void> {
        await this.log.append(voidCardio(cardioId, this.log.context()));
    }
}
