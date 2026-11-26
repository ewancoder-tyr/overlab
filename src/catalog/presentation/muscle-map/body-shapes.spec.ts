import { MUSCLE_GROUPS } from '@catalog/domain/muscle-group';
import { BODY_SHAPES } from './body-shapes';

describe('muscle map', () => {
    it('draws every muscle group', () => {
        const drawn = new Set(BODY_SHAPES.map((shape) => shape.muscleGroupId));

        expect(MUSCLE_GROUPS.filter((group) => !drawn.has(group.id))).toEqual([]);
    });
});
