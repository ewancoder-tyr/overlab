import { Injectable, signal, WritableSignal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SettingsService {
    useLbs: WritableSignal<boolean>;
    showRepTypes: WritableSignal<boolean>;
    compactView: WritableSignal<boolean>;

    constructor() {
        this.useLbs = signal(localStorage.getItem('tyr_olab_useLbs') === 'true');
        this.showRepTypes = signal(localStorage.getItem('tyr_olab_showRepTypes') === 'true');
        this.compactView = signal(localStorage.getItem('tyr_olab_compactView') === 'true');
    }

    toggleUnits() {
        this.useLbs.update(units => {
            localStorage.setItem('tyr_olab_useLbs', JSON.stringify(!units));
            return !units;
        });
    }

    toggleRepTypes() {
        this.showRepTypes.update(show => {
            localStorage.setItem('tyr_olab_showRepTypes', JSON.stringify(!show));
            return !show;
        });
    }

    toggleCompactView() {
        this.compactView.update(compact => {
            localStorage.setItem('tyr_olab_compactView', JSON.stringify(!compact));
            return !compact;
        });
    }
}
