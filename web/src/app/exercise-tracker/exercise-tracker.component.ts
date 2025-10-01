import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    Input,
    ViewChild
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RecordSetComponent } from '../record-set/record-set.component';

@Component({
    selector: 'olab-exercise-tracker',
    imports: [RouterOutlet, RecordSetComponent],
    templateUrl: './exercise-tracker.component.html',
    styleUrl: './exercise-tracker.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExerciseTrackerComponent implements AfterViewInit {
    @ViewChild('history') historyElement!: ElementRef<HTMLDivElement>;
    @Input({ required: true }) exercise!: string;

    ngAfterViewInit() {
        this.historyElement.nativeElement.scrollTop =
            this.historyElement.nativeElement.scrollHeight;
    }
}
