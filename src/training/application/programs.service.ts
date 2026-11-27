import { Service, computed, inject } from '@angular/core';
import { CatalogService } from '@catalog/application/catalog.service';
import { Clock } from '@shared/application/clock.service';
import { EventLog } from '@shared/application/event-log.service';
import { Result } from '@shared/domain/result';
import {
    Program,
    ProgramDayChosen,
    ProgramDayId,
    ProgramDefined,
    ProgramDraft,
    ProgramId,
    chooseProgramDay,
    currentPrograms,
    defineProgram,
    programStatuses,
    removeProgram,
    workoutDays,
} from '@training/domain/program';
import { TrainingService } from './training.service';

/**
 * Programs: the lists of exercises the user prepared, and which day of them comes next. See
 * "Program rule" in docs/rules/training.md.
 *
 * Like `TrainingService` it only connects the pure functions of `training/domain/program.ts` to
 * the event log and to Angular's reactivity.
 */
@Service()
export class ProgramsService {
    private readonly log = inject(EventLog);
    private readonly clock = inject(Clock);
    private readonly training = inject(TrainingService);
    private readonly catalog = inject(CatalogService).catalog;

    readonly programs = computed(() =>
        currentPrograms(this.log.events(), this.training.sets(), this.clock.now()),
    );

    /** Every program with what is derived for it, the ones due today first. */
    readonly statuses = computed(() =>
        programStatuses(
            this.programs(),
            this.training.workouts(),
            this.log.events(),
            this.training.sets(),
            this.clock.now(),
        ),
    );

    /** Which program day each workout is, keyed by the workout's `startedAt`. */
    readonly workoutDays = computed(() => workoutDays(this.training.workouts(), this.log.events()));

    /** A fresh id for a new program or a new day. */
    newId(): string {
        return this.log.context().newId();
    }

    async define(draft: ProgramDraft): Promise<Result<ProgramDefined>> {
        const result = defineProgram(draft, this.programs(), this.catalog(), this.log.context());
        if (result.ok) {
            await this.log.append(result.value);
        }
        return result;
    }

    async remove(programId: ProgramId): Promise<void> {
        await this.log.append(removeProgram(programId, this.log.context()));
    }

    /**
     * Records which day of a program a workout is: the one in progress or about to start, or,
     * with `occurredAt`, the workout that moment falls in.
     */
    async chooseDay(
        program: Program,
        dayId: ProgramDayId,
        occurredAt?: Date,
    ): Promise<Result<ProgramDayChosen>> {
        const result = chooseProgramDay(program, dayId, this.log.context(), occurredAt);
        if (result.ok) {
            await this.log.append(result.value);
            this.clock.refresh();
        }
        return result;
    }
}
