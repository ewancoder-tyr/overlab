import { ExerciseId } from '@catalog/domain/exercise';
import { MuscleGroupId } from '@catalog/domain/muscle-group';
import { SetPerformed } from '@training/domain/set';
import { CURL, HAMMER_CURL, RUNNING, catalog, reps, setAt } from '../../testing/fixtures';
import { MuscleStall, couldAdd, muscleStalls, topStall, volumeAdvice } from './muscle-stall';
import { volumeTarget, weeklyVolume } from './weekly-volume';

const NOW = new Date('2026-11-11T18:00:00Z');
const BENCH = 'bench-press' as ExerciseId;
const DIP = 'dip' as ExerciseId;
const PEC_DECK = 'pec-deck' as ExerciseId;
const LATERAL_RAISE = 'lateral-raise' as ExerciseId;

/** `count` working sets of `exerciseId` yesterday. */
function sets(exerciseId: ExerciseId, count: number): readonly SetPerformed[] {
    return Array.from({ length: count }, (_, index) =>
        setAt(`2026-11-10T10:${String(10 + index).padStart(2, '0')}:00Z`, [
            reps(8, 20, { exerciseId }),
        ]),
    );
}

function stallsOf(
    logged: readonly SetPerformed[],
    stalled: readonly ExerciseId[],
    stallInvolvement?: number,
    minSets = 10,
): readonly MuscleStall[] {
    return muscleStalls(
        weeklyVolume(logged, catalog, NOW, volumeTarget(minSets)),
        new Set(stalled),
        catalog,
        stallInvolvement,
    );
}

function marked(stalls: readonly MuscleStall[]): readonly MuscleGroupId[] {
    return stalls.map((stall) => stall.volume.muscleGroup.id);
}

describe('stalled muscle group', () => {
    it('one stalled exercise marks the muscle group it trains directly', () => {
        const stalls = stallsOf([...sets(BENCH, 3), ...sets(PEC_DECK, 3)], [BENCH]);

        expect(marked(stalls)).toEqual(['chest']);
        expect(stalls[0]?.stalled.map((entry) => entry.exerciseId)).toEqual([BENCH]);
        expect(stalls[0]?.direct.map((entry) => entry.exerciseId)).toEqual([BENCH, PEC_DECK]);
    });

    it('a stalled exercise does not mark the muscle groups it only assists (0.5 is not more than half)', () => {
        // Bench press: chest 1, triceps 0.5, front delts 0.5.
        expect(marked(stallsOf(sets(BENCH, 3), [BENCH]))).toEqual(['chest']);
    });

    it('a stalled exercise marks every muscle group it involves by more than the stall involvement', () => {
        // Dip: chest 0.8, triceps 0.8, front delts 0.4.
        expect(marked(stallsOf(sets(DIP, 3), [DIP]))).toEqual(['chest', 'triceps']);
        // At 0, every muscle group the exercise involves.
        expect(marked(stallsOf(sets(BENCH, 3), [BENCH], 0))).toEqual([
            'chest',
            'front-delts',
            'triceps',
        ]);
        // At 0.8 (more than 80%), the dip marks nothing; the bench press still marks chest.
        expect(marked(stallsOf([...sets(DIP, 3), ...sets(BENCH, 3)], [DIP, BENCH], 0.8))).toEqual([
            'chest',
        ]);
    });

    it('a stalled exercise not trained in the last 7 days marks nothing', () => {
        const lastMonth = [setAt('2026-10-10T10:00:00Z', [reps(8, 20, { exerciseId: BENCH })])];

        expect(stallsOf(lastMonth, [BENCH])).toEqual([]);
    });

    it('a stalled cardio exercise marks nothing', () => {
        expect(stallsOf(sets(BENCH, 3), [RUNNING])).toEqual([]);
    });

    it('with the stall threshold off, nothing is stalled, so no muscle group is marked', () => {
        expect(stallsOf(sets(BENCH, 3), [])).toEqual([]);
    });
});

describe('volume advice', () => {
    it('under target and stalled: add sets, even while other exercises progress', () => {
        expect(volumeAdvice('under', false)).toBe('add-sets');
        expect(volumeAdvice('under', true)).toBe('add-sets');

        const [chest] = stallsOf([...sets(BENCH, 3), ...sets(PEC_DECK, 3)], [BENCH]);
        expect(chest?.advice).toBe('add-sets');
    });

    it('within target and every direct exercise stalled: room to add', () => {
        const [chest] = stallsOf(sets(BENCH, 12), [BENCH]);

        expect(chest?.advice).toBe('room-to-add');
    });

    it('over target and every direct exercise stalled: back off', () => {
        const [chest] = stallsOf(sets(BENCH, 9), [BENCH], undefined, 4); // 4 to 8

        expect(chest?.volume.status).toBe('over');
        expect(chest?.advice).toBe('back-off');
    });

    it('within or over target with another direct exercise not stalled: only the exercise is named', () => {
        expect(volumeAdvice('within', false)).toBe('exercise');
        expect(volumeAdvice('over', false)).toBe('exercise');

        const [chest] = stallsOf([...sets(BENCH, 6), ...sets(PEC_DECK, 6)], [BENCH]);
        expect(chest?.advice).toBe('exercise');
    });

    it('under target with nothing stalled: no advice', () => {
        expect(stallsOf(sets(BENCH, 3), [])).toEqual([]);
    });

    it('the top advice prefers add sets, the largest shortfall first', () => {
        const stalls = stallsOf(
            [
                ...sets(BENCH, 12), // chest within, all stalled: room to add
                ...sets(LATERAL_RAISE, 2), // side delts under by 8
                ...sets(CURL, 6), // biceps under by 4
            ],
            [BENCH, LATERAL_RAISE, CURL],
        );

        expect(stalls.map((stall) => stall.advice)).toEqual([
            'room-to-add',
            'add-sets',
            'add-sets',
        ]);
        expect(topStall(stalls)?.volume.muscleGroup.id).toBe('side-delts');
        expect(topStall([])).toBeUndefined();
    });
});

describe('couldAdd', () => {
    it('offers favorites that train the muscle directly and are not done this week, strongest first', () => {
        const favorites = new Set([HAMMER_CURL, CURL, BENCH, 'preacher-curl' as ExerciseId]);
        const trained = [{ exerciseId: CURL, sets: 3 }];

        // Hammer curl (biceps 0.8) after preacher curl (1); bench press trains no biceps.
        expect(couldAdd('biceps', trained, favorites, catalog)).toEqual([
            'preacher-curl',
            HAMMER_CURL,
        ]);
        expect(couldAdd('biceps', trained, favorites, catalog, 0.8)).toEqual(['preacher-curl']);
        expect(couldAdd('biceps', trained, favorites, catalog, 0.5, 1)).toEqual(['preacher-curl']);
    });
});
