import { APP_BASE_HREF, PathLocationStrategy, PlatformLocation } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/*
 * The phone's back button retraces your steps, but never further than one level up, in a
 * fixed hierarchy:
 *
 *     Week  <-  the other tabs  <-  pages opened from them (an exercise's logging or statistics
 *                                   screen, What's new)
 *
 * Among pages back goes to the page before, as you would expect: statistics opened from the
 * logging screen go back to it. But a page already visited is not visited twice: going back to
 * it, by back or by a link, cuts the trail back to it. So log, statistics, log again is just the
 * logging screen, one step from Train, not a walk through all three. Back on a page with nothing
 * before it returns to the tab (or Week) the trail started from; back on another tab goes to
 * Week; back on Week leaves the app.
 *
 * Two parts make it work:
 *
 * - **Nothing is added to history.** Every navigation replaces the address
 *   (`ReplaceOnlyLocationStrategy`). History grows with every page and cannot be cut back, and
 *   adding to it froze the installed app under Samsung power saving (docs/design.md, Known platform
 *   issues). The trail is kept here instead, in memory.
 * - **A `CloseWatcher` catches back.** Chrome on Android gives the back gesture to the newest
 *   close watcher before going back in history (it is what closes a dialog on back), so back
 *   fires its `close` event and nothing else. While any page but Week is shown, one is held,
 *   and its event navigates to the step before. On Week there is none, so back leaves the app.
 *
 * Only where both work: a browser with `CloseWatcher` on a touch screen. Elsewhere the router
 * keeps its usual history and the browser's back button works as on any site. On a computer
 * Escape also triggers close watchers, and would jump back while clearing a search box.
 */

/** Where back has a level to go up to: Week is the top. */
type Level = 'week' | 'tab' | 'page';

/** The tabs of the bottom bar other than Week (`/`), by path. */
const OUTER_TABS: readonly string[] = ['/exercises', '/catalog', '/data', '/settings'];

/** The path of a router URL, without query or fragment. */
function pathOf(url: string): string {
    return url.split(/[?#]/)[0] ?? '';
}

export function levelOf(url: string): Level {
    const path = pathOf(url);
    if (path === '/' || path === '') {
        return 'week';
    }
    return OUTER_TABS.includes(path) ? 'tab' : 'page';
}

/**
 * Where you are and how you got there: the tab (or Week) the pages were opened from, and the
 * pages visited since, oldest first, the current one last. On a tab or Week there are no pages.
 */
export interface Trail {
    readonly origin: string | undefined;
    readonly pages: readonly string[];
}

export const NO_TRAIL: Trail = { origin: undefined, pages: [] };

/**
 * The trail after a navigation from `previous` to `url`. A tab or Week starts afresh. A page
 * already on the trail cuts it back to that page (which is also what a back press does: it
 * navigates to the page before, which is on the trail). Any other page is added.
 */
export function trailAfter(previous: string | undefined, url: string, trail: Trail): Trail {
    if (levelOf(url) !== 'page') {
        return NO_TRAIL;
    }
    const visited = trail.pages.indexOf(url);
    if (visited >= 0) {
        return { origin: trail.origin, pages: trail.pages.slice(0, visited + 1) };
    }
    if (previous !== undefined && levelOf(previous) !== 'page') {
        return { origin: previous, pages: [url] };
    }
    return { origin: trail.origin, pages: [...trail.pages, url] };
}

/**
 * Where back goes from `url`, or `undefined` on Week, where it leaves the app. A page opened
 * straight from outside (a link, a notification) has no origin, so its trail ends at its natural
 * parent: an exercise's screens at Train, What's new at Settings.
 */
export function backTarget(url: string, trail: Trail): string | undefined {
    switch (levelOf(url)) {
        case 'week':
            return undefined;
        case 'tab':
            return '/';
        case 'page':
            return trail.pages.at(-2) ?? trail.origin ?? naturalParent(trail.pages[0] ?? url);
    }
}

function naturalParent(url: string): string {
    const path = pathOf(url);
    if (path.startsWith('/exercises/')) {
        return '/exercises';
    }
    if (path === '/whats-new') {
        return '/settings';
    }
    return '/';
}

/*
 * `CloseWatcher` is not in TypeScript's DOM types yet, so the part used here is declared by hand
 * and looked up on `globalThis`, which also answers whether the browser has it at all.
 */
interface CloseWatcherLike {
    onclose: (() => void) | null;
    destroy(): void;
}

type CloseWatcherConstructor = new () => CloseWatcherLike;

function closeWatcherConstructor(): CloseWatcherConstructor | undefined {
    const candidate: unknown = Reflect.get(globalThis, 'CloseWatcher');
    return typeof candidate === 'function' ? (candidate as CloseWatcherConstructor) : undefined;
}

/** True when the app handles back itself: decided once, at start. */
const HANDLES_BACK =
    closeWatcherConstructor() !== undefined && matchMedia('(pointer: coarse)').matches;

/**
 * The router's link to the browser address, with "add a history entry" turned into "replace the
 * current one" while the app handles back itself. Angular's router writes the address only
 * through a `LocationStrategy`, so this one class covers every link and navigation in the app.
 */
@Injectable()
export class ReplaceOnlyLocationStrategy extends PathLocationStrategy {
    constructor() {
        super(inject(PlatformLocation), inject(APP_BASE_HREF, { optional: true }) ?? undefined);
    }

    // `state` is `any` in Angular's own signature; it is passed through untouched.
    override pushState(state: unknown, title: string, url: string, queryParams: string): void {
        if (HANDLES_BACK) {
            this.replaceState(state, title, url, queryParams);
        } else {
            super.pushState(state, title, url, queryParams);
        }
    }
}

/** Holds a close watcher while back has somewhere to go, and goes there when it fires. */
export function handleBack(): void {
    const Watcher = closeWatcherConstructor();
    if (!HANDLES_BACK || Watcher === undefined) {
        return;
    }
    const router = inject(Router);
    let current: string | undefined;
    let trail = NO_TRAIL;
    let watcher: CloseWatcherLike | undefined;

    const subscription = router.events.subscribe((event) => {
        if (!(event instanceof NavigationEnd)) {
            return;
        }
        const url = event.urlAfterRedirects;
        trail = trailAfter(current, url, trail);
        current = url;
        if (backTarget(url, trail) === undefined) {
            watcher?.destroy();
            watcher = undefined;
        } else if (watcher === undefined) {
            // One watcher, kept while back has somewhere to go; it reads the trail when it fires.
            // A closed one is spent, so a new one is made on the page that back leads to.
            const created = new Watcher();
            created.onclose = () => {
                watcher = undefined;
                const target = current === undefined ? undefined : backTarget(current, trail);
                if (target !== undefined) {
                    void router.navigateByUrl(target);
                }
            };
            watcher = created;
        }
    });

    inject(DestroyRef).onDestroy(() => {
        subscription.unsubscribe();
        watcher?.destroy();
    });
}
