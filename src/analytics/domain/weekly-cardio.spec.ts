import { ExerciseId } from '@catalog/domain/exercise';
import { DomainEvent } from '@shared/domain/event';
import { voidCardio } from '@training/domain/cardio';
import { SetPerformed } from '@training/domain/set';
import {
    RUNNING,
    STAIR_CLIMBER,
    cardioAt,
    catalog,
    contextAt,
    reps,
    setAt,
} from '../../testing/fixtures';
import { weeklyCardio } from './weekly-cardio';

const NOW = new Date('2026-11-13T18:00:00Z');
const CYCLING = 'cycling' as ExerciseId;
const MINUTE = 60;

describe('weeklyCardio', () => {
    it('sums the time of all cardio exercises in the rolling 7 days', () => {
        const events = [
            cardioAt('2026-11-10T10:00:00Z', { seconds: 30 * MINUTE }),
            cardioAt('2026-11-11T10:00:00Z', { seconds: 25 * MINUTE }, CYCLING),
            cardioAt('2026-11-12T10:00:00Z', { seconds: 10 * MINUTE, kcal: 90 }, STAIR_CLIMBER),
        ];

        const result = weeklyCardio(events, catalog, NOW);

        expect(result.totalSeconds).toBe(65 * MINUTE);
        expect(result.goalSeconds).toBe(150 * MINUTE);
        expect(result.status).toBe('under');
    });

    it('bouts older than 7 days do not count', () => {
        const events = [
            cardioAt('2026-11-06T18:00:00Z', { seconds: 40 * MINUTE }), // exactly 7 days ago
            cardioAt('2026-11-06T18:01:00Z', { seconds: 20 * MINUTE }),
        ];

        expect(weeklyCardio(events, catalog, NOW).totalSeconds).toBe(20 * MINUTE);
    });

    it('target window: counts over the days it is given against the same goal', () => {
        const events = [
            cardioAt('2026-11-12T10:00:00Z', { seconds: 30 * MINUTE }),
            cardioAt('2026-11-02T10:00:00Z', { seconds: 30 * MINUTE }), // 11 days ago
        ];

        expect(weeklyCardio(events, catalog, NOW, 60, 7).totalSeconds).toBe(30 * MINUTE);
        const twoWeeks = weeklyCardio(events, catalog, NOW, 60, 14);
        expect(twoWeeks.totalSeconds).toBe(60 * MINUTE);
        expect(twoWeeks.goalSeconds).toBe(60 * MINUTE);
        expect(twoWeeks.status).toBe('reached');
    });

    it('voided bouts do not count', () => {
        const run = cardioAt('2026-11-12T10:00:00Z', { seconds: 30 * MINUTE });
        const ride = cardioAt('2026-11-12T11:00:00Z', { seconds: 20 * MINUTE }, CYCLING);
        const events = [run, ride, voidCardio(run.id, contextAt('2026-11-12T10:40:00Z'))];

        const result = weeklyCardio(events, catalog, NOW);

        expect(result.totalSeconds).toBe(20 * MINUTE);
        expect(result.byExercise).toEqual([{ exerciseId: CYCLING, seconds: 20 * MINUTE }]);
    });

    it('a bout without a time counts as 0 minutes and is reported as untimed', () => {
        const events = [
            cardioAt('2026-11-12T10:00:00Z', { seconds: 30 * MINUTE }),
            cardioAt('2026-11-12T11:00:00Z', { meters: 5000 }),
            cardioAt('2026-11-12T12:00:00Z', { kcal: 300 }, STAIR_CLIMBER),
        ];

        const result = weeklyCardio(events, catalog, NOW);

        expect(result.totalSeconds).toBe(30 * MINUTE);
        expect(result.untimedBouts).toBe(2);
        // An exercise with only untimed bouts has nothing to show in the breakdown.
        expect(result.byExercise).toEqual([{ exerciseId: RUNNING, seconds: 30 * MINUTE }]);
    });

    it('distance is never summed across exercises: the result has no total distance', () => {
        const events = [
            cardioAt('2026-11-12T10:00:00Z', { meters: 5000, seconds: 30 * MINUTE }),
            cardioAt('2026-11-12T11:00:00Z', { meters: 10000, seconds: 25 * MINUTE }, CYCLING),
        ];

        const result = weeklyCardio(events, catalog, NOW);

        expect(Object.keys(result).some((key) => /distance|meter/i.test(key))).toBe(false);
        expect(result.totalSeconds).toBe(55 * MINUTE);
    });

    it('the breakdown is per exercise, largest first', () => {
        const events = [
            cardioAt('2026-11-08T10:00:00Z', { seconds: 10 * MINUTE }, STAIR_CLIMBER),
            cardioAt('2026-11-09T10:00:00Z', { seconds: 25 * MINUTE }, CYCLING),
            cardioAt('2026-11-10T10:00:00Z', { seconds: 30 * MINUTE }),
            cardioAt('2026-11-12T10:00:00Z', { seconds: 30 * MINUTE }),
        ];

        expect(weeklyCardio(events, catalog, NOW).byExercise).toEqual([
            { exerciseId: RUNNING, seconds: 60 * MINUTE },
            { exerciseId: CYCLING, seconds: 25 * MINUTE },
            { exerciseId: STAIR_CLIMBER, seconds: 10 * MINUTE },
        ]);
    });

    it('unknown exercise ids count towards the total under "other"', () => {
        const known = cardioAt('2026-11-12T10:00:00Z', { seconds: 5 * MINUTE });
        // From a newer app version, with an exercise this one does not know.
        const luge = { ...known, id: 'luge-1', exerciseId: 'luge' } as unknown as DomainEvent;
        const kayak = {
            ...known,
            id: 'kayak-1',
            exerciseId: 'kayaking',
            durationSeconds: 20 * MINUTE,
        } as unknown as DomainEvent;

        const result = weeklyCardio([known, luge, kayak], catalog, NOW);

        expect(result.totalSeconds).toBe(30 * MINUTE);
        // "Other" stays last even when it is the largest.
        expect(result.byExercise).toEqual([
            { exerciseId: RUNNING, seconds: 5 * MINUTE },
            { exerciseId: 'other', seconds: 25 * MINUTE },
        ]);
    });

    it('cardio sets from the 0.3.0 day do not count', () => {
        // On that day cardio was logged as sets, reps standing for minutes. `performSet` refuses
        // a cardio exercise now, so the old event is built by hand.
        const lifted = setAt('2026-11-12T10:00:00Z', [reps(30, 0)]);
        const oldCardioSet: SetPerformed = {
            ...lifted,
            repGroups: [reps(30, 0, { exerciseId: RUNNING })],
        };

        const result = weeklyCardio([oldCardioSet], catalog, NOW);

        expect(result.totalSeconds).toBe(0);
        expect(result.byExercise).toEqual([]);
        expect(result.untimedBouts).toBe(0);
    });

    it('is reached exactly at the goal, and under one second below it', () => {
        const almost = [cardioAt('2026-11-12T10:00:00Z', { seconds: 150 * MINUTE - 1 })];
        const exactly = [cardioAt('2026-11-12T10:00:00Z', { seconds: 150 * MINUTE })];

        expect(weeklyCardio(almost, catalog, NOW, 150).status).toBe('under');
        expect(weeklyCardio(exactly, catalog, NOW, 150).status).toBe('reached');
        expect(weeklyCardio(almost, catalog, NOW, 45).goalSeconds).toBe(45 * MINUTE);
        expect(weeklyCardio(almost, catalog, NOW, 45).status).toBe('reached');
    });

    it('calories are the sum of the bouts that recorded them, and are absent when none did', () => {
        const withCalories = [
            cardioAt('2026-11-11T10:00:00Z', { seconds: 30 * MINUTE, kcal: 400 }),
            cardioAt('2026-11-12T10:00:00Z', { seconds: 20 * MINUTE }),
            cardioAt('2026-11-12T11:00:00Z', { kcal: 420 }, STAIR_CLIMBER),
        ];
        const without = [cardioAt('2026-11-12T10:00:00Z', { seconds: 20 * MINUTE })];

        expect(weeklyCardio(withCalories, catalog, NOW).calories).toBe(820);
        expect(weeklyCardio(without, catalog, NOW).calories).toBeUndefined();
        expect('calories' in weeklyCardio([], catalog, NOW)).toBe(false);
    });

    it('events stored out of order give the same result', () => {
        const run = cardioAt('2026-11-10T10:00:00Z', { seconds: 30 * MINUTE, kcal: 300 });
        const ride = cardioAt('2026-11-11T10:00:00Z', { seconds: 30 * MINUTE }, CYCLING);
        const climb = cardioAt('2026-11-12T10:00:00Z', { meters: 800 }, STAIR_CLIMBER);
        const voided = voidCardio(ride.id, contextAt('2026-11-11T11:00:00Z'));
        const ordered = [run, ride, voided, climb];

        expect(weeklyCardio(ordered.toReversed(), catalog, NOW)).toEqual(
            weeklyCardio(ordered, catalog, NOW),
        );
    });

    it('leaves a sauna out: it is logged like cardio but is not training (timed exercise rule)', () => {
        const events = [
            cardioAt('2026-11-12T10:00:00Z', { seconds: 30 * MINUTE }),
            cardioAt('2026-11-12T11:00:00Z', { seconds: 15 * MINUTE }, 'sauna' as ExerciseId),
        ];

        const result = weeklyCardio(events, catalog, NOW);

        expect(result.totalSeconds).toBe(30 * MINUTE);
        expect(result.byExercise.map((share) => share.exerciseId)).toEqual(['running']);
    });
});
