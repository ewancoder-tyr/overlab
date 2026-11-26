import { TITLES, titleOf } from './title';

describe('level titles', () => {
    it('has a title for every level from 1 to 30, each different', () => {
        expect(TITLES).toHaveLength(30);
        expect(new Set(TITLES.map((title) => title.en)).size).toBe(30);
        expect(new Set(TITLES.map((title) => title.ru)).size).toBe(30);
    });

    it('starts as fresh meat and ends as a legend', () => {
        expect(titleOf(1).en).toBe('Fresh Meat');
        expect(titleOf(30).en).toBe('Legend of the Lab');
    });

    it('keeps the last title beyond level 30', () => {
        expect(titleOf(31)).toEqual(titleOf(30));
        expect(titleOf(99)).toEqual(titleOf(30));
    });
});
