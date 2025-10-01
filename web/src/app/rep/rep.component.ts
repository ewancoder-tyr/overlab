import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { WeightPipe } from '../weight.pipe';

@Component({
    selector: 'olab-rep',
    imports: [WeightPipe],
    templateUrl: './rep.component.html',
    styleUrl: './rep.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RepComponent {
    @Input({ required: true }) rep!: Rep;
    @Input() showWeight = false;
    @Input() showType = false;

    @HostBinding('class') get repTypeClass() {
        switch (this.rep.type) {
            case RepType.LongLengthPartial:
                return 'llp';
            case RepType.AlternatingWithLongLengthPartial:
                return 'allp';
            default:
                return 'regular';
        }
    }

    getReadableRepType(repType: RepType) {
        switch (repType) {
            case RepType.LongLengthPartial:
                return 'LLP';
            case RepType.AlternatingWithLongLengthPartial:
                return 'A/LLP';
            default:
                return 'REG';
        }
    }
}

export enum RepType {
    Regular = 0,
    LongLengthPartial = 1,
    AlternatingWithLongLengthPartial = 10
}

export interface Rep {
    weight: number;
    type: RepType;
    amount: number;
}
