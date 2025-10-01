import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Set, SetComponent } from '../set/set.component';
import { DatePipe } from '@angular/common';

@Component({
    selector: 'olab-performance',
    imports: [SetComponent, DatePipe],
    templateUrl: './performance.component.html',
    styleUrl: './performance.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PerformanceComponent {
    @Input({ required: true }) set!: Set;
}
