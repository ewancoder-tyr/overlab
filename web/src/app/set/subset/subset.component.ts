import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { Rep, RepComponent } from '../../rep/rep.component';
import { WeightPipe } from '../../weight.pipe';
import { SettingsService } from '../../settings.service';

@Component({
    selector: 'olab-subset',
    imports: [RepComponent, WeightPipe],
    templateUrl: './subset.component.html',
    styleUrl: './subset.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubsetComponent {
    @Input()
    @HostBinding('class.compact')
    isCompact = false;

    @Input({ required: true })
    subset!: SubSet;

    constructor(protected settings: SettingsService) {}
}

export interface SubSet {
    weight: number;
    reps: Rep[];
}
