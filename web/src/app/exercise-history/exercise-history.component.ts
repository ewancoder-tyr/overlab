import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    Input,
    OnInit,
    ViewChild
} from '@angular/core';
import { Set } from '../set/set.component';
import { RepType } from '../rep/rep.component';
import { PerformanceHistoryComponent } from '../performance-history/performance-history.component';
import { RecordSetComponent } from '../record-set/record-set.component';
import { ApiService } from '../api.service';

@Component({
    selector: 'olab-exercise-history',
    imports: [PerformanceHistoryComponent],
    templateUrl: './exercise-history.component.html',
    styleUrl: './exercise-history.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExerciseHistoryComponent implements OnInit {
    @Input({ required: true }) exercise!: string;
    protected sets: Set[] = [];

    constructor(private api: ApiService) {}

    ngOnInit() {
        this.api.getAllForExercise('Bicep Curl').subscribe(sets => {
            this.sets = sets;
            console.log(this.sets);
        });
    }
}
