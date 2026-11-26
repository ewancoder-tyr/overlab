import { groupIntoWorkouts } from '@training/domain/workout';
import { SetPerformed } from '@training/domain/set';
import { CURL, HAMMER_CURL, catalog, reps, setAt } from '../../testing/fixtures';
import { Experience, experience } from './experience';
import { experienceGain } from './experience-gain';

const RULES = { lightSetWeight: 0.5, stallThreshold: 3 };

const xp = (sets: readonly SetPerformed[]): Experience =>
    experience(groupIntoWorkouts(sets), catalog, undefined, RULES);

const curl = (minute: number, load = 20, count = 8): SetPerformed =>
    setAt(`2026-11-01T10:${String(minute).padStart(2, '0')}:00Z`, [reps(count, load)]);

describe('experienceGain', () => {
    it('names the experience earned and the exercise that earned it', () => {
        const before = xp([curl(0)]);
        const after = xp([curl(0), curl(5)]);

        expect(experienceGain(before, after)).toEqual({
            xp: 10,
            exerciseId: CURL,
            levelUp: undefined,
            exerciseLevelUps: [],
            reasons: [{ reason: 'set', xp: 10 }],
        });
    });

    it('celebrates nothing when experience went down or stayed', () => {
        const one = xp([curl(0)]);
        const two = xp([curl(0), curl(5)]);

        expect(experienceGain(two, one)).toBeUndefined();
        expect(experienceGain(one, one)).toBeUndefined();
    });

    it('reports a new level of the character and of an exercise', () => {
        // Five sets are 50 XP: level 2 of the character. The first set is level 2 of the curl.
        const sets = [0, 5, 10, 15, 20].map((minute) => curl(minute));
        const gain = experienceGain(xp(sets.slice(0, 4)), xp(sets));

        expect(gain?.levelUp).toBe(2);
        expect(experienceGain(xp([]), xp([curl(0)]))?.exerciseLevelUps).toEqual([
            { exerciseId: CURL, level: 2 },
        ]);
        expect(gain?.exerciseLevelUps).toEqual([]);
    });

    it('says what the experience was for, proudest reason first', () => {
        const before = xp([curl(0)]);
        // Two days later and heavier: a weight record that also beats last time.
        const after = xp([curl(0), setAt('2026-11-03T10:00:00Z', [reps(8, 22)])]);

        expect(experienceGain(before, after)?.reasons).toEqual([
            { reason: 'weight-record', xp: 50 },
            { reason: 'beaten', xp: 30 },
            { reason: 'set', xp: 10 },
        ]);
    });

    it('names the exercise that earned the most when several did', () => {
        const hammer = setAt('2026-11-01T10:30:00Z', [
            reps(2, 10),
            reps(6, 10, { exerciseId: HAMMER_CURL }),
        ]);

        expect(experienceGain(xp([curl(0)]), xp([curl(0), hammer]))?.exerciseId).toBe(HAMMER_CURL);
    });
});
