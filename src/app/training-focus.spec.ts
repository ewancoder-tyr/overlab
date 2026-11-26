import { recordsOf } from '@analytics/domain/records';
import { weeklyCardio } from '@analytics/domain/weekly-cardio';
import { weeklyVolume } from '@analytics/domain/weekly-volume';
import { changeTrainingFocus } from '@settings/domain/preferences';
import { DomainEvent } from '@shared/domain/event';
import { TRAINING_FOCUSES } from '@shared/domain/training-focus';
import { activeCardio } from '@training/domain/cardio';
import { activeSets } from '@training/domain/set';
import { exerciseSessions, groupIntoWorkouts } from '@training/domain/workout';
import { plannedExercises } from '@training/domain/workout-plan';
import { CURL, cardioAt, catalog, contextAt, reps, setAt } from '../testing/fixtures';

/**
 * The training focus lives here, in the composition root's tests, because it is the one place
 * that may know settings and every context it could (but must not) influence.
 */
describe('training focus', () => {
    const NOW = new Date('2026-11-13T18:00:00Z');
    const history: readonly DomainEvent[] = [
        setAt('2026-11-09T10:00:00Z', [reps(8, 20)]),
        cardioAt('2026-11-09T10:30:00Z', { meters: 5000, seconds: 1800 }),
        setAt('2026-11-11T10:00:00Z', [reps(9, 20)]),
        cardioAt('2026-11-11T10:30:00Z', { meters: 5200, seconds: 1800 }),
        setAt('2026-11-13T10:00:00Z', [reps(8, 22.5)]),
    ];

    /** Everything the app projects from the log that the focus could be suspected of changing. */
    function project(events: readonly DomainEvent[]): unknown {
        const sets = activeSets(events);
        const workouts = groupIntoWorkouts(sets, activeCardio(events));
        return {
            volume: weeklyVolume(sets, catalog, NOW),
            cardio: weeklyCardio(events, catalog, NOW),
            records: [...recordsOf(exerciseSessions(workouts, CURL), catalog)],
            plan: plannedExercises(workouts, 1),
        };
    }

    it.each(TRAINING_FOCUSES)(
        'changes nothing that is projected: weekly volume, records and the plan are the same under focus %s',
        (focus) => {
            const result = changeTrainingFocus(focus, contextAt('2026-11-12T09:00:00Z'));
            if (!result.ok) {
                throw new Error('Test fixture is invalid');
            }

            expect(project([...history, result.value])).toEqual(project(history));
        },
    );
});
