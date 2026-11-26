import { LANGUAGES } from '@shared/domain/language';
import { RELEASES } from './release-notes';

describe('release notes', () => {
    it('list every version once, newest first', () => {
        const versions = RELEASES.map((release) => release.version);
        // "1.10.0" is newer than "1.9.0": compare number by number, not as text.
        const asNumbers = (version: string): number[] => version.split('.').map(Number);
        const newestFirst = versions.toSorted((a, b) => {
            const [left, right] = [asNumbers(a), asNumbers(b)];
            const index = left.findIndex((part, position) => part !== right[position]);
            return index === -1 ? 0 : (right[index] ?? 0) - (left[index] ?? 0);
        });

        expect(new Set(versions).size).toBe(versions.length);
        expect(versions).toEqual(newestFirst);
    });

    it.each(RELEASES)(
        '$version has a date, changes and a summary that fits a notification',
        (release) => {
            expect(release.version).toMatch(/^\d+\.\d+\.\d+$/);
            expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            for (const language of LANGUAGES) {
                expect(release.changes[language].length).toBeGreaterThan(0);
                expect(release.summary[language].length).toBeGreaterThan(0);
                // The reminder server refuses a notification body above 300 characters.
                expect(release.summary[language].length).toBeLessThanOrEqual(250);
            }
            // Every language lists the same changes, one for one.
            expect(release.changes.ru.length).toBe(release.changes.en.length);
        },
    );
});
