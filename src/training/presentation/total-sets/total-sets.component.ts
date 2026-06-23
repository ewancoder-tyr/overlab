import { Component, inject } from '@angular/core';
import { TrainingService } from '@training/application/training.service';

@Component({
    selector: 'olab-total-sets',
    imports: [],
    templateUrl: './total-sets.component.html',
    styleUrl: './total-sets.component.scss',
})
export class TotalSetsComponent {
    private readonly trainingService = inject(TrainingService);
    protected readonly totalSets = this.trainingService.totalSets;
}
