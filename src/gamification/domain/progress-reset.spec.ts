import { contextAt } from '../../testing/fixtures';
import { experienceEpoch, resetProgress } from './progress-reset';

describe('progress reset', () => {
    it('has no epoch until the user resets: all of history counts', () => {
        expect(experienceEpoch([])).toBeUndefined();
    });

    it('counts from the latest reset, whatever order the events were stored in', () => {
        const early = resetProgress(contextAt('2026-11-01T10:00:00Z'));
        const late = resetProgress(contextAt('2026-11-05T10:00:00Z'));

        expect(experienceEpoch([late, early])).toBe(late.occurredAt);
        expect(experienceEpoch([early, late])).toBe(late.occurredAt);
    });
});
