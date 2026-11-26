import { Directive, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

/**
 * Makes a `routerLink` switch pages as soon as a finger touches it, like the tab bar of a native
 * app, instead of waiting for the browser's click.
 *
 * Why: on a phone the browser turns a touch into a click only if it judges it a tap. A thumb that
 * drifts a few pixels while down (easy when tapping tab after tab) is taken for the start of a
 * swipe and the click never comes, so the tab seemed not to react. Diagnostics showed exactly
 * that: the finger down on the tab, then no click. The finger-down itself always arrives.
 *
 * Touch only. Mouse, pen and keyboard keep the link's normal click (and ctrl-click or a middle
 * click still open a new tab). When the browser's click does follow a touch, the router finds
 * the app already on that page and ignores it.
 */
@Directive({
    selector: 'a[routerLink][olabSwitchOnTouch]',
    host: { '(pointerdown)': 'onPointerDown($event)' },
})
export class SwitchOnTouchDirective {
    // The `RouterLink` on the same element: it already knows where the link goes.
    private readonly link = inject(RouterLink);
    private readonly router = inject(Router);

    protected onPointerDown(event: PointerEvent): void {
        // `isPrimary`: only the first finger, so a second finger landing does nothing.
        if (event.pointerType !== 'touch' || !event.isPrimary) {
            return;
        }
        const target = this.link.urlTree;
        if (target !== null) {
            // Honours the link's own `replaceUrl`, as its click would.
            void this.router.navigateByUrl(target, { replaceUrl: this.link.replaceUrl });
        }
    }
}
