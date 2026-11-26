import { describe, expect, it } from 'vitest';
import { NO_TRAIL, backTarget, levelOf, trailAfter } from './back-navigation';

/** Follows a list of visited URLs the way the app does, and returns where back goes from the last. */
function backAfter(...urls: string[]): string | undefined {
    let previous: string | undefined;
    let trail = NO_TRAIL;
    for (const url of urls) {
        trail = trailAfter(previous, url, trail);
        previous = url;
    }
    return previous === undefined ? undefined : backTarget(previous, trail);
}

describe('back retraces your steps, at most one level up', () => {
    it('knows Week, the other tabs and the pages opened from them', () => {
        expect(levelOf('/')).toBe('week');
        for (const url of ['/exercises', '/catalog', '/data', '/settings', '/catalog?x=1']) {
            expect(levelOf(url)).toBe('tab');
        }
        for (const url of ['/exercises/bicep-curl', '/exercises/bicep-curl/stats', '/whats-new']) {
            expect(levelOf(url)).toBe('page');
        }
    });

    it('leaves the app from Week', () => {
        expect(backAfter('/exercises', '/')).toBeUndefined();
    });

    it('goes to Week from any other tab', () => {
        expect(backAfter('/', '/catalog', '/settings')).toBe('/');
    });

    it('goes from a page to the tab it was opened from', () => {
        expect(backAfter('/', '/exercises', '/exercises/bicep-curl')).toBe('/exercises');
        expect(backAfter('/', '/exercises/bicep-curl/stats')).toBe('/');
    });

    it('goes from a page to the page it was opened from', () => {
        expect(
            backAfter('/exercises', '/exercises/bicep-curl', '/exercises/bicep-curl/stats'),
        ).toBe('/exercises/bicep-curl');
    });

    it('cuts the trail back when a page is visited again', () => {
        expect(
            backAfter(
                '/exercises',
                '/exercises/bicep-curl',
                '/exercises/bicep-curl/stats',
                '/exercises/bicep-curl',
            ),
        ).toBe('/exercises');
    });

    it('forgets the origin once a tab is shown again', () => {
        expect(
            backAfter('/', '/exercises/bicep-curl/stats', '/exercises', '/exercises/bicep-curl'),
        ).toBe('/exercises');
    });

    it('sends a page opened from outside to its natural parent', () => {
        expect(backAfter('/exercises/bicep-curl')).toBe('/exercises');
        expect(backAfter('/exercises/bicep-curl/stats', '/exercises/bicep-curl')).toBe(
            '/exercises/bicep-curl/stats',
        );
        expect(backAfter('/whats-new')).toBe('/settings');
    });
});

describe('pressing back', () => {
    it('steps along the trail to the tab, then Week, then out', () => {
        let previous: string | undefined;
        let trail = NO_TRAIL;
        const visit = (url: string): void => {
            trail = trailAfter(previous, url, trail);
            previous = url;
        };
        for (const url of ['/', '/exercises', '/exercises/a', '/exercises/a/stats']) {
            visit(url);
        }
        const steps: (string | undefined)[] = [];
        for (let press = 0; press < 4 && previous !== undefined; press++) {
            const target = backTarget(previous, trail);
            steps.push(target);
            if (target === undefined) {
                break;
            }
            visit(target);
        }
        expect(steps).toEqual(['/exercises/a', '/exercises', '/', undefined]);
    });
});
