import { Injector, afterNextRender, inject } from '@angular/core';
import {
    NavigationCancel,
    NavigationEnd,
    NavigationError,
    NavigationSkipped,
    NavigationStart,
    Router,
} from '@angular/router';
import { TraceProbe, TraceRecorder } from '@diagnostics/application/diagnostics-ports';

/*
 * The probes. Each watches one thing and records it, and each `start` answers a function that
 * removes every listener it added. Between them they follow a tap all the way to the screen:
 *
 *   tap         the finger touched a control, and which page the DOM holds at that moment
 *   click       the browser turned the touch into a click (what links and buttons act on)
 *   cancelled   the browser or the system took the touch over for a gesture
 *   navigation  the router started, finished, skipped or cancelled a page switch
 *   render      Angular updated the page, then the browser was about to draw a frame
 *   busy, slow  the main thread was blocked, or an input took long to handle or to show
 *   error       anything reported as an error
 *
 * If a tap is followed by a finished navigation and a render, but the screen still showed the old
 * page, the browser did not draw. If the next tap finds the old page in the DOM, Angular did not
 * update it.
 */

/** The app shown or hidden: gaps in the trace are then explained. */
export class VisibilityProbe implements TraceProbe {
    start(record: TraceRecorder): () => void {
        const onChange = (): void => {
            record('app', document.visibilityState);
        };
        document.addEventListener('visibilitychange', onChange);
        return () => {
            document.removeEventListener('visibilitychange', onChange);
        };
    }
}

/** Touches and clicks on links and buttons, and touches on the tab bar that missed every tab. */
export class TapProbe implements TraceProbe {
    start(record: TraceRecorder): () => void {
        // Capture phase (`true`): heard before any handler of the app, even one that stops it.
        const onPointerDown = (event: Event): void => {
            const control = describeTarget(event.target);
            if (control !== undefined) {
                record('tap', `${control} (page: ${currentPage()})`);
            }
        };
        const onClick = (event: Event): void => {
            const control = describeTarget(event.target);
            if (control !== undefined) {
                record('tap', `click ${control}`);
            }
        };
        // The browser or the system took the touch over for a gesture of its own (a scroll, a
        // zoom, Android's swipe from the bottom edge). How far from the bottom of the screen it
        // started tells the system's gestures apart from the page's.
        const onCancel = (event: PointerEvent): void => {
            const control = describeTarget(event.target);
            if (control !== undefined) {
                const fromBottom = Math.round(window.innerHeight - event.clientY);
                record('tap', `cancelled ${control} (${fromBottom} px from the bottom)`);
            }
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('pointercancel', onCancel, true);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('pointercancel', onCancel, true);
        };
    }
}

/** Page switches, and when the switched page was rendered and about to be drawn. */
export class NavigationProbe implements TraceProbe {
    private readonly router = inject(Router);
    private readonly injector = inject(Injector);

    start(record: TraceRecorder): () => void {
        const subscription = this.router.events.subscribe((event) => {
            if (event instanceof NavigationStart) {
                record('navigation', `start ${event.url}`);
            } else if (event instanceof NavigationEnd) {
                record('navigation', `end ${event.urlAfterRedirects}`);
                this.recordDrawing(record);
            } else if (event instanceof NavigationSkipped) {
                record('navigation', `skipped ${event.url} (already there)`);
            } else if (event instanceof NavigationCancel) {
                record('navigation', `cancelled ${event.url}: ${event.reason}`);
            } else if (event instanceof NavigationError) {
                record('error', `navigation to ${event.url} failed: ${String(event.error)}`);
            }
        });
        return () => {
            subscription.unsubscribe();
        };
    }

    private recordDrawing(record: TraceRecorder): void {
        afterNextRender(
            () => {
                record('render', `page in the DOM: ${currentPage()}`);
                // Runs just before the browser draws its next frame. If it comes late, the browser
                // was not drawing.
                requestAnimationFrame(() => {
                    record('render', 'frame');
                });
            },
            { injector: this.injector },
        );
    }
}

/** The main thread blocked for over 50 ms: taps meanwhile wait. */
export class LongTaskProbe implements TraceProbe {
    start(record: TraceRecorder): () => void {
        return observePerformance('longtask', {}, record, (entry) => [
            'busy',
            `${Math.round(entry.duration)} ms`,
        ]);
    }
}

/**
 * Inputs that took long (Event Timing). `duration` runs from the touch to the next frame drawn
 * after it was handled, so a screen that was not redrawn shows up here as a long duration.
 */
export class SlowInputProbe implements TraceProbe {
    start(record: TraceRecorder): () => void {
        return observePerformance('event', { durationThreshold: 100 }, record, (entry) => {
            const timing = entry as PerformanceEventTiming;
            const waited = Math.round(timing.processingStart - timing.startTime);
            const shown = Math.round(timing.duration);
            return ['slow', `${timing.name}: waited ${waited} ms, on screen after ${shown} ms`];
        });
    }
}

/** Errors: uncaught ones, rejected promises, and everything Angular logs with `console.error`. */
export class ErrorProbe implements TraceProbe {
    start(record: TraceRecorder): () => void {
        const onError = (event: ErrorEvent): void => {
            record('error', event.message);
        };
        const onRejection = (event: PromiseRejectionEvent): void => {
            record('error', `unhandled promise: ${String(event.reason)}`);
        };
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        // Angular's error handler reports with `console.error`, so wrap it to keep a copy.
        const original = console.error;
        console.error = (...args: unknown[]) => {
            record('error', args.map(String).join(' '));
            original.apply(console, args);
        };
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
            console.error = original;
        };
    }
}

/**
 * Records the entries of one Performance Timeline type. Browsers support different types (Safari
 * has no long tasks), so an unsupported one is noted once and skipped.
 *
 * `durationThreshold` belongs to Event Timing and is missing from TypeScript's options type,
 * hence the widened parameter.
 */
function observePerformance(
    type: string,
    options: PerformanceObserverInit & { durationThreshold?: number },
    record: TraceRecorder,
    describe: (entry: PerformanceEntry) => readonly [Parameters<TraceRecorder>[0], string],
): () => void {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) {
        record('app', `${type} timing is not supported by this browser`);
        return () => undefined;
    }
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            const [kind, text] = describe(entry);
            // Entries carry their own time, on the page's clock; turn it into the real time.
            record(kind, text, performance.timeOrigin + entry.startTime);
        }
    });
    observer.observe({ ...options, type });
    return () => {
        observer.disconnect();
    };
}

/** A short name for what was touched, or undefined for a touch on nothing of interest. */
function describeTarget(target: EventTarget | null): string | undefined {
    if (!(target instanceof Element)) {
        return undefined;
    }
    const control = target.closest('a, button, label, summary, [role="button"]');
    if (control === null) {
        // A touch on the tab bar between the tabs is a miss worth knowing about.
        return target.closest('nav') === null ? undefined : 'navigation bar, no tab';
    }
    const name = control.getAttribute('aria-label') ?? control.textContent;
    return name.trim().replace(/\s+/g, ' ').slice(0, 40) || control.tagName.toLowerCase();
}

/** The page the router outlet holds in the DOM right now, e.g. `catalog`. */
function currentPage(): string {
    const page = document.querySelector('router-outlet')?.nextElementSibling;
    return page?.tagName.toLowerCase().replace(/^olab-/, '') ?? 'none';
}
