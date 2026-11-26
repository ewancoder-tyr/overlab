import { ExerciseId } from '@catalog/domain/exercise';
import { CURL, DEADLIFT, RUNNING, catalog } from '../../../testing/fixtures';
import { trainList } from './train-list';

const CYCLING = 'cycling' as ExerciseId;

describe('trainList', () => {
    const favorites = new Set([CURL, RUNNING, CYCLING]);

    it('lists every favorite with focus both', () => {
        expect(trainList([], [], favorites, catalog, 'both').favorites).toEqual(
            expect.arrayContaining([CURL, RUNNING, CYCLING]),
        );
    });

    it('hides cardio favorites with focus lifting, and lifting favorites with focus cardio', () => {
        expect(trainList([], [], favorites, catalog, 'lifting').favorites).toEqual([CURL]);
        expect(trainList([], [], favorites, catalog, 'cardio').favorites).toEqual(
            expect.arrayContaining([RUNNING, CYCLING]),
        );
        expect(trainList([], [], favorites, catalog, 'cardio').favorites).not.toContain(CURL);
    });

    it('keeps a planned exercise that the focus hides', () => {
        const list = trainList([DEADLIFT, RUNNING], [], favorites, catalog, 'cardio');

        expect(list.planned).toEqual([DEADLIFT, RUNNING]);
        expect(list.favorites).toEqual([CYCLING]);
        expect(trainList([RUNNING], [], favorites, catalog, 'lifting').planned).toEqual([RUNNING]);
    });

    it('keeps an exercise done in the workout in progress that the focus hides', () => {
        const list = trainList([RUNNING], [RUNNING, CURL], favorites, catalog, 'cardio');

        expect(list.planned).toEqual([RUNNING, CURL]);
        expect(list.favorites).not.toContain(CURL);
    });

    it('puts started exercises on top in the order started, then the rest of the plan', () => {
        const plan = [DEADLIFT, CURL, RUNNING];

        // Started the run first, then curls; the deadlift is still to do.
        expect(trainList(plan, [RUNNING, CURL], favorites, catalog, 'both').planned).toEqual([
            RUNNING,
            CURL,
            DEADLIFT,
        ]);
        // An unplanned favorite started today is listed among the started ones too.
        expect(trainList([DEADLIFT], [CYCLING], favorites, catalog, 'both').planned).toEqual([
            CYCLING,
            DEADLIFT,
        ]);
    });

    it('pins standalone habits on top in catalog order, and not again among the favorites', () => {
        const list = trainList([DEADLIFT], [], favorites, catalog, 'both', [RUNNING, CURL]);

        expect(list.standalone).toEqual([CURL, RUNNING]);
        expect(list.favorites).toEqual([CYCLING]);
    });

    it('lists an exercise that is both a habit and planned in both places', () => {
        const list = trainList([CURL], [], favorites, catalog, 'both', [CURL]);

        expect(list.standalone).toEqual([CURL]);
        expect(list.planned).toEqual([CURL]);
    });

    it('keeps a standalone habit that the focus hides', () => {
        expect(trainList([], [], favorites, catalog, 'cardio', [CURL]).standalone).toEqual([CURL]);
    });
});
