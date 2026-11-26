import { formatNumber, isLanguage, plural } from './language';

const SETS = { one: 'подход', few: 'подхода', many: 'подходов', other: 'подхода' };

describe('language', () => {
    it('knows English and Russian and nothing else', () => {
        expect(isLanguage('en')).toBe(true);
        expect(isLanguage('ru')).toBe(true);
        expect(isLanguage('de')).toBe(false);
        expect(isLanguage(undefined)).toBe(false);
    });

    it('picks the Russian word form by the last digits of the count', () => {
        expect([1, 21, 2, 4, 22, 5, 11, 12, 25].map((n) => plural('ru', n, SETS))).toEqual([
            'подход',
            'подход',
            'подхода',
            'подхода',
            'подхода',
            'подходов',
            'подходов',
            'подходов',
            'подходов',
        ]);
        expect(plural('ru', 1.5, SETS)).toBe('подхода');
    });

    it('has one form for 1 and another for everything else in English', () => {
        const forms = { one: 'set', other: 'sets' };

        expect([0, 1, 2, 1.5].map((n) => plural('en', n, forms))).toEqual([
            'sets',
            'set',
            'sets',
            'sets',
        ]);
    });

    it('writes decimals with a point in English and a comma in Russian, without grouping', () => {
        expect(formatNumber('en', 12.5)).toBe('12.5');
        expect(formatNumber('ru', 12.5)).toBe('12,5');
        expect(formatNumber('ru', 5230)).toBe('5230');
        expect(formatNumber('ru', 10, 1)).toBe('10,0');
    });
});
