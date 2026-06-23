import { computed, inject, resource, Service } from "@angular/core";
import { ExerciseId } from "@catalog/domain/exercise";
import { EventStore } from "@shared/event-store";
import { LocalStorageEventStore } from "@shared/infrastructure/local-storage-event-store";
import { setPerformed } from "@training/domain/events";
import { countTotalSets } from "./training.projections";

@Service()
export class TrainingService {
    private readonly eventStore: EventStore = inject(LocalStorageEventStore);
    private readonly eventsResource = resource({
        loader: () => this.eventStore.getAll()
    });

    readonly totalSets = computed(() => countTotalSets(this.eventsResource.value() ?? []));

    async performSet(exerciseId: ExerciseId, reps: number, weight: number): Promise<void> {
        const event = setPerformed(exerciseId, reps, weight);
        await this.eventStore.append(event);
        this.eventsResource.reload();
    }
}
