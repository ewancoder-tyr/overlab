import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TotalSetsComponent } from './total-sets.component';

describe('TotalSetsComponent', () => {
    let component: TotalSetsComponent;
    let fixture: ComponentFixture<TotalSetsComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TotalSetsComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(TotalSetsComponent);
        component = fixture.componentInstance;
        await fixture.whenStable();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
