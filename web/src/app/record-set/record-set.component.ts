import { ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { ApiService } from '../api.service';

@Component({
    selector: 'olab-record-set',
    imports: [],
    templateUrl: './record-set.component.html',
    styleUrl: './record-set.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordSetComponent {
    @Input({ required: true }) exercise!: string;
    @ViewChild('input') input!: ElementRef<HTMLInputElement>;
    constructor(private api: ApiService) {}
    completeSet() {
        this.api
            .completeSet(this.exercise, {
                reps: this.input.nativeElement.value
            })
            .subscribe(() => console.log('done'));
    }
}
