import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterLink, provideRouter } from '@angular/router';
import { MockInstance, describe, expect, it, vi } from 'vitest';
import { SwitchOnTouchDirective } from './switch-on-touch.directive';

@Component({
    imports: [RouterLink, SwitchOnTouchDirective],
    template: `<a routerLink="/catalog" replaceUrl olabSwitchOnTouch>Catalog</a>`,
})
class Host {}

/** Renders the link and answers it with a spy on the router's navigation. */
function setUp(): { link: HTMLAnchorElement; navigate: MockInstance<Router['navigateByUrl']> } {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    if (link === null) {
        throw new Error('The link was not rendered');
    }
    return { link, navigate };
}

function press(link: HTMLElement, pointerType: string, isPrimary = true): void {
    link.dispatchEvent(new PointerEvent('pointerdown', { pointerType, isPrimary, bubbles: true }));
}

describe('SwitchOnTouchDirective', () => {
    it('switches as soon as a finger touches the link, without waiting for a click', () => {
        const { link, navigate } = setUp();
        press(link, 'touch');
        expect(navigate).toHaveBeenCalledOnce();
        expect(String(navigate.mock.calls[0]?.[0])).toBe('/catalog');
        expect(navigate.mock.calls[0]?.[1]).toEqual({ replaceUrl: true });
    });

    it('leaves a mouse to the normal click', () => {
        const { link, navigate } = setUp();
        press(link, 'mouse');
        expect(navigate).not.toHaveBeenCalled();
    });

    it('ignores a second finger', () => {
        const { link, navigate } = setUp();
        press(link, 'touch', false);
        expect(navigate).not.toHaveBeenCalled();
    });
});
