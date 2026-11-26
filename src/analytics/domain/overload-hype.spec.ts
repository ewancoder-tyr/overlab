import { ExerciseId } from '@catalog/domain/exercise';
import { SetPerformed } from '@training/domain/set';
import { exercisesOf, groupIntoWorkouts, standaloneSessions } from '@training/domain/workout';
import {
    CURL,
    DEADLIFT,
    PARTIAL,
    PULL_UP,
    RUNNING,
    STAIR_CLIMBER,
    cardioAt,
    catalog,
    reps,
    setAt,
} from '../../testing/fixtures';
import { overloadHype, soloHype } from './overload-hype';

const CYCLING = 'cycling' as ExerciseId;

const BENCH = 'bench-press' as ExerciseId;
const T = '2026-11-11T10:00:00Z';

/** The hype for repeating one workout: every exercise of it is planned. */
const hype = (sets: readonly SetPerformed[]): ReturnType<typeof overloadHype> => {
    const workouts = groupIntoWorkouts(sets);
    const workout = workouts[0];
    return overloadHype(workout === undefined ? [] : exercisesOf(workout), workouts, catalog, 'en');
};

describe('overloadHype', () => {
    it('pushes a loaded exercise by weight: 25 kg last time, 30 kg today', () => {
        const sets = [setAt(T, [reps(8, 25, { exerciseId: BENCH })])];

        expect(hype(sets)).toEqual([
            { exercise: 'Bench press', last: '25 kg', target: '30 kg', cardio: false },
        ]);
    });

    it('pushes a bodyweight exercise by reps: 10 last time, 11 today', () => {
        const sets = [setAt(T, [reps(10, 0, { exerciseId: PULL_UP })])];

        expect(hype(sets)).toEqual([
            { exercise: 'Pull-up', last: '10 reps', target: '11 reps', cardio: false },
        ]);
    });

    it('asks cardio to match last time, distance (or calories) with its time, not to beat it', () => {
        const workouts = groupIntoWorkouts(
            [],
            [
                cardioAt(T, { meters: 5000, seconds: 1800, kcal: 400 }),
                cardioAt(T, { seconds: 1200, kcal: 200 }, STAIR_CLIMBER),
                cardioAt(T, { seconds: 1500 }, CYCLING),
            ],
        );

        const match = (words: string): { last: string; target: string; cardio: true } => ({
            last: words,
            target: words,
            cardio: true,
        });
        expect(overloadHype([RUNNING, STAIR_CLIMBER, CYCLING], workouts, catalog, 'en')).toEqual([
            { exercise: 'Running', ...match('5 km in 30:00') },
            { exercise: 'Stair climber', ...match('200 kcal in 20:00') },
            { exercise: 'Cycling', ...match('25:00') },
        ]);
    });

    it('moves per-side loads in smaller steps and says they are per side', () => {
        const sets = [setAt(T, [reps(10, 12.5)])]; // Bicep curl: dumbbells.

        expect(hype(sets)).toEqual([
            {
                exercise: 'Bicep curl',
                last: '12.5 kg per side',
                target: '15 kg per side',
                cardio: false,
            },
        ]);
    });

    it('jumps by 10 lb when the load was logged in pounds', () => {
        const sets = [setAt(T, [reps(5, 135, { exerciseId: BENCH, unit: 'lb' })])];

        expect(hype(sets)[0]).toMatchObject({ last: '135 lb', target: '145 lb' });
    });

    it('quotes the heaviest set, and among equally heavy sets the one with most reps', () => {
        const sets = [
            setAt(T, [reps(10, 20, { exerciseId: BENCH })]),
            setAt(T, [reps(6, 25, { exerciseId: BENCH })]),
            setAt(T, [reps(7, 0, { exerciseId: PULL_UP })]),
            setAt(T, [reps(9, 0, { exerciseId: PULL_UP })]),
        ];

        expect(hype(sets)).toEqual([
            { exercise: 'Bench press', last: '25 kg', target: '30 kg', cardio: false },
            { exercise: 'Pull-up', last: '9 reps', target: '10 reps', cardio: false },
        ]);
    });

    it('ignores warm-up sets and partial reps', () => {
        const sets = [
            setAt(T, [reps(10, 40, { exerciseId: BENCH })], { kind: 'warmup' }),
            setAt(T, [reps(6, 25, { exerciseId: BENCH })]),
            setAt(T, [reps(5, 30, { exerciseId: CURL, technique: PARTIAL })]),
        ];

        expect(hype(sets)).toEqual([
            { exercise: 'Bench press', last: '25 kg', target: '30 kg', cardio: false },
        ]);
    });

    it('says "1 rep" in the singular', () => {
        const sets = [setAt(T, [reps(1, 0, { exerciseId: PULL_UP })])];

        expect(hype(sets)[0]).toMatchObject({ last: '1 rep', target: '2 reps' });
    });

    it("words the lines in the user's language, with its units and decimal comma", () => {
        const workouts = groupIntoWorkouts(
            [setAt(T, [reps(10, 12.5)]), setAt(T, [reps(4, 0, { exerciseId: PULL_UP })])],
            [cardioAt(T, { meters: 5000, seconds: 1800 })],
        );

        expect(overloadHype([CURL, PULL_UP, RUNNING], workouts, catalog, 'ru')).toEqual([
            {
                exercise: 'Подъём на бицепс',
                last: '12,5 кг на руку',
                target: '15 кг на руку',
                cardio: false,
            },
            { exercise: 'Подтягивания', last: '4 повтора', target: '5 повторов', cardio: false },
            { exercise: 'Бег', last: '5 км за 30:00', target: '5 км за 30:00', cardio: true },
        ]);
    });

    it('only hypes planned exercises: no deadlift roast on a day without deadlift', () => {
        const workouts = groupIntoWorkouts([
            setAt('2026-11-09T10:00:00Z', [reps(5, 100, { exerciseId: DEADLIFT })]),
            setAt('2026-11-11T10:00:00Z', [reps(8, 25, { exerciseId: BENCH })]),
        ]);

        expect(overloadHype([BENCH], workouts, catalog, 'en')).toEqual([
            { exercise: 'Bench press', last: '25 kg', target: '30 kg', cardio: false },
        ]);
    });

    it('quotes the last time the exercise was done, in whatever workout that was', () => {
        const workouts = groupIntoWorkouts([
            // Workout A: deadlift and curls.
            setAt('2026-11-07T10:00:00Z', [reps(5, 100, { exerciseId: DEADLIFT })]),
            setAt('2026-11-07T10:05:00Z', [reps(10, 10)]),
            // Workouts B and C: no deadlift, heavier curls each time.
            setAt('2026-11-09T10:00:00Z', [reps(10, 12.5)]),
            setAt('2026-11-11T10:00:00Z', [reps(10, 15)]),
        ]);

        // Workout A is up again: deadlift from three workouts ago, curls from the last one.
        expect(overloadHype([DEADLIFT, CURL], workouts, catalog, 'en')).toEqual([
            { exercise: 'Deadlift', last: '100 kg', target: '105 kg', cardio: false },
            {
                exercise: 'Bicep curl',
                last: '15 kg per side',
                target: '17.5 kg per side',
                cardio: false,
            },
        ]);
    });

    it('has nothing to say without a plan or without history', () => {
        expect(overloadHype([], [], catalog, 'en')).toEqual([]);
        expect(overloadHype([BENCH], [], catalog, 'en')).toEqual([]);
    });
});

