import { Component, inject } from '@angular/core';
import { exerciseId } from '@catalog/domain/exercise';
import { TrainingService } from '@training/application/training.service';
import { TotalSetsComponent } from "@training/presentation/total-sets/total-sets.component";

@Component({
    selector: 'olab-home',
    imports: [TotalSetsComponent],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent {
    private readonly trainingService = inject(TrainingService);

    protected async performFakeSet() {
        await this.trainingService.performSet(
            exerciseId('bicep-curl'),
            10, 10);
    }
}
