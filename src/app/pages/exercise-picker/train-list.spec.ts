import { ExerciseId } from '@catalog/domain/exercise';
import { CURL, DEADLIFT, PULL_UP, RUNNING, catalog } from '../../../testing/fixtures';
import { ListedProgram, trainList } from './train-list';

const CYCLING = 'cycling' as ExerciseId;

const program = (exercises: readonly ExerciseId[], chosen = false): ListedProgram => ({
    id: 'split',
    solo: false,
    chosen,
    exercises,
});
const solo = (exercises: readonly ExerciseId[], id = 'morning'): ListedProgram => ({
    id,
    solo: true,
    chosen: false,
    exercises,
});

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

    it('keeps a program exercise that the focus hides', () => {
        const list = trainList([program([DEADLIFT, RUNNING])], [], favorites, catalog, 'cardio');

        expect(list.programs.get('split')).toEqual([DEADLIFT, RUNNING]);
        expect(list.favorites).toEqual([CYCLING]);
    });

    it('puts what was started on top of the program the workout belongs to, in the order started', () => {
        const list = trainList(
            [program([CURL, DEADLIFT, RUNNING], true)],
            [DEADLIFT, PULL_UP],
            favorites,
            catalog,
            'both',
        );

        expect(list.programs.get('split')).toEqual([DEADLIFT, PULL_UP, CURL, RUNNING]);
        expect(list.thisWorkout).toEqual([]);
    });

    it('gives a workout that is no program day a list of its own, leaving programs as they are', () => {
        const list = trainList(
            [program([CURL, DEADLIFT])],
            [PULL_UP, CURL],
            favorites,
            catalog,
            'both',
        );

        expect(list.thisWorkout).toEqual([PULL_UP, CURL]);
        expect(list.programs.get('split')).toEqual([CURL, DEADLIFT]);
    });

    it('lists the exercises of the solo programs once each, and never among the favorites', () => {
        const list = trainList(
            [solo([CURL, PULL_UP]), solo([PULL_UP], 'evening'), program([CURL])],
            [],
            favorites,
            catalog,
            'both',
        );

        expect(list.solo).toEqual([CURL, PULL_UP]);
        expect(list.programs.get('split')).toEqual([CURL]);
        expect(list.favorites).not.toContain(CURL);
    });
});
