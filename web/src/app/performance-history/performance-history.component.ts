import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { PerformanceComponent } from '../performance/performance.component';
import { Set } from '../set/set.component';

@Component({
    selector: 'olab-performance-history',
    imports: [PerformanceComponent],
    templateUrl: './performance-history.component.html',
    styleUrl: './performance-history.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PerformanceHistoryComponent {
    @Input({ required: true }) sets!: Set[];
}
