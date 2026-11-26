import { Service, computed, inject, signal } from '@angular/core';
import { DEFAULT_STALL_THRESHOLD } from '@analytics/domain/stall';
import { DEFAULT_LIGHT_SET_WEIGHT } from '@analytics/domain/weekly-volume';
import { CatalogService } from '@catalog/application/catalog.service';
import { EventLog } from '@shared/application/event-log.service';
import { TrainingService } from '@training/application/training.service';
import { isStandalone } from '@training/domain/set';
import { experience } from '@gamification/domain/experience';
import { experienceEpoch, resetProgress } from '@gamification/domain/progress-reset';

/**
 * Application service of the gamification context: experience and levels derived from the log,
 * and the one command it has, starting from scratch.
 *
 * Whether the game is shown at all is a preference (settings), which this context must not
 * know; the pages ask settings. `experience` is a `computed`, and a computed signal runs only
 * when something reads it, so with the game switched off nothing here ever runs.
 */
@Service()
export class GamificationService {
    private readonly log = inject(EventLog);
    private readonly training = inject(TrainingService);
    private readonly catalog = inject(CatalogService).catalog;

    /** What a light set is worth (0 to 1). A preference, passed in by `app.config.ts`. */
    private readonly lightSetWeight = signal(DEFAULT_LIGHT_SET_WEIGHT);
    /** The stall threshold, for the stall-broken bonus. A preference, passed in likewise. */
    private readonly stallThreshold = signal(DEFAULT_STALL_THRESHOLD);

    setRules(rules: { readonly lightSetWeight: number; readonly stallThreshold: number }): void {
        this.lightSetWeight.set(rules.lightSetWeight);
        this.stallThreshold.set(rules.stallThreshold);
    }

    /** The moment experience counts from; `undefined` when the user never started over. */
    readonly epoch = computed(() => experienceEpoch(this.log.events()));

    readonly experience = computed(() =>
        experience(
            this.training.workouts(),
            this.catalog(),
            this.epoch(),
            { lightSetWeight: this.lightSetWeight(), stallThreshold: this.stallThreshold() },
            this.training.sets().filter(isStandalone),
        ),
    );

    /** Starts experience from scratch: from now on, only what is done next counts. */
    async reset(): Promise<void> {
        await this.log.append(resetProgress(this.log.context()));
    }
}
