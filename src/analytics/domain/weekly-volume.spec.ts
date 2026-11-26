import { MuscleGroupId } from '@catalog/domain/muscle-group';
import { ExerciseId } from '@catalog/domain/exercise';
import { SetPerformed } from '@training/domain/set';
import { CURL, DEADLIFT, HAMMER_CURL, catalog, reps, setAt } from '../../testing/fixtures';
import {
    ExerciseVolume,
    MuscleVolume,
    volumeStatus,
    volumeTarget,
    weeklyVolume,
} from './weekly-volume';

const NOW = new Date('2026-11-11T18:00:00Z');

function volumeOf(sets: readonly SetPerformed[], muscle: MuscleGroupId): MuscleVolume {
    const volume = weeklyVolume(sets, catalog, NOW).find(
        (entry) => entry.muscleGroup.id === muscle,
    );
    if (volume === undefined) {
        throw new Error(`No volume entry for ${muscle}`);
    }
    return volume;
}

describe('weeklyVolume', () => {
    it('counts a working set as its involvement ratio for every muscle the exercise involves', () => {
        const sets = [setAt('2026-11-11T10:00:00Z', [reps(5, 100, { exerciseId: DEADLIFT })])];

        expect(volumeOf(sets, 'glutes').sets).toBe(1);
        expect(volumeOf(sets, 'hamstrings').sets).toBe(0.6);
        expect(volumeOf(sets, 'back').sets).toBe(0.5);
        expect(volumeOf(sets, 'chest').sets).toBe(0);
    });

    it('adds up sets across exercises that involve the same muscle', () => {
        const sets = [
            setAt('2026-11-10T10:00:00Z', [reps(8, 20)]), // biceps 1
            setAt('2026-11-10T10:05:00Z', [reps(8, 20)]), // biceps 1
            setAt('2026-11-11T10:00:00Z', [reps(8, 16, { exerciseId: HAMMER_CURL })]), // biceps 0.8
        ];

        expect(volumeOf(sets, 'biceps').sets).toBe(2.8);
        expect(volumeOf(sets, 'biceps').reps).toBe(22); // 8 + 8 + 8 * 0.8, rounded
    });

    it('covers a rolling 7 days: sets older than that no longer count', () => {
        const sets = [
            setAt('2026-11-04T18:00:00Z', [reps(8, 20)]), // exactly 7 days ago: out
            setAt('2026-11-04T18:00:01Z', [reps(8, 20)]), // one second later: in
        ];

        expect(volumeOf(sets, 'biceps').sets).toBe(1);
    });

    it('target window: counts over the days it is given, unscaled, so 14 days is a two-week target', () => {
        const sets = [
            setAt('2026-11-10T10:00:00Z', [reps(8, 20)]), // 1 day ago: in both
            setAt('2026-11-01T10:00:00Z', [reps(8, 20)]), // 10 days ago: only in 14
            setAt('2026-10-28T18:00:00Z', [reps(8, 20)]), // exactly 14 days ago: out
        ];
        const target = volumeTarget(2);
        const over = (days: number): MuscleVolume | undefined =>
            weeklyVolume(sets, catalog, NOW, target, 0.5, days).find(
                (entry) => entry.muscleGroup.id === 'biceps',
            );

        expect(over(7)?.sets).toBe(1);
        expect(over(7)?.status).toBe('under');
        expect(over(14)?.sets).toBe(2);
        // The target is the same number at 14 days: nothing is scaled to a per-week average.
        expect(over(14)?.target).toEqual({ minSets: 2, maxSets: 4 });
        expect(over(14)?.status).toBe('within');
    });

    it('counts a light set as half a set, and its reps in full', () => {
        const sets = [
            setAt('2026-11-11T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-11T10:05:00Z', [reps(8, 12)], { effort: { kind: 'light' } }),
            setAt('2026-11-11T10:10:00Z', [reps(6, 20)], { effort: { kind: 'failure' } }),
        ];

        expect(volumeOf(sets, 'biceps').sets).toBe(2.5);
        expect(volumeOf(sets, 'biceps').reps).toBe(22);
    });

    it('counts a light set as the chosen light set weight: 0 like a warm-up, 1 like any set', () => {
        const sets = [
            setAt('2026-11-11T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-11T10:05:00Z', [reps(8, 12)], { effort: { kind: 'light' } }),
        ];
        const biceps = (weight: number): number =>
            weeklyVolume(sets, catalog, NOW, volumeTarget(10), weight).find(
                (entry) => entry.muscleGroup.id === 'biceps',
            )?.sets ?? Number.NaN;

        expect(biceps(0)).toBe(1);
        expect(biceps(0.3)).toBe(1.3);
        expect(biceps(1)).toBe(2);
    });

    it('the volume breakdown lists each exercise weighted sets, largest first, adding up to the total', () => {
        const sets = [
            setAt('2026-11-10T10:00:00Z', [reps(8, 16, { exerciseId: HAMMER_CURL })]),
            setAt('2026-11-10T10:05:00Z', [reps(8, 20)]),
            setAt('2026-11-11T10:00:00Z', [reps(8, 20)]),
        ];
        const biceps = volumeOf(sets, 'biceps');

        expect(biceps.byExercise).toEqual([
            { exerciseId: CURL, sets: 2 },
            { exerciseId: HAMMER_CURL, sets: 0.8 },
        ]);
        expect(biceps.byExercise.reduce((sum, entry) => sum + entry.sets, 0)).toBe(biceps.sets);
        expect(volumeOf(sets, 'chest').byExercise).toEqual([]);
    });

    it('splits a mixed-exercise set between its exercises in the breakdown', () => {
        const sets = [
            setAt('2026-11-11T10:00:00Z', [reps(4, 20), reps(4, 20, { exerciseId: HAMMER_CURL })]),
        ];

        expect(volumeOf(sets, 'biceps').byExercise).toEqual([
            { exerciseId: CURL, sets: 0.5 },
            { exerciseId: HAMMER_CURL, sets: 0.4 },
        ]);
    });

    it('light sets enter the breakdown at the light set weight, and not at all at 0', () => {
        const sets = [
            setAt('2026-11-11T10:00:00Z', [reps(8, 20)], { effort: { kind: 'light' } }),
            setAt('2026-11-11T10:05:00Z', [reps(8, 16, { exerciseId: HAMMER_CURL })], {
                effort: { kind: 'light' },
            }),
        ];
        const byExercise = (weight: number): readonly ExerciseVolume[] | undefined =>
            weeklyVolume(sets, catalog, NOW, volumeTarget(10), weight).find(
                (entry) => entry.muscleGroup.id === 'biceps',
            )?.byExercise;

        expect(byExercise(0.5)).toEqual([
            { exerciseId: CURL, sets: 0.5 },
            { exerciseId: HAMMER_CURL, sets: 0.4 },
        ]);
        expect(byExercise(0)).toEqual([]);
    });

    it('excludes warm-up sets', () => {
        const sets = [
            setAt('2026-11-11T10:00:00Z', [reps(10, 10)], { kind: 'warmup' }),
            setAt('2026-11-11T10:05:00Z', [reps(8, 20)]),
        ];

        expect(volumeOf(sets, 'biceps').sets).toBe(1);
    });

    it('splits a mixed-exercise set by each exercise share of its reps', () => {
        // Half curl (biceps 1, forearms 0.3), half hammer curl (biceps 0.8, forearms 0.7).
        const sets = [
            setAt('2026-11-11T10:00:00Z', [reps(4, 20), reps(4, 20, { exerciseId: HAMMER_CURL })]),
        ];

        expect(volumeOf(sets, 'biceps').sets).toBe(0.9);
        expect(volumeOf(sets, 'forearms').sets).toBe(0.5);
    });

    it('counts a cardio exercise for no muscle group', () => {
        // Cardio is its own event now, which `weeklyVolume` never sees. But for one day in
        // November 2026 a run was logged as a set (22 "reps" for 2.2 miles), and such sets are
        // still in people's logs. The factory refuses them today, so this one is built by hand.
        const run: SetPerformed = {
            ...setAt('2026-11-11T10:00:00Z', [reps(8, 20)]),
            repGroups: [reps(22, 0, { exerciseId: 'running' as ExerciseId })],
        };

        const volumes = weeklyVolume([run], catalog, NOW);

        expect(volumes.every((volume) => volume.sets === 0 && volume.reps === 0)).toBe(true);
    });

    it('skips rep groups whose exercise is not in the catalog', () => {
        const known = setAt('2026-11-11T10:00:00Z', [reps(8, 20)]);
        const unknown: SetPerformed = {
            ...known,
            repGroups: [reps(8, 20, { exerciseId: 'from-another-device' as ExerciseId })],
        };

        expect(() => weeklyVolume([unknown], catalog, NOW)).not.toThrow();
        expect(volumeOf([unknown], 'biceps').sets).toBe(0);
    });

    it('reports every muscle group, including untouched ones', () => {
        expect(weeklyVolume([], catalog, NOW)).toHaveLength(15);
    });

    it('flags each muscle group as under, within or over its target', () => {
        const target = { minSets: 10, maxSets: 20 };

        expect(volumeStatus(9.9, target)).toBe('under');
        expect(volumeStatus(10, target)).toBe('within');
        expect(volumeStatus(20, target)).toBe('within');
        expect(volumeStatus(20.1, target)).toBe('over');
        expect(volumeOf([setAt('2026-11-11T10:00:00Z', [reps(8, 20)])], 'biceps').status).toBe(
            'under',
        );
    });

    it('a volume target of 8 makes the range 8 to 16, so 17 sets are over and 8 sets within', () => {
        const target = volumeTarget(8);

        expect(target).toEqual({ minSets: 8, maxSets: 16 });
        expect(volumeStatus(17, target)).toBe('over');
        expect(volumeStatus(8, target)).toBe('within');
        expect(volumeStatus(7.9, target)).toBe('under');
    });

    it('the default target of 10 gives the range 10 to 20', () => {
        expect(volumeTarget(10)).toEqual({ minSets: 10, maxSets: 20 });
    });

    it('applies the target it is given to every muscle group', () => {
        const sets = Array.from({ length: 8 }, (_, index) =>
            setAt(`2026-11-11T10:0${String(index)}:00Z`, [reps(8, 20)]),
        );

        const volumes = weeklyVolume(sets, catalog, NOW, volumeTarget(8));

        expect(volumes.every((volume) => volume.target.maxSets === 16)).toBe(true);
        expect(volumes.find((volume) => volume.muscleGroup.id === 'biceps')?.status).toBe('within');
    });
});
