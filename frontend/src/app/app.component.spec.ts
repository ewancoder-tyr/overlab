import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DebugElement, provideExperimentalZonelessChangeDetection } from '@angular/core';
//import { tryInit } from '../test-init';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
    let component: AppComponent;
    let fixture: ComponentFixture<AppComponent>;
    let debug: DebugElement;
    let html: HTMLElement;
    let rootPx = 16;

    beforeEach(async () => {
        //tryInit();
        await TestBed.configureTestingModule({
            providers: [provideExperimentalZonelessChangeDetection()],
            imports: [AppComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(AppComponent);
        component = fixture.componentInstance;
        debug = fixture.debugElement;
        html = debug.nativeElement;
    });

    describe('when component is initialized', () => {
        beforeEach(async () => {
            // Set some inputs of a component here.
            await fixture.whenStable();
        });

        it('should initialize', () => {
            expect(component).toBeDefined();
        });

        // TODO: Consider testing it somehow against vw units.
        /*it('should have proper font size', () => {
            const expectedFontSize = 1; // em.
            expect(getComputedStyle(html).fontSize).toBe(`${rootPx * expectedFontSize}px`);
        });*/
    });
});