describe('soloHype', () => {
    const pullUp = catalog.findExercise(PULL_UP);
    const running = catalog.findExercise(RUNNING);
    if (pullUp === undefined || running === undefined) {
        throw new Error('Test fixture is invalid: the catalog lacks an exercise');
    }

    it('quotes the latest standalone session, never the gym: 10 at home, not 30 at the gym', () => {
        const sets = [
            setAt('2026-11-10T07:00:00Z', [reps(8, 0, { exerciseId: PULL_UP })], {
                standalone: true,
            }),
            setAt('2026-11-11T07:00:00Z', [reps(10, 0, { exerciseId: PULL_UP })], {
                standalone: true,
            }),
            setAt('2026-11-11T18:00:00Z', [reps(30, 0, { exerciseId: PULL_UP })]),
        ];

        expect(soloHype(pullUp, standaloneSessions(sets, PULL_UP), 'en')).toEqual({
            exercise: 'Pull-up',
            last: '10 reps',
            target: '11 reps',
            cardio: false,
        });
    });

    it('has nothing to say before the first standalone set, and never for cardio', () => {
        const gymOnly = [setAt(T, [reps(30, 0, { exerciseId: PULL_UP })])];

        expect(soloHype(pullUp, standaloneSessions(gymOnly, PULL_UP), 'en')).toBeUndefined();
        expect(soloHype(running, [], 'en')).toBeUndefined();
    });
});
