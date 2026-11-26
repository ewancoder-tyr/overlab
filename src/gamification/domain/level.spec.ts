import { CHARACTER_SCALE, experienceFor, levelOf } from './level';

describe('level curve', () => {
    it('starts at level 1 with no experience', () => {
        expect(levelOf(0, CHARACTER_SCALE)).toEqual({
            level: 1,
            xp: 0,
            levelStart: 0,
            nextLevelAt: 50,
        });
    });

    it('needs scale × (level − 1)² in total, so each level costs more than the last', () => {
        expect([2, 3, 10, 30].map((level) => experienceFor(level, CHARACTER_SCALE))).toEqual([
            50, 200, 4050, 42050,
        ]);
    });

    it('reaches a level exactly at its threshold, not a point before', () => {
        expect(levelOf(4049, CHARACTER_SCALE).level).toBe(9);
        expect(levelOf(4050, CHARACTER_SCALE).level).toBe(10);
    });

    it('works with fractional experience from split sets', () => {
        const progress = levelOf(52.5, CHARACTER_SCALE);

        expect(progress.level).toBe(2);
        expect(progress.nextLevelAt).toBe(200);
    });
});
