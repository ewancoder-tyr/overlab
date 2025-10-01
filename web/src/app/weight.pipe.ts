import { DecimalPipe } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';
import { SettingsService } from './settings.service';

@Pipe({
    name: 'weight',
    pure: false
})
export class WeightPipe implements PipeTransform {
    constructor(private settings: SettingsService) {}

    transform(value: number, showUnits: boolean = false): string {
        if (this.settings.useLbs()) {
            const decimalPipe = new DecimalPipe('en-US');
            const weight = decimalPipe.transform(value * 2.20462, '1.0-1');
            return showUnits ? `${weight} lbs` : `${weight}`;
        } else {
            return showUnits ? `${value} kg` : `${value}`;
        }
    }
}
